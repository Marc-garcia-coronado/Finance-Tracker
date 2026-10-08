-- ============================================================================
--  MIGRACIÓN 003 — fecha límite opcional en los objetivos.
--  Aplicar en el SQL Editor de Supabase ANTES de desplegar la versión de la app
--  que la usa. Solo añade una columna nullable: no toca datos existentes.
--  Idempotente (if not exists).
--
--  La fecha límite va en claro (como entries.occurred_on): no es un importe ni
--  una descripción. La meta y la aportación siguen cifradas en cliente.
-- ============================================================================

alter table goals add column if not exists deadline date;
