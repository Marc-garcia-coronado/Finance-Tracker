import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { Button, Input, Select } from '@/components/ui'
import { CheckIcon, PencilIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatEuro, tryEuroToCents } from '@/lib/money'
import { qualifiedName } from '@/lib/accountTree'
import { saveLastExpenseAccount } from '@/lib/lastAccount'
import { ADJUSTMENT_ACCOUNT_NAME, useCreateEntry, type Account } from '@/lib/queries'
import type { VoiceDraft } from '@/lib/voiceParse'

export type ReviewItem = VoiceDraft & {
  id: number
  accountId: string // cuenta de pago (gasto) o de cobro (ingreso)
  status: 'pending' | 'approved' | 'removed'
  editing: boolean
  error: string | null
}

// Un movimiento se puede aprobar si tiene todo lo que exige el formulario manual.
function problem(item: ReviewItem): string | null {
  const cents = tryEuroToCents(item.amount)
  if (cents === null || cents <= 0) return 'Indica un importe'
  if (!item.categoryId) return 'Elige una categoría'
  if (!item.accountId) return item.kind === 'expense' ? 'Elige la cuenta de pago' : 'Elige la cuenta de cobro'
  if (!item.date) return 'Indica una fecha'
  return null
}

export function ReviewList({
  items,
  setItems,
  accounts,
  dictated,
  onDictateAgain,
  onClose,
}: {
  items: ReviewItem[]
  setItems: Dispatch<SetStateAction<ReviewItem[]>>
  accounts: Account[]
  dictated: string
  onDictateAgain: () => void
  onClose: () => void
}) {
  const createEntry = useCreateEntry()
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const active = accounts.filter((a) => !a.is_archived && a.name !== ADJUSTMENT_ACCOUNT_NAME)
  const assets = active.filter((a) => a.type === 'asset')
  const categories = (kind: ReviewItem['kind']) => active.filter((a) => a.type === kind)

  const patch = (id: number, p: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)))

  async function approve(item: ReviewItem): Promise<void> {
    const cents = tryEuroToCents(item.amount)
    if (cents === null || problem(item)) return
    const isExpense = item.kind === 'expense'
    try {
      await createEntry.mutateAsync({
        kind: item.kind,
        date: item.date,
        description: item.description.trim(),
        fromAccountId: isExpense ? item.accountId : item.categoryId,
        toAccountId: isExpense ? item.categoryId : item.accountId,
        amountCents: cents,
      })
      if (isExpense) saveLastExpenseAccount(item.accountId)
      patch(item.id, { status: 'approved', editing: false, error: null })
    } catch (e) {
      patch(item.id, { error: e instanceof Error ? e.message : 'No se pudo guardar' })
    }
  }

  async function approveAll() {
    for (const item of items) {
      if (item.status === 'pending' && !problem(item)) await approve(item)
    }
  }

  const pending = items.filter((i) => i.status === 'pending')
  const ready = pending.filter((i) => !problem(i))
  const saved = items.filter((i) => i.status === 'approved').length
  const removed = items.filter((i) => i.status === 'removed').length
  const visible = items.length - removed

  if (items.length === 0) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-medium text-slate-700">No he encontrado ningún movimiento</p>
        <p className="text-sm text-slate-500">
          Prueba a decir el importe y el concepto, por ejemplo «12 euros en el súper».
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
          <Button className="flex-1" onClick={onDictateAgain}>
            Dictar otra vez
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-slate-800">
          {visible} {visible === 1 ? 'movimiento detectado' : 'movimientos detectados'}
        </p>
        <p className="text-sm text-slate-500">
          Edita, aprueba o elimina cada uno. Hasta que lo apruebes no se guarda.
        </p>
      </div>

      <details className="text-sm text-slate-500">
        <summary className="cursor-pointer">Ver lo que dijiste</summary>
        <p className="mt-1 text-slate-600">«{dictated}»</p>
      </details>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              byId={byId}
              assets={assets}
              categories={categories(item.kind)}
              busy={createEntry.isPending}
              onPatch={(p) => patch(item.id, p)}
              onApprove={() => void approve(item)}
            />
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
        {pending.length > 0 ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-slate-500">
              {ready.length} de {pending.length} listos{saved ? ` · ${saved} guardados` : ''}
            </p>
            <Button
              onClick={() => void approveAll()}
              disabled={ready.length === 0}
              loading={createEntry.isPending}
            >
              {!createEntry.isPending && <CheckIcon className="h-4 w-4" />}
              Aprobar {ready.length === pending.length ? 'todos' : 'listos'} ({ready.length})
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-center text-sm text-slate-600">
              <strong>{saved}</strong> guardados · <strong>{removed}</strong> descartados
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={onDictateAgain}>
                Dictar más
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ItemCard({
  item,
  byId,
  assets,
  categories,
  busy,
  onPatch,
  onApprove,
}: {
  item: ReviewItem
  byId: Map<string, Account>
  assets: Account[]
  categories: Account[]
  busy: boolean
  onPatch: (p: Partial<ReviewItem>) => void
  onApprove: () => void
}) {
  const isExpense = item.kind === 'expense'
  const cents = tryEuroToCents(item.amount)
  const issue = problem(item)
  const category = item.categoryId ? byId.get(item.categoryId) : undefined
  const categoryName = category ? qualifiedName(category, byId) : null
  const accountName = byId.get(item.accountId)?.name

  if (item.status === 'removed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-3 py-2.5 opacity-70">
        <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {item.description || '(sin concepto)'} · Descartado
        </p>
        <button
          onClick={() => onPatch({ status: 'pending' })}
          className="rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Deshacer
        </button>
      </div>
    )
  }

  const approved = item.status === 'approved'
  return (
    <div
      className={cn(
        'space-y-3 rounded-2xl border p-3',
        approved
          ? 'border-emerald-300 bg-emerald-50'
          : issue
            ? 'border-amber-300 bg-amber-50'
            : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'badge shrink-0',
                isExpense ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
              )}
            >
              {isExpense ? 'Gasto' : 'Ingreso'}
            </span>
            <span className="truncate font-medium text-slate-800">
              {item.description || '(sin concepto)'}
            </span>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
            <span>{item.date ? formatDate(item.date) : 'Sin fecha'}</span>
            <span className={cn(!categoryName && 'font-semibold text-amber-700')}>
              {categoryName ?? 'Elige una categoría'}
            </span>
            <span>
              {isExpense ? 'desde' : 'en'} {accountName ?? '—'}
            </span>
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            isExpense ? 'text-rose-700' : 'text-emerald-700',
          )}
        >
          {cents !== null && cents > 0 ? `${isExpense ? '−' : '+'}${formatEuro(cents)}` : '—'}
        </span>
      </div>

      {approved ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckIcon className="h-4 w-4" /> Guardado y cifrado
        </p>
      ) : (
        <>
          {item.editing && (
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 text-xs text-slate-500">
                Tipo
                <Select
                  className="mt-1"
                  value={item.kind}
                  onChange={(e) =>
                    onPatch({ kind: e.target.value as ReviewItem['kind'], categoryId: '' })
                  }
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </Select>
              </label>
              <label className="min-w-0 text-xs text-slate-500">
                Importe (€)
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={item.amount}
                  onChange={(e) => onPatch({ amount: e.target.value })}
                />
              </label>
              <label className="min-w-0 text-xs text-slate-500">
                Fecha
                <Input
                  className="mt-1"
                  type="date"
                  value={item.date}
                  onChange={(e) => onPatch({ date: e.target.value })}
                />
              </label>
              <label className="min-w-0 text-xs text-slate-500">
                Concepto
                <Input
                  className="mt-1"
                  value={item.description}
                  onChange={(e) => onPatch({ description: e.target.value })}
                />
              </label>
              <label className="col-span-2 min-w-0 text-xs text-slate-500">
                {isExpense ? 'Categoría de gasto' : 'Categoría de ingreso'}
                <Select
                  className="mt-1"
                  value={item.categoryId}
                  onChange={(e) => onPatch({ categoryId: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {categories.map((a) => (
                    <option key={a.id} value={a.id}>
                      {qualifiedName(a, byId)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-2 min-w-0 text-xs text-slate-500">
                {isExpense ? 'Pagada desde' : 'Ingresa en'}
                <Select
                  className="mt-1"
                  value={item.accountId}
                  onChange={(e) => onPatch({ accountId: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )}

          {item.error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {item.error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onPatch({ status: 'removed', editing: false })}
              disabled={busy}
              className="btn-secondary flex-1 !px-2 text-rose-700"
            >
              Eliminar
            </button>
            <button
              onClick={() => onPatch({ editing: !item.editing })}
              aria-expanded={item.editing}
              className="btn-secondary flex-1 !px-2"
            >
              <PencilIcon className="h-4 w-4" />
              {item.editing ? 'Listo' : 'Editar'}
            </button>
            <button
              onClick={onApprove}
              disabled={busy || issue !== null}
              title={issue ?? undefined}
              className="btn-primary flex-1 !px-2"
            >
              <CheckIcon className="h-4 w-4" />
              Aprobar
            </button>
          </div>
          {issue && !item.editing && (
            <p className="text-xs text-amber-800">{issue} para poder aprobarlo.</p>
          )}
        </>
      )}
    </div>
  )
}
