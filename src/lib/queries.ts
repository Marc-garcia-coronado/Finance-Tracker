import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { supabase } from './supabase'
import { fetchAll } from './fetchAll'
import {
  adjustAccountBalance,
  createEntry,
  replaceEntry,
  voidEntry,
  type CreateEntryParams,
} from './entries'
import { generateRecurringForMonth } from './recurring'
import { monthRange, todayISO } from './dates'
import { requireSessionKey } from './crypto/session'
import { decryptCents, decryptString, encryptCents, encryptString } from './crypto/webcrypto'
import type { Enums, Tables } from './database.types'
import type { MonthlyTotalRow, NetWorthPoint } from './metrics'
import {
  accountIdsWithMovements,
  liveLedgerLines,
  balancesFromLedger,
  monthlyTotalsFromLedger,
  netWorthFromLedger,
  type Balance,
  type Ledger,
} from './ledger'
import { checkIntegrity, type IntegrityEntry, type IntegrityLine, type IntegrityProblem } from './integrity'

// ---------------------------------------------------------------------------
// Tipos de filas (versión DESCIFRADA: lo que ven los componentes).
// ---------------------------------------------------------------------------
export type Account = Tables<'accounts'> // name ya descifrado
export type Allocation = Tables<'budget_allocations'>
export type Settings = {
  user_id: string
  estimated_monthly_income_cents: number
  updated_at: string
}
export type Goal = {
  id: string
  user_id: string
  name: string
  target_cents: number
  monthly_contribution_cents: number
  linked_account_id: string | null
  created_at: string
}
export type Recurring = {
  id: string
  user_id: string
  description: string
  amount_cents: number
  from_account_id: string
  to_account_id: string
  kind: Enums<'entry_kind'>
  cadence: Enums<'cadence'>
  day_of_month: number
  next_run_on: string
  is_active: boolean
  created_at: string
}
export type { Balance }
export type MonthlyTotal = MonthlyTotalRow

export type EntryWithLines = {
  id: string
  occurred_on: string
  description: string
  kind: Enums<'entry_kind'>
  voided_at: string | null
  voids_entry_id: string | null
  created_at: string
  entry_lines: { account_id: string; amount_cents: number }[]
}

// ---------------------------------------------------------------------------
// Claves de query
// ---------------------------------------------------------------------------
export const qk = {
  accounts: ['accounts'] as const,
  settings: ['settings'] as const,
  allocations: ['allocations'] as const,
  goals: ['goals'] as const,
  recurring: ['recurring'] as const,
  ledger: ['ledger'] as const,
  entries: (filters: EntryFilters) => ['entries', filters] as const,
}

function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['entries'] })
  qc.invalidateQueries({ queryKey: qk.ledger })
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Sesión no válida')
  return id
}

// ---------------------------------------------------------------------------
// Agregación del ledger en cliente (sustituye a las vistas SQL eliminadas).
// ---------------------------------------------------------------------------
// Carga y descifra el ledger completo. Se hace UNA vez (query qk.ledger) y
// saldos, totales mensuales y patrimonio se derivan con `select`.
async function loadLedger(key: CryptoKey): Promise<Ledger> {
  const [accountRows, entries, lines] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from('accounts').select('id, name, type').order('id').range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from('entries')
        .select('id, occurred_on, kind, voided_at, voids_entry_id')
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from('entry_lines')
        .select('entry_id, account_id, amount_enc, amount_cents')
        .order('id')
        .range(from, to),
    ),
  ])

  const liveLines = await liveLedgerLines(entries, lines, (enc) => decryptCents(key, enc))
  const accounts = await Promise.all(
    accountRows.map(async (a) => ({ id: a.id, name: await decryptString(key, a.name), type: a.type })),
  )
  return { accounts, lines: liveLines }
}

const ledgerQuery = {
  queryKey: qk.ledger,
  queryFn: () => loadLedger(requireSessionKey()),
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------
export function useAccounts(): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: qk.accounts,
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*')
      if (error) throw new Error(error.message)
      const key = requireSessionKey()
      const rows = await Promise.all(
        (data ?? []).map(async (a) => ({ ...a, name: await decryptString(key, a.name) })),
      )
      // El orden por nombre se hace en cliente (en BD el nombre va cifrado).
      return rows.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    },
  })
}

export function useSettings(): UseQueryResult<Settings | null> {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const key = requireSessionKey()
      const cents =
        data.income_enc != null
          ? await decryptCents(key, data.income_enc)
          : (data.estimated_monthly_income_cents ?? 0)
      return {
        user_id: data.user_id,
        estimated_monthly_income_cents: cents,
        updated_at: data.updated_at,
      }
    },
  })
}

export function useAllocations(): UseQueryResult<Allocation[]> {
  return useQuery({
    queryKey: qk.allocations,
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_allocations').select('*')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useGoals(): UseQueryResult<Goal[]> {
  return useQuery({
    queryKey: qk.goals,
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').order('created_at')
      if (error) throw new Error(error.message)
      const key = requireSessionKey()
      return Promise.all(
        (data ?? []).map(async (g) => ({
          id: g.id,
          user_id: g.user_id,
          name: await decryptString(key, g.name),
          target_cents: g.target_enc != null ? await decryptCents(key, g.target_enc) : (g.target_cents ?? 0),
          monthly_contribution_cents:
            g.monthly_contribution_enc != null
              ? await decryptCents(key, g.monthly_contribution_enc)
              : (g.monthly_contribution_cents ?? 0),
          linked_account_id: g.linked_account_id,
          created_at: g.created_at,
        })),
      )
    },
  })
}

export function useRecurring(): UseQueryResult<Recurring[]> {
  return useQuery({
    queryKey: qk.recurring,
    queryFn: async () => {
      const { data, error } = await supabase.from('recurring_templates').select('*')
      if (error) throw new Error(error.message)
      const key = requireSessionKey()
      const rows = await Promise.all(
        (data ?? []).map(async (r) => ({
          id: r.id,
          user_id: r.user_id,
          description: await decryptString(key, r.description),
          amount_cents: r.amount_enc != null ? await decryptCents(key, r.amount_enc) : (r.amount_cents ?? 0),
          from_account_id: r.from_account_id,
          to_account_id: r.to_account_id,
          kind: r.kind,
          cadence: r.cadence,
          day_of_month: r.day_of_month,
          next_run_on: r.next_run_on,
          is_active: r.is_active,
          created_at: r.created_at,
        })),
      )
      return rows.sort((a, b) => a.description.localeCompare(b.description))
    },
  })
}

// Los tres comparten qk.ledger: react-query hace una sola carga y cada hook
// deriva su vista. Los `select` son funciones de módulo (referencia estable),
// así que solo se recalculan cuando cambia el ledger.
export function useBalances(): UseQueryResult<Balance[]> {
  return useQuery({ ...ledgerQuery, select: balancesFromLedger })
}

// Cuentas con movimientos (su tipo no se puede cambiar).
export function useAccountIdsWithMovements(): UseQueryResult<Set<string>> {
  return useQuery({ ...ledgerQuery, select: accountIdsWithMovements })
}

export function useMonthlyTotals(): UseQueryResult<MonthlyTotal[]> {
  return useQuery({ ...ledgerQuery, select: monthlyTotalsFromLedger })
}

// Patrimonio neto a fin de cada mes (suma acumulada de las cuentas de activo).
export function useNetWorthHistory(): UseQueryResult<NetWorthPoint[]> {
  return useQuery({ ...ledgerQuery, select: netWorthFromLedger })
}

// Filtros que aplica el servidor (el texto de búsqueda se filtra en cliente).
export type EntryQueryFilters = {
  month: string | 'all'
  kind: Enums<'entry_kind'> | 'all'
  accountId: string | 'all'
  hideVoided: boolean
}

export type EntryFilters = EntryQueryFilters & {
  page: number
  pageSize: number
}

export type EntriesPage = { rows: EntryWithLines[]; count: number }

type RawEntry = {
  id: string
  occurred_on: string
  description: string
  kind: Enums<'entry_kind'>
  voided_at: string | null
  voids_entry_id: string | null
  created_at: string
  entry_lines: { account_id: string; amount_cents: number | null; amount_enc: string | null }[]
}

const ENTRY_COLUMNS =
  'id, occurred_on, description, kind, voided_at, voids_entry_id, created_at, entry_lines(account_id, amount_cents, amount_enc)'

// Consulta de movimientos con los filtros del servidor, ordenada de más reciente
// a más antiguo. El filtro por cuenta usa un 2º embed con alias (!inner) para
// que `entry_lines` siga trayendo las DOS líneas del movimiento.
function entriesQuery(filters: EntryQueryFilters, count?: 'exact') {
  const columns =
    filters.accountId !== 'all' ? `${ENTRY_COLUMNS}, filter_lines:entry_lines!inner(account_id)` : ENTRY_COLUMNS
  let q = supabase.from('entries').select(columns, count ? { count } : undefined)

  if (filters.month !== 'all') {
    const { start, endExclusive } = monthRange(filters.month)
    q = q.gte('occurred_on', start).lt('occurred_on', endExclusive)
  }
  if (filters.kind !== 'all') q = q.eq('kind', filters.kind)
  if (filters.accountId !== 'all') q = q.eq('filter_lines.account_id', filters.accountId)
  // Oculta el par completo: el anulado y su anulación.
  if (filters.hideVoided) q = q.is('voided_at', null).is('voids_entry_id', null)

  return q
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id')
}

async function decryptEntryRow(key: CryptoKey, e: unknown): Promise<EntryWithLines> {
  const raw = e as RawEntry
  return {
    id: raw.id,
    occurred_on: raw.occurred_on,
    description: await decryptString(key, raw.description),
    kind: raw.kind,
    voided_at: raw.voided_at,
    voids_entry_id: raw.voids_entry_id,
    created_at: raw.created_at,
    entry_lines: await Promise.all(
      (raw.entry_lines ?? []).map(async (l) => ({
        account_id: l.account_id,
        amount_cents: l.amount_enc != null ? await decryptCents(key, l.amount_enc) : (l.amount_cents ?? 0),
      })),
    ),
  }
}

// Una página de movimientos (sin búsqueda de texto): paginación en servidor.
export function useEntries(filters: EntryFilters, enabled = true): UseQueryResult<EntriesPage> {
  return useQuery({
    queryKey: qk.entries(filters),
    enabled,
    queryFn: async () => {
      const from = filters.page * filters.pageSize
      const { data, error, count } = await entriesQuery(filters, 'exact').range(
        from,
        from + filters.pageSize - 1,
      )
      if (error) throw new Error(error.message)

      const key = requireSessionKey()
      const rows = await Promise.all((data ?? []).map((e) => decryptEntryRow(key, e)))
      return { rows, count: count ?? 0 }
    },
  })
}

// TODOS los movimientos que cumplen los filtros del servidor, descifrados, para
// buscar por texto en cliente. La clave no incluye el texto: escribir no recarga.
export function useEntriesForSearch(
  filters: EntryQueryFilters,
  enabled: boolean,
): UseQueryResult<EntryWithLines[]> {
  return useQuery({
    queryKey: ['entries', 'search', filters],
    enabled,
    queryFn: () => fetchAllEntries(filters),
  })
}

// Todos los movimientos que cumplen los filtros, descifrados (búsqueda y exportación).
export async function fetchAllEntries(filters: EntryQueryFilters): Promise<EntryWithLines[]> {
  const data = await fetchAll((from, to) => entriesQuery(filters).range(from, to))
  const key = requireSessionKey()
  return Promise.all(data.map((e) => decryptEntryRow(key, e)))
}

// ---------------------------------------------------------------------------
// Mutaciones — ledger
// ---------------------------------------------------------------------------
export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateEntryParams) => createEntry(params),
    onSuccess: () => invalidateLedger(qc),
  })
}

export function useVoidEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => voidEntry(id),
    onSuccess: () => invalidateLedger(qc),
  })
}

export function useReplaceEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: CreateEntryParams }) => replaceEntry(id, params),
    onSuccess: () => invalidateLedger(qc),
  })
}

export type ImportResult = {
  created: number
  failed: { index: number; description: string; message: string }[]
}

export function useImportMovements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      entries: CreateEntryParams[]
      onProgress?: (done: number, total: number) => void
    }): Promise<ImportResult> => {
      const { entries, onProgress } = args
      const failed: ImportResult['failed'] = []
      let created = 0
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!
        try {
          await createEntry(e)
          created++
        } catch (err) {
          failed.push({
            index: i,
            description: e.description,
            message: err instanceof Error ? err.message : 'Error desconocido',
          })
        }
        onProgress?.(i + 1, entries.length)
      }
      return { created, failed }
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

// Cuenta de contrapartida donde se acumulan las revalorizaciones (plusvalías y
// minusvalías). Excluida del consumo (los asientos 'adjustment' no entran en
// monthly_totals) y no aparece en Patrimonio (solo activos).
export const ADJUSTMENT_ACCOUNT_NAME = 'Ajustes de valor'

async function ensureAdjustmentAccount(): Promise<string> {
  const key = requireSessionKey()
  const { data, error } = await supabase.from('accounts').select('id, name')
  if (error) throw new Error(error.message)
  for (const a of data ?? []) {
    if ((await decryptString(key, a.name)) === ADJUSTMENT_ACCOUNT_NAME) return a.id
  }
  const { data: created, error: insertError } = await supabase
    .from('accounts')
    .insert({ name: await encryptString(key, ADJUSTMENT_ACCOUNT_NAME), type: 'income', is_budget_bucket: false })
    .select('id')
    .single()
  if (insertError) throw new Error(insertError.message)
  return created.id
}

export function useAdjustBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      accountId: string
      targetCents: number
      currentCents: number
      description?: string
    }) => {
      const delta = input.targetCents - input.currentCents
      if (delta === 0) throw new Error('El saldo ya coincide; no hay nada que ajustar')
      const counterId = await ensureAdjustmentAccount()
      if (counterId === input.accountId) {
        throw new Error('No se puede ajustar la cuenta de ajustes')
      }
      return adjustAccountBalance({
        accountId: input.accountId,
        counterAccountId: counterId,
        deltaCents: delta,
        date: todayISO(),
        description: input.description?.trim() || 'Ajuste de saldo',
      })
    },
    onSuccess: () => {
      invalidateLedger(qc)
      qc.invalidateQueries({ queryKey: qk.accounts })
    },
  })
}

// ---------------------------------------------------------------------------
// Verificación de integridad (bajo demanda, desde Config)
// ---------------------------------------------------------------------------
export type IntegrityResult = { checkedEntries: number; problems: IntegrityProblem[] }

// A diferencia de decryptCents, NO devuelve 0 si falla: null para poder reportarlo.
async function decryptLineStrict(key: CryptoKey, enc: string | null, plain: number | null): Promise<number | null> {
  if (enc == null) return plain
  try {
    const n = Number(await decryptString(key, enc))
    return Number.isInteger(n) ? n : null
  } catch {
    return null
  }
}

async function runIntegrityCheck(key: CryptoKey): Promise<IntegrityResult> {
  const [entries, lines] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from('entries')
        .select('id, occurred_on, description, voided_at, voids_entry_id')
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from('entry_lines')
        .select('entry_id, account_id, amount_enc, amount_cents')
        .order('id')
        .range(from, to),
    ),
  ])

  const linesByEntry = new Map<string, IntegrityLine[]>()
  await Promise.all(
    lines.map(async (l) => {
      const decoded: IntegrityLine = {
        account_id: l.account_id,
        cents: await decryptLineStrict(key, l.amount_enc, l.amount_cents),
        encrypted: l.amount_enc != null,
      }
      const list = linesByEntry.get(l.entry_id)
      if (list) list.push(decoded)
      else linesByEntry.set(l.entry_id, [decoded])
    }),
  )

  const items: IntegrityEntry[] = await Promise.all(
    entries.map(async (e) => ({
      id: e.id,
      occurred_on: e.occurred_on,
      description: await decryptString(key, e.description).catch(() => '(no se pudo descifrar)'),
      voided_at: e.voided_at,
      voids_entry_id: e.voids_entry_id,
      lines: linesByEntry.get(e.id) ?? [],
    })),
  )

  return { checkedEntries: items.length, problems: checkIntegrity(items) }
}

export function useCheckIntegrity() {
  return useMutation({ mutationFn: () => runIntegrityCheck(requireSessionKey()) })
}

export function useGenerateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (month: string) => generateRecurringForMonth(month),
    onSuccess: () => {
      invalidateLedger(qc)
      qc.invalidateQueries({ queryKey: qk.recurring })
    },
  })
}

// ---------------------------------------------------------------------------
// Mutaciones — configuración
// ---------------------------------------------------------------------------
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (estimatedMonthlyIncomeCents: number) => {
      const user_id = await requireUserId()
      const key = requireSessionKey()
      const { error } = await supabase.from('settings').upsert(
        {
          user_id,
          income_enc: await encryptCents(key, estimatedMonthlyIncomeCents),
          estimated_monthly_income_cents: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  })
}

export function useSaveAllocations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { account_id: string; percent: number }[]) => {
      const user_id = await requireUserId()
      const rows = items.map((i) => ({
        user_id,
        account_id: i.account_id,
        percent: i.percent,
      }))
      const { error } = await supabase
        .from('budget_allocations')
        .upsert(rows, { onConflict: 'user_id,account_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.allocations }),
  })
}

export function useSaveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      name: string
      type: Enums<'account_type'>
      is_budget_bucket: boolean
    }): Promise<string> => {
      const key = requireSessionKey()
      const encName = await encryptString(key, input.name)
      if (input.id) {
        const { error } = await supabase
          .from('accounts')
          .update({ name: encName, type: input.type, is_budget_bucket: input.is_budget_bucket })
          .eq('id', input.id)
        if (error) throw new Error(error.message)
        return input.id
      }
      const { data, error } = await supabase
        .from('accounts')
        .insert({ name: encName, type: input.type, is_budget_bucket: input.is_budget_bucket })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts })
      qc.invalidateQueries({ queryKey: qk.ledger })
    },
  })
}

export function useArchiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('accounts')
        .update({ is_archived: archived })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  })
}

// ---------------------------------------------------------------------------
// Mutaciones — objetivos
// ---------------------------------------------------------------------------
export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      name: string
      target_cents: number
      monthly_contribution_cents: number
      linked_account_id: string | null
    }) => {
      const key = requireSessionKey()
      const fields = {
        name: await encryptString(key, input.name),
        target_enc: await encryptCents(key, input.target_cents),
        monthly_contribution_enc: await encryptCents(key, input.monthly_contribution_cents),
        target_cents: null,
        monthly_contribution_cents: null,
        linked_account_id: input.linked_account_id,
      }
      if (input.id) {
        const { error } = await supabase.from('goals').update(fields).eq('id', input.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('goals').insert(fields)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  })
}

// ---------------------------------------------------------------------------
// Mutaciones — recurrentes (plantillas)
// ---------------------------------------------------------------------------
export function useSaveRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      description: string
      amount_cents: number
      from_account_id: string
      to_account_id: string
      kind: Enums<'entry_kind'>
      cadence: Enums<'cadence'>
      day_of_month: number
      next_run_on: string
      is_active: boolean
    }) => {
      const key = requireSessionKey()
      const { id, amount_cents, description, ...rest } = input
      const fields = {
        ...rest,
        description: await encryptString(key, description),
        amount_enc: await encryptCents(key, amount_cents),
        amount_cents: null,
      }
      if (id) {
        const { error } = await supabase.from('recurring_templates').update(fields).eq('id', id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('recurring_templates').insert(fields)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}
