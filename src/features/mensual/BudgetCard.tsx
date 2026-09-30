import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import { ProgressBar, type ProgressTone } from '@/components/ProgressBar'
import { cn } from '@/lib/cn'
import { formatMonthLabel } from '@/lib/dates'
import { formatEuro } from '@/lib/money'
import { budgetVsActual, monthlyConsumo, type BudgetRow, type BudgetStatus } from '@/lib/metrics'
import { useAccounts, useAllocations, useMonthlyTotals, useSettings } from '@/lib/queries'

// Base del presupuesto: ingreso estimado (Config) o ingreso real del mes.
// Se recuerda por dispositivo.
type Base = 'estimated' | 'actual'
const BASE_STORAGE = 'finanzas.budget-base.v1'

function loadBase(): Base {
  try {
    return localStorage.getItem(BASE_STORAGE) === 'actual' ? 'actual' : 'estimated'
  } catch {
    return 'estimated'
  }
}

function saveBase(b: Base) {
  try {
    localStorage.setItem(BASE_STORAGE, b)
  } catch {
    // ignorar (modo privado, etc.)
  }
}

const TONE: Record<BudgetStatus, ProgressTone> = {
  ok: 'default',
  near: 'warning',
  over: 'danger',
  pending: 'default',
  done: 'success',
}

function statusText(r: BudgetRow): string {
  const diff = r.budgetCents - Math.max(0, r.actualCents)
  switch (r.status) {
    case 'over':
      return `Te has pasado ${formatEuro(-diff)}`
    case 'near':
    case 'ok':
      return `Quedan ${formatEuro(diff)}`
    case 'pending':
      return `Faltan ${formatEuro(diff)}`
    case 'done':
      return 'Cumplido'
  }
}

export function BudgetCard({ month }: { month: string }) {
  const totals = useMonthlyTotals()
  const settings = useSettings()
  const allocations = useAllocations()
  const accounts = useAccounts()
  const [base, setBase] = useState<Base>(loadBase)

  if (totals.isLoading || settings.isLoading || allocations.isLoading || accounts.isLoading) return null
  if (totals.isError || settings.isError || allocations.isError || accounts.isError) return null

  const data = totals.data ?? []
  const baseCents =
    base === 'estimated'
      ? (settings.data?.estimated_monthly_income_cents ?? 0)
      : monthlyConsumo(data, month).incomeCents

  const rows = budgetVsActual({
    allocations: allocations.data ?? [],
    accountsById: new Map((accounts.data ?? []).map((a) => [a.id, a])),
    totals: data,
    month,
    baseCents,
  })

  function choose(b: Base) {
    setBase(b)
    saveBase(b)
  }

  let empty: ReactNode = null
  if (rows.length === 0 || (base === 'estimated' && baseCents <= 0)) {
    empty = (
      <>
        Configura el ingreso estimado y la asignación por % en{' '}
        <Link to="/config" className="font-medium text-indigo-600 underline">
          Configuración
        </Link>
        .
      </>
    )
  } else if (baseCents <= 0) {
    empty = 'Aún no hay ingresos este mes.'
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Presupuesto de {formatMonthLabel(month).toLowerCase()}</h2>
        <div role="group" aria-label="Base del presupuesto" className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {(['estimated', 'actual'] as const).map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={base === b}
              onClick={() => choose(b)}
              className={cn(
                'rounded-md px-2.5 py-1 transition',
                base === b ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {b === 'estimated' ? 'Estimado' : 'Real'}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Base: {formatEuro(baseCents)} ({base === 'estimated' ? 'ingreso estimado' : 'ingresos reales del mes'})
      </p>

      {empty ? (
        <p className="py-4 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.accountId}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">
                  {r.name}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    {r.type === 'asset' ? 'ahorro' : 'gasto'} · {r.percent}%
                  </span>
                </span>
                <span className="tabular-nums text-slate-600">
                  {formatEuro(Math.max(0, r.actualCents))} de {formatEuro(r.budgetCents)}
                </span>
              </div>
              <ProgressBar value={r.ratio} tone={TONE[r.status]} />
              <p
                className={cn(
                  'mt-1 text-xs',
                  r.status === 'over' ? 'text-rose-700' : r.status === 'done' ? 'text-emerald-700' : 'text-slate-500',
                )}
              >
                {statusText(r)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
