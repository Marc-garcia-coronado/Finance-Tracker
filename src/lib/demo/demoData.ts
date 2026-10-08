// Datos ficticios del modo demo. Función pura y determinista: para la misma
// fecha siempre salen los mismos datos (PRNG con semilla), lo que permite
// testearla. Todo en céntimos enteros; cada movimiento tiene dos líneas que
// suman 0 (origen negativo, destino positivo), como en el ledger real.
import { addMonths, format, parseISO, subMonths } from 'date-fns'
import type { Account, Allocation, Goal, Recurring, Settings } from '../queries'

export type DemoEntry = {
  id: string
  occurred_on: string
  description: string
  kind: 'income' | 'expense' | 'transfer' | 'adjustment'
  voided_at: string | null
  voids_entry_id: string | null
  created_at: string
  lines: { account_id: string; amount_cents: number }[]
}

export type DemoData = {
  accounts: Account[]
  entries: DemoEntry[]
  settings: Settings
  allocations: Allocation[]
  goals: Goal[]
  recurring: Recurring[]
}

export const DEMO_USER_ID = 'demo-user'
export const DEMO_ADJUSTMENT_NAME = 'Ajustes de valor'
const MONTHS_BACK = 11

// Id estable de una cuenta de ejemplo.
export const A = {
  checking: 'demo-a-checking',
  savings: 'demo-a-savings',
  fund: 'demo-a-fund',
  cash: 'demo-a-cash',
  trip: 'demo-a-trip',
  salary: 'demo-i-salary',
  other: 'demo-i-other',
  adjust: 'demo-i-adjust',
  needs: 'demo-e-needs',
  fun: 'demo-e-fun',
  invest: 'demo-e-invest',
  emergency: 'demo-e-emergency',
  rent: 'demo-e-rent',
  utilities: 'demo-e-utilities',
  groceries: 'demo-e-groceries',
  transport: 'demo-e-transport',
  restaurants: 'demo-e-restaurants',
  subscriptions: 'demo-e-subscriptions',
  shopping: 'demo-e-shopping',
  outings: 'demo-e-outings',
} as const

// mulberry32: PRNG pequeño y determinista.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CREATED = '2025-01-01T00:00:00.000Z'

function account(
  id: string,
  name: string,
  type: Account['type'],
  extra: Partial<Pick<Account, 'is_budget_bucket' | 'parent_id'>> = {},
): Account {
  return {
    id,
    user_id: DEMO_USER_ID,
    name,
    type,
    is_budget_bucket: extra.is_budget_bucket ?? false,
    is_archived: false,
    parent_id: extra.parent_id ?? null,
    created_at: CREATED,
  }
}

export function buildDemoAccounts(): Account[] {
  return [
    account(A.checking, 'Cuenta corriente', 'asset'),
    account(A.savings, 'Cuenta ahorro', 'asset'),
    account(A.fund, 'Fondo indexado', 'asset'),
    account(A.cash, 'Efectivo', 'asset'),
    account(A.trip, 'Hucha viaje', 'asset'),
    account(A.salary, 'Nómina', 'income'),
    account(A.other, 'Otros ingresos', 'income'),
    account(A.adjust, DEMO_ADJUSTMENT_NAME, 'income'),
    account(A.needs, 'Necesidades', 'expense', { is_budget_bucket: true }),
    account(A.fun, 'Ocio', 'expense', { is_budget_bucket: true }),
    account(A.invest, 'Inversión', 'expense', { is_budget_bucket: true }),
    account(A.emergency, 'Fondo emergencia', 'expense', { is_budget_bucket: true }),
    account(A.rent, 'Alquiler', 'expense', { parent_id: A.needs }),
    account(A.utilities, 'Suministros', 'expense', { parent_id: A.needs }),
    account(A.groceries, 'Supermercado', 'expense', { parent_id: A.needs }),
    account(A.transport, 'Transporte', 'expense', { parent_id: A.needs }),
    account(A.restaurants, 'Restaurantes', 'expense', { parent_id: A.fun }),
    account(A.subscriptions, 'Suscripciones', 'expense', { parent_id: A.fun }),
    account(A.shopping, 'Compras', 'expense', { parent_id: A.fun }),
    account(A.outings, 'Salidas', 'expense', { parent_id: A.fun }),
  ]
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function buildDemoData(today: string): DemoData {
  const rand = rng(20261008)
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  // Redondea a múltiplos de 5 céntimos para que los importes parezcan reales.
  const cents = (min: number, max: number) => Math.round(between(min, max) / 5) * 5

  const entries: DemoEntry[] = []
  let n = 0
  function add(
    date: string,
    kind: DemoEntry['kind'],
    description: string,
    from: string,
    to: string,
    amount: number,
  ): DemoEntry | null {
    if (date > today) return null
    n += 1
    const entry: DemoEntry = {
      id: `demo-entry-${String(n).padStart(4, '0')}`,
      occurred_on: date,
      description,
      kind,
      voided_at: null,
      voids_entry_id: null,
      created_at: `${date}T12:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
      lines: [
        { account_id: from, amount_cents: -amount },
        { account_id: to, amount_cents: amount },
      ],
    }
    entries.push(entry)
    return entry
  }

  const first = subMonths(parseISO(`${today.slice(0, 7)}-01`), MONTHS_BACK)
  const openingDate = format(first, 'yyyy-MM-dd')

  // Saldos de partida (ajustes contra la cuenta de ajustes de valor).
  add(openingDate, 'adjustment', 'Saldo inicial', A.adjust, A.checking, 180000)
  add(openingDate, 'adjustment', 'Saldo inicial', A.adjust, A.savings, 420000)
  add(openingDate, 'adjustment', 'Saldo inicial', A.adjust, A.fund, 650000)
  add(openingDate, 'adjustment', 'Saldo inicial', A.adjust, A.cash, 8000)
  add(openingDate, 'adjustment', 'Saldo inicial', A.adjust, A.trip, 30000)

  const groceries = ['Mercadona', 'Carrefour', 'Lidl', 'Frutería', 'Panadería']
  const restaurants = ['Cena con amigos', 'Menú del día', 'Pizzería', 'Sushi', 'Cafetería']
  const outings = ['Cine', 'Concierto', 'Escape room', 'Bolera']
  const shopping = ['Ropa', 'Libros', 'Material deportivo', 'Regalo']
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!

  let voidTarget: DemoEntry | null = null

  for (let i = 0; i <= MONTHS_BACK; i++) {
    const month = addMonths(first, i)
    const y = month.getFullYear()
    const m = month.getMonth() + 1

    add(iso(y, m, 1), 'expense', 'Alquiler', A.checking, A.rent, 62000)
    add(iso(y, m, 5), 'expense', 'Luz y agua', A.checking, A.utilities, cents(6000, 11000))
    add(iso(y, m, 5), 'expense', 'Internet', A.checking, A.utilities, 3490)
    for (const day of [3, 10, 17, 24]) {
      add(iso(y, m, day), 'expense', pick(groceries), A.checking, A.groceries, cents(3500, 9500))
    }
    for (const day of [7, 21]) {
      add(iso(y, m, day), 'expense', 'Transporte público', A.checking, A.transport, cents(1500, 4500))
    }
    for (const day of [6, 13, 20]) {
      const paidWithCash = rand() < 0.3
      add(iso(y, m, day), 'expense', pick(restaurants), paidWithCash ? A.cash : A.checking, A.restaurants, cents(1800, 4500))
    }
    add(iso(y, m, 12), 'expense', 'Streaming', A.checking, A.subscriptions, 1099)
    add(iso(y, m, 12), 'expense', 'Música', A.checking, A.subscriptions, 999)
    add(iso(y, m, 15), 'expense', pick(shopping), A.checking, A.shopping, cents(2500, 9000))
    for (const day of [8, 22]) {
      add(iso(y, m, day), 'expense', pick(outings), A.checking, A.outings, cents(1500, 3500))
    }
    add(iso(y, m, 2), 'transfer', 'Retirada de efectivo', A.checking, A.cash, 6000)

    // Aportaciones mensuales.
    add(iso(y, m, 27), 'income', 'Nómina', A.salary, A.checking, 185000)
    add(iso(y, m, 28), 'expense', 'Aportación a inversión', A.checking, A.invest, 20000)
    add(iso(y, m, 28), 'expense', 'Aportación fondo de emergencia', A.checking, A.emergency, 15000)
    add(iso(y, m, 28), 'transfer', 'Ahorro mensual', A.checking, A.savings, 6000)
    add(iso(y, m, 28), 'transfer', 'Para el viaje', A.checking, A.trip, 8000)

    if (rand() < 0.4) {
      add(iso(y, m, 18), 'income', 'Venta de segunda mano', A.other, A.checking, cents(2000, 15000))
    }
    // Revalorización del fondo indexado (puede ser negativa).
    const delta = between(-9000, 16000)
    if (delta !== 0) {
      const date = iso(y, m, 28)
      if (delta > 0) add(date, 'adjustment', 'Revalorización', A.adjust, A.fund, delta)
      else add(date, 'adjustment', 'Revalorización', A.fund, A.adjust, -delta)
    }

    if (i === MONTHS_BACK - 2) {
      voidTarget = add(iso(y, m, 16), 'expense', 'Compra duplicada', A.checking, A.shopping, 4590)
    }
  }

  // Un movimiento anulado: el original queda marcado y su inverso lo compensa.
  if (voidTarget) {
    voidTarget.voided_at = `${voidTarget.occurred_on}T18:00:00.000Z`
    n += 1
    entries.push({
      id: `demo-entry-${String(n).padStart(4, '0')}`,
      occurred_on: voidTarget.occurred_on,
      description: voidTarget.description,
      kind: voidTarget.kind,
      voided_at: null,
      voids_entry_id: voidTarget.id,
      created_at: voidTarget.voided_at,
      lines: voidTarget.lines.map((l) => ({ ...l, amount_cents: -l.amount_cents })),
    })
  }

  const accounts = buildDemoAccounts()
  const settings: Settings = {
    user_id: DEMO_USER_ID,
    estimated_monthly_income_cents: 185000,
    updated_at: CREATED,
  }
  const allocations: Allocation[] = [
    [A.needs, 55],
    [A.fun, 20],
    [A.invest, 15],
    [A.emergency, 10],
  ].map(([account_id, percent], i) => ({
    id: `demo-alloc-${i + 1}`,
    user_id: DEMO_USER_ID,
    account_id: account_id as string,
    percent: percent as number,
  }))

  const goal = (
    id: number,
    name: string,
    target: number,
    monthly: number,
    linked: string,
    months: number,
  ): Goal => ({
    id: `demo-goal-${id}`,
    user_id: DEMO_USER_ID,
    name,
    target_cents: target,
    monthly_contribution_cents: monthly,
    linked_account_id: linked,
    deadline: format(addMonths(parseISO(today), months), 'yyyy-MM-dd'),
    created_at: CREATED,
  })
  const goals: Goal[] = [
    goal(1, 'Viaje a Japón', 300000, 8000, A.trip, 8),
    goal(2, 'Colchón de 6 meses', 1100000, 6000, A.savings, 24),
    goal(3, 'Entrada del coche', 800000, 20000, A.fund, 18),
  ]

  const nextRun = (from: string, day: number): string => {
    const thisMonth = `${from.slice(0, 7)}-${String(day).padStart(2, '0')}`
    return thisMonth >= from ? thisMonth : format(addMonths(parseISO(thisMonth), 1), 'yyyy-MM-dd')
  }
  const rec = (
    id: number,
    description: string,
    amount: number,
    from: string,
    to: string,
    kind: Recurring['kind'],
    day: number,
  ): Recurring => ({
    id: `demo-rec-${id}`,
    user_id: DEMO_USER_ID,
    description,
    amount_cents: amount,
    from_account_id: from,
    to_account_id: to,
    kind,
    cadence: 'monthly',
    day_of_month: day,
    next_run_on: nextRun(today, day),
    is_active: true,
    created_at: CREATED,
  })
  const recurring: Recurring[] = [
    rec(1, 'Alquiler', 62000, A.checking, A.rent, 'expense', 1),
    rec(2, 'Nómina', 185000, A.salary, A.checking, 'income', 27),
    rec(3, 'Streaming', 1099, A.checking, A.subscriptions, 'expense', 12),
    rec(4, 'Internet', 3490, A.checking, A.utilities, 'expense', 5),
    rec(5, 'Ahorro mensual', 6000, A.checking, A.savings, 'transfer', 28),
  ]

  return { accounts, entries, settings, allocations, goals, recurring }
}
