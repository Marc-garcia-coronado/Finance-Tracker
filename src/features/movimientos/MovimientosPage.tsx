import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Select } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { Money } from '@/components/Money'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { formatDate, formatMonthLabel, recentMonths } from '@/lib/dates'
import {
  useAccounts,
  useEntries,
  useVoidEntry,
  type EntryWithLines,
  type EntryFilters,
} from '@/lib/queries'
import { MovementForm } from './MovementForm'
import { ImportMovementsModal } from './ImportMovementsModal'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

const PAGE_SIZE = 20
const MONTHS = recentMonths(12)

const KIND_BADGE: Record<string, string> = {
  expense: 'bg-rose-50 text-rose-700',
  income: 'bg-emerald-50 text-emerald-700',
  transfer: 'bg-slate-100 text-slate-600',
  adjustment: 'bg-amber-50 text-amber-700',
}
const KIND_TEXT: Record<string, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Traspaso',
  adjustment: 'Ajuste',
}

export function MovimientosPage() {
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [month, setMonth] = useState<string>(MONTHS[0]!)
  const [kind, setKind] = useState<EntryFilters['kind']>('all')
  const [page, setPage] = useState(0)

  const accounts = useAccounts()
  const entries = useEntries({ month, kind, page, pageSize: PAGE_SIZE })
  const voidEntry = useVoidEntry()

  const byId = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  const totalPages = Math.max(1, Math.ceil((entries.data?.count ?? 0) / PAGE_SIZE))

  function resetPageAnd(fn: () => void) {
    setPage(0)
    fn()
  }

  async function onVoid(id: string) {
    if (!confirm('¿Anular este movimiento? Se creará su inverso (no se borra).')) return
    try {
      await voidEntry.mutateAsync(id)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo anular')
    }
  }

  return (
    <div>
      <PageTour id="movimientos" />
      <PageHeader
        title="Movimientos"
        onHelp={() => showTour('movimientos')}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Importar
            </Button>
            <Button onClick={() => setOpen(true)}>Nuevo</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mes
          <Select
            className="w-auto"
            value={month}
            onChange={(e) => resetPageAnd(() => setMonth(e.target.value))}
          >
            <option value="all">Todos</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Tipo
          <Select
            className="w-auto"
            value={kind}
            onChange={(e) =>
              resetPageAnd(() => setKind(e.target.value as EntryFilters['kind']))
            }
          >
            <option value="all">Todos</option>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="transfer">Traspaso</option>
            <option value="adjustment">Ajuste</option>
          </Select>
        </label>
      </div>

      {entries.isLoading || accounts.isLoading ? (
        <LoadingState />
      ) : entries.isError ? (
        <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
      ) : (entries.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="No hay movimientos"
          description="Prueba a cambiar los filtros o registra uno nuevo."
          action={<Button onClick={() => setOpen(true)}>Nuevo movimiento</Button>}
        />
      ) : (
        <>
          <Card className="divide-y divide-slate-100">
            {entries.data!.rows.map((e) => (
              <Row key={e.id} entry={e} byId={byId} onVoid={onVoid} busy={voidEntry.isPending} />
            ))}
          </Card>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              {entries.data!.count} movimiento(s) · página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo movimiento">
        <MovementForm onDone={() => setOpen(false)} />
      </Modal>

      <ImportMovementsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function Row({
  entry,
  byId,
  onVoid,
  busy,
}: {
  entry: EntryWithLines
  byId: Map<string, string>
  onVoid: (id: string) => void
  busy: boolean
}) {
  const pos = entry.entry_lines.find((l) => l.amount_cents > 0)
  const neg = entry.entry_lines.find((l) => l.amount_cents < 0)
  const amount = pos?.amount_cents ?? 0
  const fromName = neg ? (byId.get(neg.account_id) ?? '—') : '—'
  const toName = pos ? (byId.get(pos.account_id) ?? '—') : '—'

  const isAnnulled = !!entry.voided_at
  const isAnnulment = !!entry.voids_entry_id

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('badge', KIND_BADGE[entry.kind])}>{KIND_TEXT[entry.kind]}</span>
          {isAnnulment && <span className="badge bg-slate-100 text-slate-500">Anulación</span>}
          {isAnnulled && <span className="badge bg-amber-50 text-amber-700">Anulado</span>}
          <span className="truncate font-medium text-slate-800">
            {entry.description || '(sin concepto)'}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {formatDate(entry.occurred_on)} · {fromName} → {toName}
        </p>
      </div>

      <Money
        cents={amount}
        className={cn('shrink-0 font-semibold', isAnnulled && 'text-slate-400 line-through')}
      />

      {!isAnnulled && !isAnnulment && (
        <button
          onClick={() => onVoid(entry.id)}
          disabled={busy}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
        >
          Anular
        </button>
      )}
    </div>
  )
}
