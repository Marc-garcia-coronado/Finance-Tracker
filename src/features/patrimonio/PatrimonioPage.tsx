import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui'
import { Money } from '@/components/Money'
import { Stat } from '@/components/Stat'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useBalances } from '@/lib/queries'

export function PatrimonioPage() {
  const balances = useBalances()

  if (balances.isLoading) return <LoadingState />
  if (balances.isError)
    return <ErrorState error={balances.error} onRetry={() => balances.refetch()} />

  const assets = (balances.data ?? [])
    .filter((b) => b.type === 'asset')
    .sort((a, b) => (b.balance_cents ?? 0) - (a.balance_cents ?? 0))

  const total = assets.reduce((s, a) => s + (a.balance_cents ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Patrimonio"
        subtitle="Derivado de los movimientos. No se introduce a mano."
      />

      {assets.length === 0 ? (
        <EmptyState
          title="Aún no hay cuentas de activo"
          description="Crea cuentas en Config o registra movimientos."
        />
      ) : (
        <div className="space-y-4">
          <Stat label="Patrimonio total" value={<Money cents={total} />} />

          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.account_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-800">{a.name}</td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={a.balance_cents ?? 0} colored />
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
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}
