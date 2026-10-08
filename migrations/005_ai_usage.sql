-- ============================================================================
--  MIGRACIÓN 005 — límite diario de uso del dictado por voz con IA.
--  Aplicar en el SQL Editor de Supabase ANTES de desplegar la Edge Function
--  `parse-movements`. Solo añade una tabla y una función: no toca datos.
--  Idempotente.
--
--  ai_usage guarda ÚNICAMENTE un contador por usuario y día. Nunca el texto
--  dictado, ni importes, ni la respuesta de la IA. El usuario solo puede leer
--  su contador; el incremento lo hace take_ai_quota() (security definer), así
--  que no puede reiniciarlo desde el cliente.
-- ============================================================================

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

drop policy if exists own_rows on ai_usage;
drop policy if exists own_select on ai_usage;
create policy own_select on ai_usage for select using (user_id = auth.uid());

revoke all on ai_usage from authenticated;
grant select on ai_usage to authenticated;
revoke all on ai_usage from anon;

-- Consume 1 uso del día del usuario autenticado. Devuelve true si aún estaba
-- dentro del límite (p_limit peticiones/día) y false si ya lo ha superado.
create or replace function take_ai_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   integer;
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;

  insert into ai_usage as u (user_id, day, count)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;

  return n <= p_limit;
end $$;

revoke execute on function take_ai_quota(integer) from public, anon;
grant execute on function take_ai_quota(integer) to authenticated;
