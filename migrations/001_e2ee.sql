-- ============================================================================
--  MIGRACIÓN E2EE — cifrado extremo a extremo de los datos sensibles.
--  Aplicar en el SQL Editor de Supabase.  ⚠️  HAZ UN BACKUP ANTES (pg_dump).
--
--  Tras aplicarla, el servidor deja de poder sumar importes: los saldos y los
--  totales mensuales se calculan en el cliente, y los importes/descripciones/
--  nombres viajan cifrados. Es idempotente (if exists / if not exists).
-- ============================================================================

-- 1) VAULT: la clave maestra envuelta por contraseña y por código de recuperación.
create table if not exists vault (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  salt_p     text not null,
  salt_r     text not null,
  wrap_p     text not null,
  wrap_r     text not null,
  verifier   text not null,
  version    int  not null default 1,
  created_at timestamptz not null default now()
);
alter table vault enable row level security;
drop policy if exists own_rows on vault;
create policy own_rows on vault for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on vault to authenticated;

-- 2) Columnas cifradas (text con token `v1.<iv>.<ct>`).
alter table entry_lines         add column if not exists amount_enc text;
alter table settings            add column if not exists income_enc text;
alter table goals               add column if not exists target_enc text;
alter table goals               add column if not exists monthly_contribution_enc text;
alter table recurring_templates add column if not exists amount_enc text;

-- 3) Relajar restricciones que asumían importes en claro.
alter table entry_lines         alter column amount_cents drop not null;
alter table entry_lines         drop constraint if exists entry_lines_amount_cents_check;
alter table settings            alter column estimated_monthly_income_cents drop not null;
alter table goals               alter column target_cents drop not null;
alter table goals               drop constraint if exists goals_target_cents_check;
alter table goals               alter column monthly_contribution_cents drop not null;
alter table recurring_templates alter column amount_cents drop not null;
alter table recurring_templates drop constraint if exists recurring_templates_amount_cents_check;

-- El nombre de cuenta deja de ser único (el cifrado con IV aleatorio lo hace
-- inservible; la unicidad por nombre se valida en el cliente al descifrar).
alter table accounts drop constraint if exists accounts_user_id_name_key;

-- 4) Quitar el trigger e invariante de "suma 0" (la integridad la garantiza el
--    cliente al construir pares; el servidor ya no ve los importes).
drop trigger  if exists entry_lines_balance on entry_lines;
drop function if exists assert_entry_balances();

-- 5) Eliminar las vistas de agregación (se calculan en el cliente).
drop view if exists account_balances;
drop view if exists monthly_totals;

-- 6) create_entry: ahora las líneas llevan `amount_enc` (text) y NO se valida la
--    suma (no es posible sobre cifrado). Sigue siendo atómico y comprueba que las
--    cuentas son del usuario.
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
  v_count    int := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists (
      select 1 from accounts
      where id = (v_line->>'account_id')::uuid and user_id = auth.uid()
    ) then
      raise exception 'Cuenta % inexistente o ajena', v_line->>'account_id';
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count < 2 then raise exception 'Un movimiento necesita al menos 2 líneas'; end if;

  insert into entries (user_id, occurred_on, description, kind)
    values (auth.uid(), p_occurred_on, coalesce(p_description, ''), p_kind)
    returning id into v_entry_id;

  insert into entry_lines (user_id, entry_id, account_id, amount_enc)
    select auth.uid(), v_entry_id, (l->>'account_id')::uuid, l->>'amount_enc'
    from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end $$;

-- 7) void_entry: el cliente pasa las líneas YA negadas y recifradas; el servidor
--    crea el inverso (con voids_entry_id) y marca el original anulado, atómico.
drop function if exists void_entry(uuid);
create or replace function void_entry(p_entry_id uuid, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new  uuid;
  v_kind entry_kind;
  v_date date;
begin
  if not exists (
    select 1 from entries
    where id = p_entry_id and user_id = auth.uid() and voided_at is null
  ) then
    raise exception 'Movimiento inexistente o ya anulado';
  end if;

  select kind, occurred_on into v_kind, v_date from entries where id = p_entry_id;

  insert into entries (user_id, occurred_on, description, kind, voids_entry_id)
    values (auth.uid(), v_date, 'Anulación', v_kind, p_entry_id)
    returning id into v_new;

  insert into entry_lines (user_id, entry_id, account_id, amount_enc)
    select auth.uid(), v_new, (l->>'account_id')::uuid, l->>'amount_enc'
    from jsonb_array_elements(p_lines) l;

  update entries set voided_at = now() where id = p_entry_id;
  return v_new;
end $$;

-- 8) Grants de las funciones.
grant execute on function create_entry(date, text, entry_kind, jsonb) to authenticated;
grant execute on function void_entry(uuid, jsonb) to authenticated;
revoke execute on function create_entry(date, text, entry_kind, jsonb) from anon;
revoke execute on function void_entry(uuid, jsonb) from anon;
