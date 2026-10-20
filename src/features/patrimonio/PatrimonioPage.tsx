import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { Delta } from '@/components/Stat'
import { NetWorthHero } from '@/components/NetWorthHero'
import { PencilIcon } from '@/components/icons'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { formatCompactEuro, formatEuro, centsToEuro } from '@/lib/money'
import { seriesChange, type NetWorthPoint } from '@/lib/metrics'
import { useBalances, useNetWorthHistory, type Balance } from '@/lib/queries'
import { AdjustBalanceModal, type AdjustTarget } from './AdjustBalanceModal'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ACCOUNT_COLORS = ['#2f5fb8', '#0ea5e9', '#10b981', '#f59e0b', '#0d9488', '#64748b']

// 'YYYY-MM' -> 'Jun 26' para las etiquetas del eje X.
function shortMonth(m: string): string {
  const [y = '', mo = ''] = m.split('-')
  return `${MONTH_ABBR[Number(mo) - 1]} ${y.slice(2)}`
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--slate-200))',
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--slate-900))',
  boxShadow: '0 4px 12px -4px rgb(15 23 42 / 0.12)',
  fontSize: 13,
} as const

// Rangos de la evolución: meses hacia atrás (null = toda la serie).
const RANGES: { label: string; months: number | null }[] = [
  { label: '6M', months: 6 },
  { label: '1A', months: 12 },
  { label: 'Todo', months: null },
]

function EvolutionCard({ history }: { history: NetWorthPoint[] }) {
  const [range, setRange] = useState(1)
  const months = RANGES[range]!.months
  const data = months === null ? history : history.slice(-(months + 1))
  const change = seriesChange(data, data.length - 1)
  const chartData = data.map((p) => ({ label: shortMonth(p.month), value: centsToEuro(p.cents) }))

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Evolución</h2>
        <div role="group" aria-label="Rango" className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={range === i}
              onClick={() => setRange(i)}
              className={cn(
                'rounded-md px-3 py-1 transition',
                range === i ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length < 2 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Necesitas al menos dos meses de movimientos para ver la evolución.
        </p>
      ) : (
        <>
          {change && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Money cents={change.cents} colored className="font-semibold" />
              <Delta cents={change.cents} ratio={change.ratio} />
              <span className="text-xs text-slate-500">en {data.length - 1} meses</span>
            </p>
          )}
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="evo-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--brand-solid))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="rgb(var(--brand-solid))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--slate-200))" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={40} tickFormatter={formatCompactEuro} />
                <Tooltip
                  formatter={(v: number) => formatEuro(Math.round(v * 100))}
                  labelClassName="text-slate-700"
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ stroke: 'rgb(var(--slate-500) / 0.3)' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Patrimonio"
                  stroke="rgb(var(--brand-solid))"
                  strokeWidth={2}
                  fill="url(#evo-fill)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}

function AccountsCard({
  assets,
  total,
  onAdjust,
}: {
  assets: Balance[]
  total: number
  onAdjust: (t: AdjustTarget) => void
}) {
  // Solo los saldos positivos entran en el reparto; sin total positivo no hay barra.
  const share = (cents: number) => (total > 0 && cents > 0 ? cents / total : 0)

  return (
    <Card>
      <div className="p-4 pb-3">
        <h2 className="font-semibold text-slate-900">Tus cuentas</h2>
        {total > 0 && (
          <div
            className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label="Reparto del patrimonio por cuenta"
          >
            {assets.map((a, i) =>
              share(a.balance_cents) > 0 ? (
                <div
                  key={a.account_id}
                  style={{
                    width: `${share(a.balance_cents) * 100}%`,
                    background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
                  }}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {assets.map((a, i) => (
          <li key={a.account_id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">{a.name}</span>
              {share(a.balance_cents) > 0 && (
                <span className="text-xs text-slate-500">
                  {Math.round(share(a.balance_cents) * 100)}% del total
                </span>
              )}
            </span>
            <Money cents={a.balance_cents} colored className="shrink-0 font-semibold" />
            <button
              onClick={() => onAdjust({ id: a.account_id, name: a.name, balanceCents: a.balance_cents })}
              aria-label={`Ajustar saldo de ${a.name}`}
              title="Ajustar saldo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 font-semibold">
        <span>Total</span>
        <Money cents={total} />
      </div>
    </Card>
  )
}

export function PatrimonioPage() {
  const balances = useBalances()
  const history = useNetWorthHistory()
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null)

  if (balances.isLoading) return <LoadingState />
  if (balances.isError)
    return <ErrorState error={balances.error} onRetry={() => balances.refetch()} />

  const assets = (balances.data ?? [])
    .filter((b) => b.type === 'asset')
    .sort((a, b) => b.balance_cents - a.balance_cents)

  const total = assets.reduce((s, a) => s + a.balance_cents, 0)

  return (
    <div>
      <PageTour id="patrimonio" />
      <PageHeader
        title="Patrimonio"
        subtitle="Saldos de tus cuentas de activo"
        onHelp={() => showTour('patrimonio')}
      />

      {assets.length === 0 ? (
        <EmptyState
          title="Aún no hay cuentas de activo"
          description="Crea cuentas en Config o registra movimientos."
        />
      ) : (
        <div className="space-y-4">
          <NetWorthHero totalCents={total} history={history.data ?? []} />
          <EvolutionCard history={history.data ?? []} />
          <AccountsCard assets={assets} total={total} onAdjust={setAdjusting} />
          <p className="px-1 text-xs text-slate-500">
            Los saldos salen de tus movimientos. Si el real difiere (p. ej. inversiones), pulsa el
            lápiz: se crea un movimiento de ajuste, no se edita nada.
          </p>
        </div>
      )}

      <AdjustBalanceModal account={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  )
}
