import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { supabase } from './supabase'
import { createEntry, voidEntry, type CreateEntryParams } from './entries'
import { generateRecurringForMonth } from './recurring'
import { monthRange } from './dates'
import type { Enums, Tables, TablesInsert, Views } from './database.types'

// ---------------------------------------------------------------------------
// Tipos de filas
// ---------------------------------------------------------------------------
export type Account = Tables<'accounts'>
export type Settings = Tables<'settings'>
export type Allocation = Tables<'budget_allocations'>
export type Goal = Tables<'goals'>
export type Recurring = Tables<'recurring_templates'>
export type Balance = Views<'account_balances'>
export type MonthlyTotal = Views<'monthly_totals'>

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
  balances: ['balances'] as const,
  monthly: ['monthly_totals'] as const,
  entries: (filters: EntryFilters) => ['entries', filters] as const,
}

// Invalida todo lo que depende del ledger.
function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['entries'] })
  qc.invalidateQueries({ queryKey: qk.balances })
  qc.invalidateQueries({ queryKey: qk.monthly })
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Sesión no válida')
  return id
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------
export function useAccounts(): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: qk.accounts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('type')
        .order('name')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useSettings(): UseQueryResult<Settings | null> {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data
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
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useRecurring(): UseQueryResult<Recurring[]> {
  return useQuery({
    queryKey: qk.recurring,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_templates')
        .select('*')
        .order('description')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useBalances(): UseQueryResult<Balance[]> {
  return useQuery({
    queryKey: qk.balances,
    queryFn: async () => {
      const { data, error } = await supabase.from('account_balances').select('*')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useMonthlyTotals(): UseQueryResult<MonthlyTotal[]> {
  return useQuery({
    queryKey: qk.monthly,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_totals')
        .select('*')
        .order('month')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export type EntryFilters = {
  month: string | 'all'
  kind: Enums<'entry_kind'> | 'all'
  page: number
  pageSize: number
}

export type EntriesPage = { rows: EntryWithLines[]; count: number }

export function useEntries(filters: EntryFilters): UseQueryResult<EntriesPage> {
  return useQuery({
    queryKey: qk.entries(filters),
    queryFn: async () => {
      let q = supabase
        .from('entries')
        .select(
          'id, occurred_on, description, kind, voided_at, voids_entry_id, created_at, entry_lines(account_id, amount_cents)',
          { count: 'exact' },
        )

      if (filters.month !== 'all') {
        const { start, endExclusive } = monthRange(filters.month)
        q = q.gte('occurred_on', start).lt('occurred_on', endExclusive)
      }
      if (filters.kind !== 'all') {
        q = q.eq('kind', filters.kind)
      }

      const from = filters.page * filters.pageSize
      const to = from + filters.pageSize - 1
      q = q
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as EntryWithLines[], count: count ?? 0 }
    },
  })
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
      const { error } = await supabase.from('settings').upsert(
        {
          user_id,
          estimated_monthly_income_cents: estimatedMonthlyIncomeCents,
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
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from('accounts')
          .update({
            name: input.name,
            type: input.type,
            is_budget_bucket: input.is_budget_bucket,
          })
          .eq('id', input.id)
        if (error) throw new Error(error.message)
      } else {
        const row: TablesInsert<'accounts'> = {
          name: input.name,
          type: input.type,
          is_budget_bucket: input.is_budget_bucket,
        }
        const { error } = await supabase.from('accounts').insert(row)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.accounts })
      qc.invalidateQueries({ queryKey: qk.balances })
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
      if (input.id) {
        const { error } = await supabase
          .from('goals')
          .update({
            name: input.name,
            target_cents: input.target_cents,
            monthly_contribution_cents: input.monthly_contribution_cents,
            linked_account_id: input.linked_account_id,
          })
          .eq('id', input.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('goals').insert({
          name: input.name,
          target_cents: input.target_cents,
          monthly_contribution_cents: input.monthly_contribution_cents,
          linked_account_id: input.linked_account_id,
        })
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
      const { id, ...fields } = input
      if (id) {
        const { error } = await supabase
          .from('recurring_templates')
          .update(fields)
          .eq('id', id)
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
