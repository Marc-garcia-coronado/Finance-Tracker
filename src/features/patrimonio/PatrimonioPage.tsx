import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { Stat } from '@/components/Stat'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { formatEuro, centsToEuro } from '@/lib/money'
import { useBalances, useNetWorthHistory } from '@/lib/queries'
import { AdjustBalanceModal, type AdjustTarget } from './AdjustBalanceModal'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// 'YYYY-MM' -> 'Jun 26' para las etiquetas del eje X.
function shortMonth(m: string): string {
  const [y = '', mo = ''] = m.split('-')
  return `${MONTH_ABBR[Number(mo) - 1]} ${y.slice(2)}`
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px -4px rgb(15 23 42 / 0.12)',
  fontSize: 13,
} as const

export function PatrimonioPage() {
  const balances = useBalances()
  const history = useNetWorthHistory()
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null)

  if (balances.isLoading) return <LoadingState />
  if (balances.isError)
    return <ErrorState error={balances.error} onRetry={() => balances.refetch()} />

  const assets = (balances.data ?? [])
    .filter((b) => b.type === 'asset')
    .sort((a, b) => (b.balance_cents ?? 0) - (a.balance_cents ?? 0))

  const total = assets.reduce((s, a) => s + (a.balance_cents ?? 0), 0)

  const chartData = (history.data ?? []).map((p) => ({
    label: shortMonth(p.month),
    value: centsToEuro(p.cents),
  }))

  return (
    <div>
      <PageTour id="patrimonio" />
      <PageHeader
        title="Patrimonio"
        subtitle="Derivado de los movimientos. Ajusta el saldo real cuando difiera (p. ej. inversiones)."
        onHelp={() => showTour('patrimonio')}
      />

      {assets.length === 0 ? (
        <EmptyState
          title="Aún no hay cuentas de activo"
          description="Crea cuentas en Config o registra movimientos."
        />
      ) : (
        <div className="space-y-4">
          <Stat label="Patrimonio total" value={<Money cents={total} />} />

          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Evolución del patrimonio</h2>
            {chartData.length < 2 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Necesitas al menos dos meses de movimientos para ver la evolución.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      formatter={(v: number) => formatEuro(Math.round(v * 100))}
                      labelClassName="text-slate-700"
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ stroke: 'rgb(15 23 42 / 0.12)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="Patrimonio"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.account_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-800">{a.name}</td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={a.balance_cents ?? 0} colored />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setAdjusting({
                            id: a.account_id!,
                            name: a.name!,
                            balanceCents: a.balance_cents ?? 0,
                          })
                        }
                        className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">
                    <Money cents={total} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      <AdjustBalanceModal account={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  )
}
