import { useMemo } from 'react'
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { cn } from '@/lib/cn'
import { formatMonthLabel } from '@/lib/dates'
import { centsToEuro, formatEuro } from '@/lib/money'
import {
  OTHERS_ID,
  expenseSeries,
  expenseTrends,
  type MonthlyTotalRow,
} from '@/lib/metrics'

const HISTORY_MONTHS = 12

// Paleta categórica (slots 1-5 en orden fijo, validada) y gris para «Otras».
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const OTHERS_COLOR = '#94a3b8'

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px -4px rgb(15 23 42 / 0.12)',
  fontSize: 13,
} as const

// Umbral por debajo del cual la variación se muestra como «sin cambio».
const FLAT = 0.05

// Variación de un gasto: subir es malo (rosa), bajar es bueno (verde). Además
// del color lleva signo y flecha, para no depender solo del color.
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const pct = Math.round(value * 100)
  if (Math.abs(value) < FLAT) return <span className="text-slate-500">≈ igual</span>
  const up = value > 0
  return (
    <span className={cn('font-medium tabular-nums', up ? 'text-rose-600' : 'text-emerald-600')}>
      {up ? '▲ +' : '▼ '}
      {pct} %
    </span>
  )
}

function shortMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number]
  return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
}

export function TrendsCard({ totals, month }: { totals: MonthlyTotalRow[]; month: string }) {
  const trends = useMemo(() => expenseTrends(totals, month, HISTORY_MONTHS), [totals, month])
  const series = useMemo(() => expenseSeries(totals, month, HISTORY_MONTHS, 5), [totals, month])

  const chartData = series.months.map((m, i) => {
    const row: Record<string, string | number> = { month: shortMonth(m), full: formatMonthLabel(m) }
    for (const c of series.categories) row[c.accountId] = centsToEuro(c.values[i]!)
    return row
  })
  const colorOf = (accountId: string, index: number) =>
    accountId === OTHERS_ID ? OTHERS_COLOR : SERIES_COLORS[index % SERIES_COLORS.length]

  return (
    <div className="space-y-4">
      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">Gasto frente a lo habitual</p>
          <p className="text-xs text-slate-500">
            Cada categoría frente al mes anterior y a la media de los {HISTORY_MONTHS} meses
            previos con datos.
          </p>
        </div>
        {trends.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Sin gastos este mes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Categoría</th>
                  <th className="px-2 py-2 text-right font-medium">Mes</th>
                  <th className="px-2 py-2 text-right font-medium">Vs. anterior</th>
                  <th className="px-4 py-2 text-right font-medium">Vs. media</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t.accountId} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-700">{t.name}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Money cents={t.cents} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      <Change value={t.vsPrev} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Change value={t.vsAvg} />
                      {t.avgCents !== null && t.avgCents > 0 && (
                        <span className="ml-1 block text-xs text-slate-400">
                          media {formatEuro(t.avgCents)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {series.categories.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">
            Gasto por categoría, últimos {HISTORY_MONTHS} meses
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => `${v} €`}
                />
                <Tooltip
                  formatter={(v: number) => formatEuro(Math.round(v * 100))}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgb(15 23 42 / 0.04)' }}
                />
                <Legend />
                {series.categories.map((c, i) => (
                  <Bar
                    key={c.accountId}
                    dataKey={c.accountId}
                    name={c.name}
                    stackId="gasto"
                    fill={colorOf(c.accountId, i)}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-indigo-600">
              Ver como tabla
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2 font-medium">Mes</th>
                    {series.categories.map((c) => (
                      <th key={c.accountId} className="px-2 py-1 text-right font-medium">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series.months.map((m, i) => (
                    <tr key={m} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-1 pr-2 text-slate-600">
                        {formatMonthLabel(m)}
                      </td>
                      {series.categories.map((c) => (
                        <td key={c.accountId} className="px-2 py-1 text-right tabular-nums">
                          {c.values[i] ? formatEuro(c.values[i]!) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}
    </div>
  )
}
