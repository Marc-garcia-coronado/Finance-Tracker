import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Input, Select, Spinner } from '@/components/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsRightLeftIcon,
  DownloadIcon,
  EllipsisIcon,
  FunnelIcon,
  PencilIcon,
  PercentIcon,
  SearchIcon,
  UndoIcon,
} from '@/components/icons'
import { matchesSearch } from '@/lib/search'
import { isEditableKind } from '@/lib/entryForm'
import { entriesToCsv } from '@/lib/exportMovements'
import { saveFile } from '@/lib/saveFile'
import { Modal } from '@/components/Modal'
import { useConfirm } from '@/components/confirmContext'
import { Money } from '@/components/Money'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { dayLabel, formatLongDate, formatMonthLabel, groupByDay, recentMonths, todayISO } from '@/lib/dates'
import { monthlyConsumo } from '@/lib/metrics'
import {
  useAccounts,
  useEntries,
  useMonthlyTotals,
  fetchAllEntries,
  useEntriesForSearch,
  useVoidEntry,
  type Account,
  type EntryWithLines,
  type EntryFilters,
  type EntryQueryFilters,
} from '@/lib/queries'
import { MovementForm } from './MovementForm'
import { NewMovementDialog } from './NewMovementDialog'
import { ImportMovementsModal } from './ImportMovementsModal'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

const EXPORT_HINT =
  'Exporta a CSV los movimientos que coinciden con los filtros (sin anulados). Los ajustes no se pueden reimportar.'
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
const KIND_AVATAR: Record<string, { icon: typeof ArrowUpIcon; tone: string }> = {
  expense: { icon: ArrowDownIcon, tone: 'bg-rose-50 text-rose-600' },
  income: { icon: ArrowUpIcon, tone: 'bg-emerald-50 text-emerald-600' },
  transfer: { icon: ArrowsRightLeftIcon, tone: 'bg-slate-100 text-slate-600' },
  adjustment: { icon: PercentIcon, tone: 'bg-amber-50 text-amber-600' },
}
const KIND_CHIPS: { value: EntryFilters['kind']; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer', label: 'Traspasos' },
  { value: 'adjustment', label: 'Ajustes' },
]

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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [detail, setDetail] = useState<EntryWithLines | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const totals = useMonthlyTotals()
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

  const activeFilters = Number(accountId !== 'all') + Number(hideVoided)
  const monthIdx = MONTHS.indexOf(month)
  const monthTotals = month === 'all' ? null : monthlyConsumo(totals.data ?? [], month)

  function clearFilters() {
    setPage(0)
    setKind('all')
    setAccountId('all')
    setHideVoided(false)
    setSearchInput('')
  }

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
            <Button
              variant="secondary"
              className="hidden sm:inline-flex"
              onClick={() => setImportOpen(true)}
            >
              Importar
            </Button>
            <Button
              variant="secondary"
              className="hidden sm:inline-flex"
              onClick={onExport}
              loading={exporting}
              title={EXPORT_HINT}
            >
              {!exporting && <DownloadIcon className="h-4 w-4" />}
              Exportar
            </Button>
            <Button
              variant="secondary"
              className="px-3 sm:hidden"
              aria-label="Más acciones"
              aria-haspopup="dialog"
              onClick={() => setActionsOpen(true)}
            >
              <EllipsisIcon className="h-5 w-5" />
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

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-surface p-1">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={monthIdx < 0 || monthIdx >= MONTHS.length - 1}
          onClick={() => resetPageAnd(() => setMonth(MONTHS[monthIdx + 1]!))}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          ‹
        </button>
        <select
          aria-label="Mes"
          value={month}
          onChange={(e) => resetPageAnd(() => setMonth(e.target.value))}
          className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-center font-semibold text-slate-900 focus:outline-none"
        >
          <option value="all">Todos los meses</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={monthIdx <= 0}
          onClick={() => resetPageAnd(() => setMonth(MONTHS[monthIdx - 1]!))}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {monthTotals && (
        <dl className="card mb-4 grid grid-cols-3 divide-x divide-slate-100 p-3 text-center">
          <div>
            <dt className="text-xs text-slate-500">Ingresos</dt>
            <dd className="mt-0.5 text-sm font-semibold text-emerald-600">
              <Money cents={monthTotals.incomeCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Gastos</dt>
            <dd className="mt-0.5 text-sm font-semibold text-rose-600">
              <Money cents={monthTotals.expenseCents} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Neto</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              <Money cents={monthTotals.netCents} />
            </dd>
          </div>
        </dl>
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

      <div className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        {KIND_CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={kind === c.value}
            onClick={() => resetPageAnd(() => setKind(c.value))}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
              kind === c.value
                ? 'border-brand bg-brand text-white'
                : 'border-slate-200 bg-surface text-slate-600 hover:bg-slate-50',
            )}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
            activeFilters > 0 || filtersOpen
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-surface text-slate-600 hover:bg-slate-50',
          )}
        >
          <FunnelIcon className="h-4 w-4" />
          Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ''}
        </button>
      </div>

      {filtersOpen && (
        <div className="card mb-4 space-y-3 p-4">
          <label className="block text-sm text-slate-600">
            <span className="label">Cuenta</span>
            <Select
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700">Ocultar anulados</span>
            <button
              type="button"
              role="switch"
              aria-checked={hideVoided}
              aria-label="Ocultar anulados"
              onClick={() => resetPageAnd(() => setHideVoided((v) => !v))}
              className={cn(
                'relative h-7 w-12 shrink-0 rounded-full transition',
                hideVoided ? 'bg-brand' : 'bg-slate-200',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                  hideVoided && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-brand hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {active.isLoading || accounts.isLoading ? (
        <LoadingState label={searching ? 'Buscando…' : undefined} />
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} />
      ) : rows.length === 0 ? (
        searching ? (
          <EmptyState
            title={`Ningún movimiento coincide con «${search}»`}
            description="Prueba con otras palabras o cambia los filtros."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
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
          <div className="space-y-4">
            {groupByDay(rows).map((g) => (
              <section key={g.date} aria-label={dayLabel(g.date)}>
                <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {dayLabel(g.date)}
                </h2>
                <Card className="divide-y divide-slate-100">
                  {g.rows.map((e) => (
                    <Row
                      key={e.id}
                      entry={e}
                      byId={byId}
                      onOpen={setDetail}
                      onVoid={onVoid}
                      onEdit={setEditing}
                      busy={voidEntry.isPending}
                    />
                  ))}
                </Card>
              </section>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
            <span className="min-w-0 break-words">
              {count} movimiento(s){searching ? ` que coinciden con «${search}»` : ''}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                className="px-3"
                aria-label="Anterior"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </Button>
              <span className="tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="secondary"
                className="px-3"
                aria-label="Siguiente"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </Button>
            </div>
          </div>
        </>
      )}

      <NewMovementDialog open={open} onClose={() => setOpen(false)} />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Editar movimiento">
        {editing && <MovementForm key={editing.id} entry={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Movimiento">
        {detail && (
          <EntryDetail
            entry={detail}
            byId={byId}
            busy={voidEntry.isPending}
            onEdit={(e) => {
              setDetail(null)
              setEditing(e)
            }}
            onVoid={(id) => {
              setDetail(null)
              void onVoid(id)
            }}
          />
        )}
      </Modal>

      <Modal open={actionsOpen} onClose={() => setActionsOpen(false)} title="Más acciones">
        <div className="space-y-1">
          <button
            onClick={() => {
              setActionsOpen(false)
              setImportOpen(true)
            }}
            className="flex w-full flex-col rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
          >
            <span className="font-medium text-slate-800">Importar</span>
            <span className="text-xs text-slate-500">Carga movimientos desde un archivo CSV.</span>
          </button>
          <button
            onClick={async () => {
              await onExport()
              setActionsOpen(false)
            }}
            disabled={exporting}
            className="flex w-full flex-col rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="flex items-center gap-2 font-medium text-slate-800">
              {exporting ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
              Exportar CSV
            </span>
            <span className="text-xs text-slate-500">{EXPORT_HINT}</span>
          </button>
        </div>
      </Modal>

      <ImportMovementsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

// Datos derivados de un movimiento, compartidos por la fila y el detalle.
function describeEntry(entry: EntryWithLines, byId: Map<string, string>) {
  const pos = entry.entry_lines.find((l) => l.amount_cents > 0)
  const neg = entry.entry_lines.find((l) => l.amount_cents < 0)
  return {
    amount: pos?.amount_cents ?? 0,
    fromName: neg ? (byId.get(neg.account_id) ?? '—') : '—',
    toName: pos ? (byId.get(pos.account_id) ?? '—') : '—',
    isAnnulled: !!entry.voided_at,
    isAnnulment: !!entry.voids_entry_id,
  }
}

const SIGN: Record<string, string> = { expense: '−', income: '+' }

function Row({
  entry,
  byId,
  onOpen,
  onVoid,
  onEdit,
  busy,
}: {
  entry: EntryWithLines
  byId: Map<string, string>
  onOpen: (entry: EntryWithLines) => void
  onVoid: (id: string) => void
  onEdit: (entry: EntryWithLines) => void
  busy: boolean
}) {
  const { amount, fromName, toName, isAnnulled, isAnnulment } = describeEntry(entry, byId)
  const avatar = KIND_AVATAR[entry.kind] ?? KIND_AVATAR.transfer!
  const Icon = avatar.icon
  const dim = isAnnulled || isAnnulment

  return (
    <div className="group flex items-center">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/70"
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            avatar.tone,
            dim && 'opacity-50',
          )}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate font-medium text-slate-900', dim && 'text-slate-500')}>
              {entry.description || '(sin concepto)'}
            </span>
            {isAnnulment && <span className="badge shrink-0 bg-slate-100 text-slate-500">Anulación</span>}
            {isAnnulled && <span className="badge shrink-0 bg-amber-50 text-amber-700">Anulado</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {fromName} → {toName}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            entry.kind === 'income' && 'text-emerald-600',
            dim && '!text-slate-400 line-through',
          )}
        >
          {SIGN[entry.kind] ?? ''}
          <Money cents={amount} />
        </span>
      </button>

      {/* Atajos solo en escritorio y al pasar el ratón; en móvil se usan desde el detalle. */}
      {!dim && (
        <div className="mr-3 hidden shrink-0 gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
          {isEditableKind(entry.kind) && (
            <button
              onClick={() => onEdit(entry)}
              disabled={busy}
              aria-label="Editar movimiento"
              title="Editar movimiento"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onVoid(entry.id)}
            disabled={busy}
            aria-label="Anular movimiento"
            title="Anular movimiento"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          >
            <UndoIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function EntryDetail({
  entry,
  byId,
  busy,
  onEdit,
  onVoid,
}: {
  entry: EntryWithLines
  byId: Map<string, string>
  busy: boolean
  onEdit: (entry: EntryWithLines) => void
  onVoid: (id: string) => void
}) {
  const { amount, fromName, toName, isAnnulled, isAnnulment } = describeEntry(entry, byId)
  const status = isAnnulled ? 'Anulado' : isAnnulment ? 'Anulación de otro movimiento' : 'Vigente'
  const rows: [string, string][] = [
    ['Fecha', formatLongDate(entry.occurred_on)],
    ['Concepto', entry.description || '(sin concepto)'],
    ['Origen', fromName],
    ['Destino', toName],
    ['Estado', status],
  ]

  return (
    <div>
      <div className="mb-4 text-center">
        <span className={cn('badge', KIND_BADGE[entry.kind])}>{KIND_TEXT[entry.kind]}</span>
        <p
          className={cn(
            'mt-2 text-3xl font-bold tracking-tight tabular-nums',
            isAnnulled && 'text-slate-400 line-through',
          )}
        >
          {SIGN[entry.kind] ?? ''}
          <Money cents={amount} />
        </p>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {!isAnnulled && !isAnnulment && (
        <div className="mt-4 flex gap-2 [&>button]:flex-1">
          {/* Los ajustes de saldo se corrigen desde Patrimonio. */}
          {isEditableKind(entry.kind) && (
            <Button variant="secondary" disabled={busy} onClick={() => onEdit(entry)}>
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
          )}
          <Button variant="danger" disabled={busy} onClick={() => onVoid(entry.id)}>
            <UndoIcon className="h-4 w-4" />
            Anular
          </Button>
        </div>
      )}
    </div>
  )
}
