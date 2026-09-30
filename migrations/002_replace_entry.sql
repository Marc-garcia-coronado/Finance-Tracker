-- ============================================================================
--  MIGRACIÓN 002 — editar un movimiento de forma atómica.
--  Aplicar en el SQL Editor de Supabase. Solo añade una función: no toca datos.
--  Idempotente (create or replace).
--
--  replace_entry = void_entry + create_entry en UNA transacción: si la creación
--  del movimiento corregido falla, la anulación del original también se deshace
--  (nunca queda un movimiento anulado sin su sustituto). Reutiliza todas las
--  validaciones de las dos funciones (propiedad, no anulado, cuentas, >= 2 líneas).
--  Los importes llegan ya cifrados desde el cliente (E2EE).
-- ============================================================================

create or replace function replace_entry(
  p_entry_id    uuid,
  p_void_lines  jsonb,
  p_occurred_on date,
  p_description text,
  p_kind        entry_kind,
  p_lines       jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform void_entry(p_entry_id, p_void_lines);
  return create_entry(p_occurred_on, p_description, p_kind, p_lines);
end $$;

grant execute on function replace_entry(uuid, jsonb, date, text, entry_kind, jsonb) to authenticated;
revoke execute on function replace_entry(uuid, jsonb, date, text, entry_kind, jsonb) from anon;
