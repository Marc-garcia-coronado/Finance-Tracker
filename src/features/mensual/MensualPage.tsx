import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Card, Select } from '@/components/ui'
import { Money } from '@/components/Money'
import { Stat } from '@/components/Stat'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { currentMonthKey, formatMonthLabel } from '@/lib/dates'
import {
  expenseByCategory,
  incomeByCategory,
  monthlyConsumo,
  yearConsumo,
} from '@/lib/metrics'
import { useMonthlyTotals } from '@/lib/queries'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

export function MensualPage() {
  const totals = useMonthlyTotals()
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
  const consumo = monthlyConsumo(data, month)
  const year = Number(month.slice(0, 4))
  const anual = yearConsumo(data, year)

  return (
    <div>
      <PageTour id="mensual" />
      <PageHeader
        title="Mensual"
        subtitle="Los traspasos no son consumo: no cuentan en el flujo neto."
        onHelp={() => showTour('mensual')}
        action={
          <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </Select>
        }
      />

      {data.length === 0 ? (
        <EmptyState
          title="Sin datos todavía"
          description="Registra movimientos para ver el resumen mensual."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Ingresos del mes" value={<Money cents={consumo.incomeCents} />} tone="positive" />
            <Stat label="Gastos del mes" value={<Money cents={consumo.expenseCents} />} tone="negative" />
            <Stat
              label="Flujo neto del mes"
              value={<Money cents={consumo.netCents} />}
              tone={consumo.netCents >= 0 ? 'positive' : 'negative'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CategoryTable title="Ingresos por categoría" rows={ingresos} totalCents={consumo.incomeCents} />
            <CategoryTable title="Gastos por categoría" rows={gastos} totalCents={consumo.expenseCents} />
          </div>

          <Card className="p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Acumulado del año {year}</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <YearCell label="Ingresos" cents={anual.incomeCents} />
              <YearCell label="Gastos" cents={anual.expenseCents} />
              <YearCell label="Flujo neto" cents={anual.netCents} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function CategoryTable({
  title,
  rows,
  totalCents,
}: {
  title: string
  rows: { accountId: string; name: string; cents: number }[]
  totalCents: number
}) {
  return (
    <Card>
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">Sin importes este mes</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.accountId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-700">{r.name}</td>
                <td className="px-4 py-2.5 text-right">
                  <Money cents={r.cents} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right">
                <Money cents={totalCents} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  )
}

function YearCell({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-slate-900">
        <Money cents={cents} />
      </p>
    </div>
  )
}
