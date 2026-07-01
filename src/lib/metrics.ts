// ---------------------------------------------------------------------------
// Cálculos derivados. Funciones puras sobre los datos ya cargados.
// Reglas clave del modelo de partida doble:
//   - Cuentas income: sus líneas son negativas. Ingreso = -SUM.
//   - Cuentas expense: sus líneas son positivas. Gasto = +SUM.
//   - Los traspasos son asset->asset: NO tocan income/expense, así que quedan
//     fuera del flujo neto de consumo de forma natural.
// Todo en céntimos enteros.
// ---------------------------------------------------------------------------
import type { Enums, Tables } from './database.types'

type Account = Tables<'accounts'>

// Fila equivalente a la antigua vista monthly_totals, pero reconstruida en el
// cliente tras descifrar (el servidor ya no puede sumar importes cifrados).
export type MonthlyTotalRow = {
  month: string
  account_id: string
  name: string
  type: Enums<'account_type'>
  total_cents: number
}
type MonthlyTotal = MonthlyTotalRow

// Plantilla recurrente con el importe ya descifrado.
type Recurring = { is_active: boolean; to_account_id: string; amount_cents: number }

export type CategoryAmount = { accountId: string; name: string; cents: number }
export type Consumo = { incomeCents: number; expenseCents: number; netCents: number }

export function accountsById(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]))
}

// Ingresos por categoría (cuentas income) en un mes.
export function incomeByCategory(
  totals: MonthlyTotal[],
  month: string,
): CategoryAmount[] {
  return totals
    .filter((t) => t.month === month && t.type === 'income')
    .map((t) => ({ accountId: t.account_id ?? '', name: t.name ?? '', cents: -(t.total_cents ?? 0) }))
    .filter((c) => c.cents !== 0)
    .sort((a, b) => b.cents - a.cents)
}

// Gastos por categoría (cuentas expense) en un mes.
export function expenseByCategory(
  totals: MonthlyTotal[],
  month: string,
): CategoryAmount[] {
  return totals
    .filter((t) => t.month === month && t.type === 'expense')
    .map((t) => ({ accountId: t.account_id ?? '', name: t.name ?? '', cents: t.total_cents ?? 0 }))
    .filter((c) => c.cents !== 0)
    .sort((a, b) => b.cents - a.cents)
}

// Flujo de consumo de un mes concreto.
export function monthlyConsumo(totals: MonthlyTotal[], month: string): Consumo {
  let incomeCents = 0
  let expenseCents = 0
  for (const t of totals) {
    if (t.month !== month) continue
    if (t.type === 'income') incomeCents += -(t.total_cents ?? 0)
    else if (t.type === 'expense') expenseCents += t.total_cents ?? 0
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

// Flujo de consumo acumulado de un año (todos sus meses 'YYYY-MM').
export function yearConsumo(totals: MonthlyTotal[], year: number): Consumo {
  const prefix = `${year}-`
  let incomeCents = 0
  let expenseCents = 0
  for (const t of totals) {
    if (!t.month || !t.month.startsWith(prefix)) continue
    if (t.type === 'income') incomeCents += -(t.total_cents ?? 0)
    else if (t.type === 'expense') expenseCents += t.total_cents ?? 0
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

// Tasa de ahorro = flujo neto / ingresos. 0 si no hay ingresos.
export function savingsRate(c: Consumo): number {
  if (c.incomeCents <= 0) return 0
  return c.netCents / c.incomeCents
}

export type RecommendedAllocation = {
  accountId: string
  name: string
  percent: number
  cents: number
}

// Asignación recomendada por % sobre el ingreso mensual estimado.
export function recommendedAllocations(
  allocations: { account_id: string; percent: number }[],
  byId: Map<string, Account>,
  monthlyIncomeCents: number,
): RecommendedAllocation[] {
  return allocations
    .map((a) => ({
      accountId: a.account_id,
      name: byId.get(a.account_id)?.name ?? '—',
      percent: a.percent,
      cents: Math.round((monthlyIncomeCents * a.percent) / 100),
    }))
    .sort((a, b) => b.percent - a.percent)
}

// Suma de los % de asignación (debe ser 100).
export function totalAllocationPercent(
  allocations: { percent: number }[],
): number {
  return allocations.reduce((s, a) => s + a.percent, 0)
}

// "Suelo de necesidades": suma de las plantillas recurrentes activas cuyo
// destino sea la categoría indicada (Necesidades).
export function necessitiesFloorCents(
  recurring: Recurring[],
  necessitiesAccountId: string | undefined,
): number {
  if (!necessitiesAccountId) return 0
  return recurring
    .filter((r) => r.is_active && r.to_account_id === necessitiesAccountId)
    .reduce((s, r) => s + r.amount_cents, 0)
}

// Meses estimados para cubrir lo que falta a un ritmo mensual.
export function monthsToTarget(
  remainingCents: number,
  monthlyCents: number,
): number | null {
  if (remainingCents <= 0) return 0
  if (monthlyCents <= 0) return null // ritmo 0 => inalcanzable
  return Math.ceil(remainingCents / monthlyCents)
}
