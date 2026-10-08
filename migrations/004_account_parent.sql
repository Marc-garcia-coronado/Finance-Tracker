-- ============================================================================
--  MIGRACIÓN 004 — subcategorías de gasto agrupadas por bucket.
--  Aplicar en el SQL Editor de Supabase ANTES de desplegar la versión de la app
--  que la usa. Solo añade una columna nullable: no toca datos existentes.
--  Idempotente (if not exists).
--
--  accounts.parent_id apunta al bucket (categoría de gasto con is_budget_bucket)
--  del que cuelga la subcategoría. Si se borra el padre, la subcategoría queda
--  suelta (on delete set null) en vez de borrarse con sus movimientos.
--  Las reglas (un solo nivel, padre = bucket de gasto) las valida el cliente.
-- ============================================================================

alter table accounts
  add column if not exists parent_id uuid references accounts(id) on delete set null;

create index if not exists accounts_parent_id_idx on accounts (parent_id);
