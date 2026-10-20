import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { Delta } from '@/components/Stat'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { currentMonthKey, formatMonthLabel, monthKey } from '@/lib/dates'
import {
  expenseByCategory,
  incomeByCategory,
  monthlyConsumo,
  relativeChange,
  savingsRate,
  yearConsumo,
} from '@/lib/metrics'
import { cn } from '@/lib/cn'
import { groupByBucket } from '@/lib/accountTree'
import { useAccounts, useMonthlyTotals } from '@/lib/queries'
import { PageTour } from '@/features/onboarding/PageTour'
import { BudgetCard } from './BudgetCard'
import { TrendsCard } from './TrendsCard'
import { showTour } from '@/features/onboarding/tourStorage'

// 'YYYY-MM' -> mes anterior.
function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number]
  return monthKey(new Date(y, mo - 2, 1))
}

export function MensualPage() {
  const totals = useMonthlyTotals()
  const accounts = useAccounts()
  const [month, setMonth] = useState<string>(currentMonthKey())

  const months = useMemo(() => {
    const set = new Set<string>([currentMonthKey()])
    for (const t of totals.data ?? []) if (t.month) set.add(t.month)
    return [...set].sort().reverse()
  }, [totals.data])

  if (totals.isLoading) return <LoadingState />
  if (totals.isError)
    return <ErrorState error={totals.error} onRetry={() => totals.refetch()} />

  const data = totals.data ?? []
  const ingresos = incomeByCategory(data, month)
  const gastos = expenseByCategory(data, month)
  // Las subcategorías se agrupan bajo su bucket (Config).
  const gastosAgrupados = groupByBucket(gastos, accounts.data ?? [])
  const consumo = monthlyConsumo(data, month)
  const previo = monthlyConsumo(data, prevMonth(month))
  const year = Number(month.slice(0, 4))
  const anual = yearConsumo(data, year)
  const monthIdx = months.indexOf(month)

  const delta = (cur: number, prev: number, invert = false) => (
    <Delta cents={cur - prev} ratio={relativeChange(cur, prev)} invert={invert} />
  )

  return (
    <div>
      <PageTour id="mensual" />
      <PageHeader
        title="Mensual"
        subtitle="Los traspasos no son consumo: no cuentan en el flujo neto."
        onHelp={() => showTour('mensual')}
      />

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-surface p-1">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={monthIdx < 0 || monthIdx >= months.length - 1}
          onClick={() => setMonth(months[monthIdx + 1]!)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          ‹
        </button>
        <select
          aria-label="Mes"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-center font-semibold text-slate-900 focus:outline-none"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={monthIdx <= 0}
          onClick={() => setMonth(months[monthIdx - 1]!)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="Sin datos todavía"
          description="Registra movimientos para ver el resumen mensual."
        />
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl bg-brand p-5 text-white shadow-lg shadow-brand/25">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Flujo neto del mes</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-4xl font-bold tracking-tight tabular-nums">
                <Money cents={consumo.netCents} />
              </p>
              <Delta
                cents={consumo.netCents - previo.netCents}
                ratio={relativeChange(consumo.netCents, previo.netCents)}
                onBrand
              />
            </div>
            <p className="mt-1 text-xs text-white/70">frente al mes anterior</p>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
              <div>
                <dt className="text-xs text-white/70">Ingresos</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  <Money cents={consumo.incomeCents} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/70">Gastos</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  <Money cents={consumo.expenseCents} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/70">Ahorro</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {Math.round(savingsRate(consumo) * 100)}%
                </dd>
              </div>
            </dl>
          </section>

          <BudgetCard month={month} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CategoryCard
              title="Ingresos por categoría"
              barClass="bg-emerald-500"
              rows={ingresos.map((r) => ({ ...r, children: [] }))}
              totalCents={consumo.incomeCents}
              delta={delta(consumo.incomeCents, previo.incomeCents)}
            />
            <CategoryCard
              title="Gastos por categoría"
              barClass="bg-brand"
              rows={gastosAgrupados}
              totalCents={consumo.expenseCents}
              delta={delta(consumo.expenseCents, previo.expenseCents, true)}
            />
          </div>

          <TrendsCard totals={data} month={month} />

          <Card className="p-4">
            <h2 className="font-semibold text-slate-900">Acumulado de {year}</h2>
            <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-100 text-center">
              <YearCell label="Ingresos" cents={anual.incomeCents} className="text-emerald-600" />
              <YearCell label="Gastos" cents={anual.expenseCents} className="text-rose-600" />
              <YearCell label="Flujo neto" cents={anual.netCents} className="text-slate-900" />
            </dl>
          </Card>
        </div>
      )}
    </div>
  )
}

function CategoryCard({
  title,
  rows,
  totalCents,
  barClass,
  delta,
}: {
  title: string
  rows: {
    accountId: string
    name: string
    cents: number
    children: { accountId: string; name: string; cents: number }[]
  }[]
  totalCents: number
  barClass: string
  delta: ReactNode
}) {
  const share = (cents: number) => (totalCents > 0 && cents > 0 ? Math.min(1, cents / totalCents) : 0)

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 p-4 pb-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {delta}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500">
          Sin importes este mes
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((r) => (
            <li key={r.accountId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-slate-900">{r.name}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-xs tabular-nums text-slate-500">
                    {Math.round(share(r.cents) * 100)}%
                  </span>
                  <Money cents={r.cents} className="font-semibold" />
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className={cn('h-full rounded-full', barClass)} style={{ width: `${share(r.cents) * 100}%` }} />
              </div>
              {r.children.length > 0 && (
                <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                  {r.children.map((c) => (
                    <li key={c.accountId} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-slate-500">{c.name}</span>
                      <Money cents={c.cents} className="shrink-0 text-slate-600" />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 font-semibold">
        <span>Total</span>
        <Money cents={totalCents} />
      </div>
    </Card>
  )
}

function YearCell({ label, cents, className }: { label: string; cents: number; className: string }) {
  return (
    <div className="px-1">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold tabular-nums', className)}>
        <Money cents={cents} />
      </dd>
    </div>
  )
}
