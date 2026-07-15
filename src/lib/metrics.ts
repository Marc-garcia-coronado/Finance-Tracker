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
import { currentMonthKey } from './dates'

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

// ---------------------------------------------------------------------------
// Patrimonio neto histórico
// ---------------------------------------------------------------------------
export type NetWorthPoint = { month: string; cents: number }

// Mes siguiente a un 'YYYY-MM' (maneja el salto de diciembre a enero).
function nextMonthKey(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number]
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

// Serie de patrimonio a fin de cada mes: suma acumulada de las líneas de las
// cuentas de activo (assetIds). Las líneas ya vienen sin anulaciones y con los
// ajustes incluidos (loadLedgerLines). Rellena los meses sin movimientos con el
// total anterior (línea plana, no cae a 0) y extiende la serie hasta endMonth
// para que llegue "hasta hoy" aunque no haya movimientos recientes.
export function netWorthSeries(
  lines: { account_id: string; month: string; cents: number }[],
  assetIds: Set<string>,
  endMonth: string = currentMonthKey(),
): NetWorthPoint[] {
  const deltaByMonth = new Map<string, number>()
  let minMonth: string | null = null
  let maxDataMonth: string | null = null
  for (const l of lines) {
    if (!assetIds.has(l.account_id)) continue
    deltaByMonth.set(l.month, (deltaByMonth.get(l.month) ?? 0) + l.cents)
    if (!minMonth || l.month < minMonth) minMonth = l.month
    if (!maxDataMonth || l.month > maxDataMonth) maxDataMonth = l.month
  }
  if (!minMonth) return []

  const end = endMonth > maxDataMonth! ? endMonth : maxDataMonth!
  const out: NetWorthPoint[] = []
  let running = 0
  for (let m = minMonth; m <= end; m = nextMonthKey(m)) {
    running += deltaByMonth.get(m) ?? 0
    out.push({ month: m, cents: running })
  }
  return out
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
