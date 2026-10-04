import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Input, Select } from '@/components/ui'
import { DownloadIcon, SearchIcon } from '@/components/icons'
import { matchesSearch } from '@/lib/search'
import { isEditableKind } from '@/lib/entryForm'
import { entriesToCsv } from '@/lib/exportMovements'
import { saveFile } from '@/lib/saveFile'
import { Modal } from '@/components/Modal'
import { useConfirm } from '@/components/confirmContext'
import { Money } from '@/components/Money'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { formatDate, formatMonthLabel, recentMonths, todayISO } from '@/lib/dates'
import {
  useAccounts,
  useEntries,
  fetchAllEntries,
  useEntriesForSearch,
  useVoidEntry,
  type Account,
  type EntryWithLines,
  type EntryFilters,
  type EntryQueryFilters,
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

const ACCOUNT_GROUPS: { type: Account['type']; label: string }[] = [
  { type: 'asset', label: 'Cuentas' },
  { type: 'income', label: 'Ingresos' },
  { type: 'expense', label: 'Categorías de gasto' },
]

// Valor que se actualiza `ms` después del último cambio.
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function MovimientosPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EntryWithLines | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [month, setMonth] = useState<string>(MONTHS[0]!)
  const [kind, setKind] = useState<EntryFilters['kind']>('all')
  const [accountId, setAccountId] = useState<string>('all')
  const [hideVoided, setHideVoided] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const search = useDebounced(searchInput.trim(), 300)
  const searching = search.length > 0
  // La página vuelve a la 1 cuando cambia la búsqueda efectiva.
  useEffect(() => setPage(0), [search])

  const serverFilters: EntryQueryFilters = { month, kind, accountId, hideVoided }
  const accounts = useAccounts()
  const paged = useEntries({ ...serverFilters, page, pageSize: PAGE_SIZE }, !searching)
  const all = useEntriesForSearch(serverFilters, searching)
  const voidEntry = useVoidEntry()
  const confirmDialog = useConfirm()

  // Con búsqueda: filtrado y paginación en cliente sobre todos los movimientos.
  const matches = useMemo(
    () => (searching ? (all.data ?? []).filter((e) => matchesSearch(e.description, search)) : []),
    [searching, all.data, search],
  )
  const active = searching ? all : paged
  const rows = searching ? matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : (paged.data?.rows ?? [])
  const count = searching ? matches.length : (paged.data?.count ?? 0)

  const byId = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  function resetPageAnd(fn: () => void) {
    setPage(0)
    fn()
  }

  // Exporta lo que coincide con los filtros actuales (y la búsqueda), sin anulados.
  async function onExport() {
    setExportError(null)
    setExporting(true)
    try {
      const list = await fetchAllEntries({ ...serverFilters, hideVoided: true })
      const matching = search ? list.filter((e) => matchesSearch(e.description, search)) : list
      const accountsById = new Map((accounts.data ?? []).map((a) => [a.id, a]))
      const filename = `movimientos-${month === 'all' ? 'todos' : month}-${todayISO()}.csv`
      await saveFile(filename, entriesToCsv(matching, accountsById))
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  async function onVoid(id: string) {
    const ok = await confirmDialog({
      title: 'Anular movimiento',
      message: '¿Anular este movimiento? Se creará su inverso (no se borra).',
      confirmLabel: 'Anular',
      destructive: true,
    })
    if (!ok) return
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
            <Button
              variant="secondary"
              onClick={onExport}
              loading={exporting}
              title="Exporta a CSV los movimientos que coinciden con los filtros (sin anulados). Los ajustes no se pueden reimportar."
            >
              {!exporting && <DownloadIcon className="h-4 w-4" />}
              Exportar
            </Button>
            <Button onClick={() => setOpen(true)}>Nuevo</Button>
          </div>
        }
      />

      {exportError && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          No se pudo exportar: {exportError}
        </p>
      )}

      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          aria-label="Buscar movimientos"
          placeholder="Buscar por concepto…"
          className="pl-9 pr-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-base leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Cuenta
          <Select
            className="w-auto max-w-[14rem]"
            value={accountId}
            onChange={(e) => resetPageAnd(() => setAccountId(e.target.value))}
          >
            <option value="all">Todas</option>
            {ACCOUNT_GROUPS.map((g) => {
              const items = (accounts.data ?? [])
                .filter((a) => a.type === g.type)
                .sort((a, b) => Number(a.is_archived) - Number(b.is_archived))
              if (items.length === 0) return null
              return (
                <optgroup key={g.type} label={g.label}>
                  {items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.is_archived ? ' (archivada)' : ''}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            checked={hideVoided}
            onChange={(e) => resetPageAnd(() => setHideVoided(e.target.checked))}
          />
          Ocultar anulados
        </label>
      </div>

      {active.isLoading || accounts.isLoading ? (
        <LoadingState label={searching ? 'Buscando…' : undefined} />
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} />
      ) : rows.length === 0 ? (
        searching ? (
          <EmptyState
            title={`Ningún movimiento coincide con «${search}»`}
            description="Prueba con otras palabras o cambia los filtros."
          />
        ) : (
          <EmptyState
            title="No hay movimientos"
            description="Prueba a cambiar los filtros o registra uno nuevo."
            action={<Button onClick={() => setOpen(true)}>Nuevo movimiento</Button>}
          />
        )
      ) : (
        <>
          <Card className="divide-y divide-slate-100">
            {rows.map((e) => (
              <Row
                key={e.id}
                entry={e}
                byId={byId}
                onVoid={onVoid}
                onEdit={setEditing}
                busy={voidEntry.isPending}
              />
            ))}
          </Card>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              {count} movimiento(s){searching ? ` que coinciden con «${search}»` : ''} · página {page + 1}{' '}
              de {totalPages}
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

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Editar movimiento">
        {editing && <MovementForm key={editing.id} entry={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <ImportMovementsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function Row({
  entry,
  byId,
  onVoid,
  onEdit,
  busy,
}: {
  entry: EntryWithLines
  byId: Map<string, string>
  onVoid: (id: string) => void
  onEdit: (entry: EntryWithLines) => void
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
        <div className="flex shrink-0 gap-1">
          {/* Los ajustes de saldo se corrigen desde Patrimonio. */}
          {isEditableKind(entry.kind) && (
            <button
              onClick={() => onEdit(entry)}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Editar
            </button>
          )}
          <button
            onClick={() => onVoid(entry.id)}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          >
            Anular
          </button>
        </div>
      )}
    </div>
  )
}
