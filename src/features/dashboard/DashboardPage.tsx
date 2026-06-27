import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
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
import { Stat } from '@/components/Stat'
import { ProgressBar } from '@/components/ProgressBar'
import { ErrorState, LoadingState } from '@/components/states'
import { formatEuro, centsToEuro } from '@/lib/money'
import { currentYear } from '@/lib/dates'
import {
  monthsToTarget,
  necessitiesFloorCents,
  recommendedAllocations,
  savingsRate,
  yearConsumo,
} from '@/lib/metrics'
import {
  useAccounts,
  useAllocations,
  useBalances,
  useGoals,
  useMonthlyTotals,
  useRecurring,
  useSettings,
} from '@/lib/queries'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const PIE_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']

export function DashboardPage() {
  const totals = useMonthlyTotals()
  const settings = useSettings()
  const allocations = useAllocations()
  const accounts = useAccounts()
  const recurring = useRecurring()
  const goals = useGoals()
  const balances = useBalances()

  const loading =
    totals.isLoading ||
    settings.isLoading ||
    allocations.isLoading ||
    accounts.isLoading ||
    recurring.isLoading ||
    goals.isLoading ||
    balances.isLoading

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

  const consumo = yearConsumo(totals.data ?? [], year)
  const rate = savingsRate(consumo)

  const recs = recommendedAllocations(allocations.data ?? [], byId, income)

  // Necesidades: categoría de gasto llamada "Necesidades".
  const necesidades = (accounts.data ?? []).find(
    (a) => a.type === 'expense' && a.name === 'Necesidades',
  )
  const floor = necessitiesFloorCents(recurring.data ?? [], necesidades?.id)
  const necRec = recs.find((r) => r.accountId === necesidades?.id)
  const necAssigned = necRec?.cents ?? 0

  // Fondo de emergencia: objetivo vinculado a la cuenta "Fondo emergencia".
  const fondoAcc = (accounts.data ?? []).find(
    (a) => a.type === 'asset' && a.name === 'Fondo emergencia',
  )
  const fondoGoal = (goals.data ?? []).find((g) => g.linked_account_id === fondoAcc?.id)
  const fondoActual = fondoAcc
    ? ((balances.data ?? []).find((b) => b.account_id === fondoAcc.id)?.balance_cents ?? 0)
    : 0

  const pieData = recs.filter((r) => r.cents > 0).map((r) => ({ name: r.name, value: centsToEuro(r.cents) }))

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Resumen de ${year}`} />

      {/* KPIs del año */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos (año)" value={<Money cents={consumo.incomeCents} />} tone="positive" />
        <Stat label="Gastos (año)" value={<Money cents={consumo.expenseCents} />} tone="negative" />
        <Stat
          label="Flujo neto (año)"
          value={<Money cents={consumo.netCents} />}
          tone={consumo.netCents >= 0 ? 'positive' : 'negative'}
        />
        <Stat label="Tasa de ahorro" value={`${Math.round(rate * 100)}%`} hint="Flujo neto / ingresos" />
      </div>

      {/* Gráfico mensual */}
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Ingresos vs gastos por mes</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlySeries} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(v: number) => formatEuro(Math.round(v * 100))}
                labelClassName="text-slate-700"
              />
              <Legend />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Asignación recomendada */}
        <Card className="p-4">
          <h2 className="mb-1 font-semibold text-slate-900">Asignación recomendada</h2>
          <p className="mb-3 text-sm text-slate-500">
            Sobre el ingreso mensual estimado ({formatEuro(income)}).
          </p>
          {income === 0 || recs.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">
              Define el ingreso mensual y los porcentajes en Config.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatEuro(Math.round(v * 100))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 text-sm">
                {recs.map((r, i) => (
                  <li key={r.accountId} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="flex-1 text-slate-700">{r.name}</span>
                    <span className="text-slate-400">{r.percent}%</span>
                    <span className="w-20 text-right font-medium text-slate-900">
                      {formatEuro(r.cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Recurrentes vs Necesidades + Fondo de emergencia */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-1 font-semibold text-slate-900">Suelo de necesidades</h2>
            <p className="mb-3 text-sm text-slate-500">
              Recurrentes fijos vs lo asignado a Necesidades.
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Recurrentes (suelo)</span>
              <Money cents={floor} className="font-medium" />
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">Asignado a Necesidades</span>
              <Money cents={necAssigned} className="font-medium" />
            </div>
            <div className="mt-3">
              <ProgressBar value={necAssigned > 0 ? floor / necAssigned : floor > 0 ? 1 : 0} />
              <p className="mt-1 text-xs text-slate-500">
                {necAssigned === 0
                  ? 'Define la asignación de Necesidades en Config.'
                  : floor > necAssigned
                    ? '⚠️ Los recurrentes superan lo asignado a Necesidades.'
                    : `Margen libre: ${formatEuro(necAssigned - floor)}`}
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 font-semibold text-slate-900">Fondo de emergencia</h2>
            {!fondoGoal ? (
              <p className="py-2 text-sm text-slate-400">
                Crea un objetivo vinculado a la cuenta «Fondo emergencia» en Objetivos.
              </p>
            ) : (
              (() => {
                const meta = fondoGoal.target_cents
                const remaining = Math.max(0, meta - fondoActual)
                const progress = meta > 0 ? fondoActual / meta : 0
                const months = monthsToTarget(remaining, fondoGoal.monthly_contribution_cents)
                return (
                  <>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        <Money cents={fondoActual} /> de <Money cents={meta} />
                      </span>
                      <span className="font-semibold text-slate-900">
                        {Math.round(progress * 100)}%
                      </span>
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
                )
              })()
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
