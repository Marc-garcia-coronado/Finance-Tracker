-- ============================================================================
--  FINANZAS PERSONALES — Esquema de base de datos (Supabase / Postgres 15+)
--  Modelo: partida doble ligera. Cada movimiento (entry) tiene >= 2 líneas
--  (entry_lines) cuyo amount_cents SUMA 0. El dinero se guarda SIEMPRE en
--  céntimos (bigint), nunca en float.
--
--  Convención de signo en entry_lines.amount_cents:
--    +  => entra dinero en esa cuenta
--    -  => sale dinero de esa cuenta
--  Saldo de una cuenta = SUM(amount_cents) de sus líneas (asientos no anulados).
--
--  Ejemplos:
--    Gasto 20€ de ocio:   Cuenta corriente -2000 / Gasto:Ocio +2000
--    Nómina 1800€:        Cuenta corriente +180000 / Ingreso:Trabajo -180000
--    Traspaso a inversión: Cuenta corriente -20000 / Inversión +20000  (patrimonio igual)
--
--  Cómo aplicar: pega todo este archivo en el SQL Editor de Supabase y ejecuta.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin
  create type account_type as enum ('asset', 'income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_kind as enum ('income', 'expense', 'transfer', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cadence as enum ('monthly', 'annual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- CUENTAS
--   asset   = cuentas reales del Patrimonio (Cuenta corriente, Fondo, Inversión, Objetivos-Coche)
--   income  = orígenes de ingreso (Trabajo, Otros)
--   expense = categorías de gasto real (Necesidades, Ocio)
--   is_budget_bucket marca las cuentas usadas en la asignación por %.
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  type             account_type not null,
  is_budget_bucket boolean not null default false,
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists accounts_user_idx on accounts (user_id);

-- ---------------------------------------------------------------------------
-- MOVIMIENTOS (cabecera)
--   voided_at / voids_entry_id implementan el ledger append-only: nunca se
--   borra ni edita un asiento; se anula creando uno inverso.
-- ---------------------------------------------------------------------------
create table if not exists entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on    date not null,
  description    text not null default '',
  kind           entry_kind not null,
  voided_at      timestamptz,
  voids_entry_id uuid references entries(id),
  created_at     timestamptz not null default now()
);
create index if not exists entries_user_date_idx on entries (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- LÍNEAS DE MOVIMIENTO (las dos patas)
--   user_id está denormalizado solo para que RLS sea trivial y rápido.
-- ---------------------------------------------------------------------------
create table if not exists entry_lines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id     uuid not null references entries(id) on delete cascade,
  account_id   uuid not null references accounts(id),
  amount_cents bigint not null check (amount_cents <> 0),
  created_at   timestamptz not null default now()
);
create index if not exists entry_lines_entry_idx   on entry_lines (entry_id);
create index if not exists entry_lines_account_idx on entry_lines (account_id);

-- ---------------------------------------------------------------------------
-- INVARIANTE: las líneas de un asiento suman 0 y hay al menos 2.
--   Trigger DEFERRED para permitir insertar varias líneas en una transacción.
-- ---------------------------------------------------------------------------
create or replace function assert_entry_balances() returns trigger
language plpgsql as $$
declare
  v_entry uuid;
  v_sum   bigint;
  v_count int;
begin
  v_entry := coalesce(new.entry_id, old.entry_id);
  select coalesce(sum(amount_cents), 0), count(*)
    into v_sum, v_count
    from entry_lines where entry_id = v_entry;

  -- Si el asiento se borró entero (cascade), no hay nada que validar.
  if v_count = 0 then
    return null;
  end if;
  if v_count < 2 then
    raise exception 'El asiento % debe tener al menos 2 líneas', v_entry;
  end if;
  if v_sum <> 0 then
    raise exception 'Las líneas del asiento % deben sumar 0 (suma actual: %)', v_entry, v_sum;
  end if;
  return null;
end $$;

drop trigger if exists entry_lines_balance on entry_lines;
create constraint trigger entry_lines_balance
  after insert or update or delete on entry_lines
  deferrable initially deferred
  for each row execute function assert_entry_balances();

-- ---------------------------------------------------------------------------
-- CONFIGURACIÓN
-- ---------------------------------------------------------------------------
create table if not exists settings (
  user_id                        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  estimated_monthly_income_cents bigint not null default 0,
  updated_at                     timestamptz not null default now()
);

-- Asignación por % de la nómina hacia cada bucket (necesidades, ocio, inversión, fondo, objetivos)
create table if not exists budget_allocations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  percent    numeric(5,2) not null check (percent >= 0 and percent <= 100),
  unique (user_id, account_id)
);

-- ---------------------------------------------------------------------------
-- OBJETIVOS DE AHORRO
--   El saldo actual del objetivo = saldo de linked_account_id (una cuenta asset).
-- ---------------------------------------------------------------------------
create table if not exists goals (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                       text not null,
  target_cents               bigint not null check (target_cents > 0),
  monthly_contribution_cents bigint not null default 0,
  linked_account_id          uuid references accounts(id),
  created_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- GASTOS RECURRENTES (plantillas que generan asientos)
--   El "suelo de necesidades" = SUM(amount_cents) de las plantillas activas
--   cuya to_account sea la categoría Necesidades.
-- ---------------------------------------------------------------------------
create table if not exists recurring_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description     text not null,
  amount_cents    bigint not null check (amount_cents > 0),
  from_account_id uuid not null references accounts(id),
  to_account_id   uuid not null references accounts(id),
  kind            entry_kind not null default 'expense',
  cadence         cadence not null default 'monthly',
  day_of_month    int not null default 1 check (day_of_month between 1 and 28),
  next_run_on     date not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- VISTAS DERIVADAS (security_invoker => respetan RLS del usuario que consulta)
-- ============================================================================

-- Patrimonio: saldo de cada cuenta. NO se introduce a mano, se deriva.
create or replace view account_balances with (security_invoker = on) as
select a.id        as account_id,
       a.user_id,
       a.name,
       a.type,
       coalesce(sum(el.amount_cents), 0) as balance_cents
from accounts a
left join entry_lines el on el.account_id = a.id
left join entries e on e.id = el.entry_id and e.voided_at is null
group by a.id, a.user_id, a.name, a.type;

-- Resumen mensual por cuenta (para páginas Mensual y Dashboard).
create or replace view monthly_totals with (security_invoker = on) as
select e.user_id,
       date_trunc('month', e.occurred_on)::date as month,
       a.id   as account_id,
       a.name,
       a.type,
       sum(el.amount_cents) as total_cents
from entries e
join entry_lines el on el.entry_id = e.id
join accounts a on a.id = el.account_id
where e.voided_at is null
group by e.user_id, date_trunc('month', e.occurred_on), a.id, a.name, a.type;

-- ============================================================================
-- FUNCIONES RPC (única vía para crear/anular movimientos)
-- ============================================================================

-- Crea un movimiento con sus líneas de forma atómica y validada.
-- p_lines: jsonb tipo [{"account_id":"...","amount_cents":-2000}, {...:+2000}]
create or replace function create_entry(
  p_occurred_on date,
  p_description  text,
  p_kind         entry_kind,
  p_lines        jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry_id uuid;
  v_line     jsonb;
  v_sum      bigint := 0;
  v_account  uuid;
  v_amount   bigint;
  v_count    int := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_account := (v_line->>'account_id')::uuid;
    v_amount  := (v_line->>'amount_cents')::bigint;
    if v_amount = 0 then
      raise exception 'Una línea no puede tener importe 0';
    end if;
    if not exists (select 1 from accounts where id = v_account and user_id = auth.uid()) then
      raise exception 'Cuenta % inexistente o ajena', v_account;
    end if;
    v_sum := v_sum + v_amount;
    v_count := v_count + 1;
  end loop;

  if v_count < 2 then
    raise exception 'Un movimiento necesita al menos 2 líneas';
  end if;
  if v_sum <> 0 then
    raise exception 'Las líneas deben sumar 0 (suma: %)', v_sum;
  end if;

  insert into entries (user_id, occurred_on, description, kind)
    values (auth.uid(), p_occurred_on, coalesce(p_description, ''), p_kind)
    returning id into v_entry_id;

  insert into entry_lines (user_id, entry_id, account_id, amount_cents)
    select auth.uid(), v_entry_id, (l->>'account_id')::uuid, (l->>'amount_cents')::bigint
    from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end $$;

-- Anula un movimiento creando su inverso (append-only). No borra nada.
create or replace function void_entry(p_entry_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
begin
  if not exists (
    select 1 from entries
    where id = p_entry_id and user_id = auth.uid() and voided_at is null
  ) then
    raise exception 'Movimiento inexistente o ya anulado';
  end if;

  insert into entries (user_id, occurred_on, description, kind, voids_entry_id)
    select auth.uid(), current_date, 'Anulación de ' || p_entry_id, kind, p_entry_id
    from entries where id = p_entry_id
    returning id into v_new;

  insert into entry_lines (user_id, entry_id, account_id, amount_cents)
    select auth.uid(), v_new, account_id, -amount_cents
    from entry_lines where entry_id = p_entry_id;

  update entries set voided_at = now() where id = p_entry_id;
  return v_new;
end $$;

-- Siembra las cuentas, asignaciones y settings por defecto del usuario actual.
-- Llamar UNA vez tras el primer login:  select seed_default_accounts();
create or replace function seed_default_accounts() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;

  insert into accounts (user_id, name, type, is_budget_bucket) values
    (uid, 'Cuenta corriente', 'asset',   false),
    (uid, 'Fondo emergencia', 'asset',   true),
    (uid, 'Inversión',        'asset',   true),
    (uid, 'Objetivos-Coche',  'asset',   true),
    (uid, 'Trabajo',          'income',  false),
    (uid, 'Otros',            'income',  false),
    (uid, 'Necesidades',      'expense', true),
    (uid, 'Ocio',             'expense', true)
  on conflict (user_id, name) do nothing;

  insert into settings (user_id, estimated_monthly_income_cents)
    values (uid, 0)
  on conflict (user_id) do nothing;

  -- Asignación por defecto: 15/15/40/20/10
  insert into budget_allocations (user_id, account_id, percent)
  select uid, a.id,
    case a.name
      when 'Necesidades'      then 15
      when 'Ocio'             then 15
      when 'Inversión'        then 40
      when 'Fondo emergencia' then 20
      when 'Objetivos-Coche'  then 10
    end
  from accounts a
  where a.user_id = uid
    and a.name in ('Necesidades','Ocio','Inversión','Fondo emergencia','Objetivos-Coche')
  on conflict (user_id, account_id) do nothing;
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table accounts            enable row level security;
alter table entries             enable row level security;
alter table entry_lines         enable row level security;
alter table settings            enable row level security;
alter table budget_allocations  enable row level security;
alter table goals               enable row level security;
alter table recurring_templates enable row level security;

-- Política única por tabla: el usuario solo ve/escribe sus propias filas.
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','entries','entry_lines','settings',
    'budget_allocations','goals','recurring_templates'
  ] loop
    execute format('drop policy if exists own_rows on %I', t);
    execute format(
      'create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- GRANTS para el rol authenticated (RLS sigue restringiendo por fila)
-- ============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on account_balances, monthly_totals to authenticated;

grant execute on function create_entry(date, text, entry_kind, jsonb) to authenticated;
grant execute on function void_entry(uuid) to authenticated;
grant execute on function seed_default_accounts() to authenticated;

-- Bloquea el acceso anónimo a las funciones sensibles.
revoke execute on function create_entry(date, text, entry_kind, jsonb) from anon;
revoke execute on function void_entry(uuid) from anon;
revoke execute on function seed_default_accounts() from anon;
