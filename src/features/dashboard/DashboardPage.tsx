import { useMemo, type ReactNode } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { Delta, Stat } from '@/components/Stat'
import { ProgressBar } from '@/components/ProgressBar'
import { ErrorState, LoadingState } from '@/components/states'
import { formatCompactEuro, formatEuro, centsToEuro } from '@/lib/money'
import { currentMonthKey, currentYear } from '@/lib/dates'
import { NetWorthHero } from '@/components/NetWorthHero'
import { BudgetCard } from '@/features/mensual/BudgetCard'
import {
  monthlyConsumo,
  monthsToTarget,
  necessitiesFloorCents,
  recommendedAllocations,
  relativeChange,
  savingsRate,
  shiftMonth,
  yearConsumo,
  type Consumo,
  type RecommendedAllocation,
} from '@/lib/metrics'
import {
  useAccounts,
  useAllocations,
  useBalances,
  useGoals,
  useMonthlyTotals,
  useNetWorthHistory,
  useRecurring,
  useSettings,
  type Goal,
} from '@/lib/queries'
import { showOnboarding } from '@/features/onboarding/tourStorage'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const PIE_COLORS = ['#2f5fb8', '#0ea5e9', '#10b981', '#f59e0b', '#0d9488', '#64748b']

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--slate-200))',
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--slate-900))',
  boxShadow: '0 4px 12px -4px rgb(15 23 42 / 0.12)',
  fontSize: 13,
} as const

function greeting(): { title: string; subtitle: string } {
  const now = new Date()
  const h = now.getHours()
  const title = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
  const date = format(now, "EEEE d 'de' MMMM", { locale: es })
  return { title, subtitle: date.charAt(0).toUpperCase() + date.slice(1) }
}

// --- Este mes vs mes anterior ---------------------------------------------------------
function MonthStats({ current, previous }: { current: Consumo; previous: Consumo }) {
  const delta = (cur: number, prev: number, invert = false): ReactNode => (
    <Delta cents={cur - prev} ratio={relativeChange(cur, prev)} invert={invert} />
  )
  // En móvil, fila con scroll horizontal; en escritorio, columna junto al hero.
  return (
    <div
      aria-label="Este mes"
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-1 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      <Stat
        className="min-w-[10.5rem] flex-1 snap-start"
        label="Ingresos del mes"
        tone="positive"
        value={<Money cents={current.incomeCents} />}
        delta={delta(current.incomeCents, previous.incomeCents)}
      />
      <Stat
        className="min-w-[10.5rem] flex-1 snap-start"
        label="Gastos del mes"
        tone="negative"
        value={<Money cents={current.expenseCents} />}
        delta={delta(current.expenseCents, previous.expenseCents, true)}
      />
      <Stat
        className="min-w-[10.5rem] flex-1 snap-start"
        label="Neto del mes"
        tone={current.netCents >= 0 ? 'positive' : 'negative'}
        value={<Money cents={current.netCents} />}
        delta={delta(current.netCents, previous.netCents)}
      />
    </div>
  )
}

// --- Gráfico anual ------------------------------------------------------------------------
function YearChart({
  year,
  consumo,
  series,
}: {
  year: number
  consumo: Consumo
  series: { label: string; income: number; expense: number }[]
}) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold text-slate-900">Ingresos vs gastos {year}</h2>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Ingresos
          </dt>
          <dd className="font-semibold text-slate-900">
            <Money cents={consumo.incomeCents} />
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
            Gastos
          </dt>
          <dd className="font-semibold text-slate-900">
            <Money cents={consumo.expenseCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Tasa de ahorro</dt>
          <dd className="font-semibold text-slate-900">{Math.round(savingsRate(consumo) * 100)}%</dd>
        </div>
      </dl>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="rgb(var(--slate-200))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={formatCompactEuro}
            />
            <Tooltip
              formatter={(v: number) => formatEuro(Math.round(v * 100))}
              labelClassName="text-slate-700"
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'rgb(var(--slate-500) / 0.08)' }}
            />
            <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// --- Asignación recomendada ------------------------------------------------------------
function AllocationCard({ recs, incomeCents }: { recs: RecommendedAllocation[]; incomeCents: number }) {
  const pieData = recs.filter((r) => r.cents > 0).map((r) => ({ name: r.name, value: centsToEuro(r.cents) }))
  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold text-slate-900">Asignación recomendada</h2>
      <p className="mb-3 text-sm text-slate-500">
        Sobre el ingreso mensual estimado ({formatEuro(incomeCents)}).
      </p>
      {incomeCents === 0 || recs.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">
          Define el ingreso mensual y los porcentajes en Config.
        </p>
      ) : (
        <>
          <div className="relative mx-auto h-44 max-w-[11rem]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={2}
                  stroke="rgb(var(--surface))"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatEuro(Math.round(v * 100))}
                  contentStyle={TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-slate-500">Al mes</span>
              <span className="text-sm font-bold text-slate-900">{formatEuro(incomeCents)}</span>
            </div>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {recs.map((r, i) => (
              <li key={r.accountId}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{r.name}</span>
                  <span className="text-slate-400">{r.percent}%</span>
                  <span className="w-20 text-right font-medium text-slate-900">{formatEuro(r.cents)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, r.percent)}%`,
                      background: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// --- Salud financiera: suelo de necesidades + fondo de emergencia -------------------------
function HealthCard({
  floor,
  necAssigned,
  fondoGoal,
  fondoActual,
}: {
  floor: number
  necAssigned: number
  fondoGoal: Goal | undefined
  fondoActual: number
}) {
  const over = floor > necAssigned && necAssigned > 0
  const meta = fondoGoal?.target_cents ?? 0
  const remaining = Math.max(0, meta - fondoActual)
  const progress = meta > 0 ? fondoActual / meta : 0
  const months = fondoGoal ? monthsToTarget(remaining, fondoGoal.monthly_contribution_cents) : null

  return (
    <Card className="divide-y divide-slate-100 p-0">
      <div className="p-4">
        <h2 className="mb-1 font-semibold text-slate-900">Suelo de necesidades</h2>
        <p className="mb-3 text-sm text-slate-500">Recurrentes fijos vs lo asignado a Necesidades.</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Recurrentes (suelo)</span>
          <Money cents={floor} className="font-medium" />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-slate-600">Asignado a Necesidades</span>
          <Money cents={necAssigned} className="font-medium" />
        </div>
        <div className="mt-3">
          <ProgressBar
            value={necAssigned > 0 ? floor / necAssigned : floor > 0 ? 1 : 0}
            tone={over ? 'danger' : undefined}
          />
          <p className="mt-1 text-xs text-slate-500">
            {necAssigned === 0
              ? 'Define la asignación de Necesidades en Config.'
              : over
                ? '⚠️ Los recurrentes superan lo asignado a Necesidades.'
                : `Margen libre: ${formatEuro(necAssigned - floor)}`}
          </p>
        </div>
      </div>

      <div className="p-4">
        <h2 className="mb-1 font-semibold text-slate-900">Fondo de emergencia</h2>
        {!fondoGoal ? (
          <p className="py-2 text-sm text-slate-400">
            Crea un objetivo vinculado a la cuenta «Fondo emergencia» en Objetivos.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-600">
                <Money cents={fondoActual} /> de <Money cents={meta} />
              </span>
              <span className="font-semibold text-slate-900">{Math.round(progress * 100)}%</span>
            </div>
            <ProgressBar value={progress} />
            <p className="mt-2 text-xs text-slate-500">
              Faltan <Money cents={remaining} />
              {months === 0
                ? ' · completado 🎉'
                : months === null
                  ? ' · sin aportación mensual'
                  : ` · ~${months} mes(es) al ritmo actual`}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const totals = useMonthlyTotals()
  const settings = useSettings()
  const allocations = useAllocations()
  const accounts = useAccounts()
  const recurring = useRecurring()
  const goals = useGoals()
  const balances = useBalances()
  const history = useNetWorthHistory()

  const loading =
    totals.isLoading ||
    settings.isLoading ||
    allocations.isLoading ||
    accounts.isLoading ||
    recurring.isLoading ||
    goals.isLoading ||
    balances.isLoading ||
    history.isLoading

  const year = currentYear()

  const monthlySeries = useMemo(() => {
    const data = totals.data ?? []
    const rows = MONTH_NAMES.map((label) => ({ label, income: 0, expense: 0 }))
    for (const t of data) {
      if (!t.month || !t.month.startsWith(`${year}-`)) continue
      const idx = Number(t.month.slice(5, 7)) - 1
      const row = rows[idx]
      if (!row) continue
      if (t.type === 'income') row.income += centsToEuro(-(t.total_cents ?? 0))
      else if (t.type === 'expense') row.expense += centsToEuro(t.total_cents ?? 0)
    }
    return rows
  }, [totals.data, year])

  if (loading) return <LoadingState />
  if (totals.isError)
    return <ErrorState error={totals.error} onRetry={() => totals.refetch()} />

  const byId = new Map((accounts.data ?? []).map((a) => [a.id, a]))
  const income = settings.data?.estimated_monthly_income_cents ?? 0

  const month = currentMonthKey()
  const monthNow = monthlyConsumo(totals.data ?? [], month)
  const monthPrev = monthlyConsumo(totals.data ?? [], shiftMonth(month, -1))
  const consumo = yearConsumo(totals.data ?? [], year)

  // Patrimonio total: suma de las cuentas de activo (igual que en Patrimonio).
  const netWorth = (balances.data ?? [])
    .filter((b) => b.type === 'asset')
    .reduce((s, b) => s + (b.balance_cents ?? 0), 0)

  const recs = recommendedAllocations(allocations.data ?? [], byId, income)

  // Necesidades: categoría de gasto llamada "Necesidades".
  const necesidades = (accounts.data ?? []).find(
    (a) => a.type === 'expense' && a.name === 'Necesidades',
  )
  const floor = necessitiesFloorCents(recurring.data ?? [], necesidades?.id)
  const necAssigned = recs.find((r) => r.accountId === necesidades?.id)?.cents ?? 0

  // Fondo de emergencia: objetivo vinculado a la cuenta "Fondo emergencia".
  const fondoAcc = (accounts.data ?? []).find(
    (a) => a.type === 'asset' && a.name === 'Fondo emergencia',
  )
  const fondoGoal = (goals.data ?? []).find((g) => g.linked_account_id === fondoAcc?.id)
  const fondoActual = fondoAcc
    ? ((balances.data ?? []).find((b) => b.account_id === fondoAcc.id)?.balance_cents ?? 0)
    : 0

  const hi = greeting()

  return (
    <div className="space-y-6">
      <PageHeader title={hi.title} subtitle={hi.subtitle} onHelp={showOnboarding} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NetWorthHero totalCents={netWorth} history={history.data ?? []} link />
        </div>
        <MonthStats current={monthNow} previous={monthPrev} />
      </div>

      <BudgetCard month={month} />

      <YearChart year={year} consumo={consumo} series={monthlySeries} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationCard recs={recs} incomeCents={income} />
        <HealthCard
          floor={floor}
          necAssigned={necAssigned}
          fondoGoal={fondoGoal}
          fondoActual={fondoActual}
        />
      </div>
    </div>
  )
}
