import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { Delta } from '@/components/Stat'
import { centsToEuro, formatEuro } from '@/lib/money'
import { netWorthChange, type NetWorthPoint } from '@/lib/metrics'

// Hero de patrimonio compartido por Dashboard y Patrimonio.
export function NetWorthHero({
  totalCents,
  history,
  link = false,
}: {
  totalCents: number
  history: NetWorthPoint[]
  link?: boolean
}) {
  const change = netWorthChange(history)
  const spark = history.slice(-12).map((p) => ({ label: p.month, value: centsToEuro(p.cents) }))

  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand p-5 text-white shadow-lg shadow-brand/25">
      <p className="text-xs font-medium uppercase tracking-wide text-white/70">Patrimonio total</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-4xl font-bold tracking-tight tabular-nums">{formatEuro(totalCents)}</p>
        {change && <Delta cents={change.cents} ratio={change.ratio} onBrand />}
      </div>
      {change && <p className="mt-1 text-xs text-white/70">frente al mes anterior</p>}

      {spark.length >= 2 ? (
        <div className="-mx-5 mt-3 h-24" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#fff"
                strokeWidth={2}
                fill="url(#hero-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/70">Aún no hay movimientos para dibujar la evolución.</p>
      )}

      {link && (
        <Link
          to="/patrimonio"
          className="mt-2 inline-block text-sm font-medium text-white/90 underline-offset-4 hover:underline"
        >
          Ver patrimonio →
        </Link>
      )}
    </section>
  )
}
