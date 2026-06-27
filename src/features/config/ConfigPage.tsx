import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { formatEuro, tryEuroToCents } from '@/lib/money'
import {
  useAccounts,
  useAllocations,
  useArchiveAccount,
  useSaveAccount,
  useSaveAllocations,
  useSettings,
  useUpdateSettings,
  type Account,
} from '@/lib/queries'
import type { Enums } from '@/lib/database.types'

export function ConfigPage() {
  const settings = useSettings()
  const accounts = useAccounts()
  const allocations = useAllocations()

  if (settings.isLoading || accounts.isLoading || allocations.isLoading)
    return <LoadingState />
  if (settings.isError)
    return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" />
      <IncomeCard incomeCents={settings.data?.estimated_monthly_income_cents ?? 0} />
      <AllocationsCard
        accounts={accounts.data ?? []}
        allocations={allocations.data ?? []}
        incomeCents={settings.data?.estimated_monthly_income_cents ?? 0}
      />
      <AccountsCard accounts={accounts.data ?? []} />
    </div>
  )
}

// --- Ingreso mensual estimado -------------------------------------------------
function IncomeCard({ incomeCents }: { incomeCents: number }) {
  const update = useUpdateSettings()
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setValue(String(incomeCents / 100).replace('.', ','))
  }, [incomeCents])

  async function onSave() {
    setMsg(null)
    const cents = tryEuroToCents(value)
    if (cents === null || cents < 0) {
      setMsg('Importe no válido')
      return
    }
    await update.mutateAsync(cents)
    setMsg('Guardado')
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold text-slate-900">Ingreso mensual estimado</h2>
      <p className="mb-3 text-sm text-slate-500">
        Base para la asignación recomendada por porcentaje.
      </p>
      <div className="flex items-end gap-3">
        <div className="w-40">
          <Field label="Importe (€)" htmlFor="income">
            <Input id="income" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <Button onClick={onSave} loading={update.isPending}>
          Guardar
        </Button>
        {msg && <span className="pb-2 text-sm text-slate-500">{msg}</span>}
      </div>
    </Card>
  )
}

// --- Asignación por % ---------------------------------------------------------
function AllocationsCard({
  accounts,
  allocations,
  incomeCents,
}: {
  accounts: Account[]
  allocations: { account_id: string; percent: number }[]
  incomeCents: number
}) {
  const save = useSaveAllocations()
  const buckets = accounts.filter((a) => a.is_budget_bucket && !a.is_archived)
  const [percents, setPercents] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const map: Record<string, string> = {}
    for (const b of buckets) {
      const found = allocations.find((a) => a.account_id === b.id)
      map[b.id] = String(found?.percent ?? 0)
    }
    setPercents(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, allocations])

  const sum = Object.values(percents).reduce((s, v) => s + (Number(v) || 0), 0)
  const valid = Math.abs(sum - 100) < 0.001

  async function onSave() {
    setMsg(null)
    if (!valid) {
      setMsg('Los porcentajes deben sumar 100.')
      return
    }
    await save.mutateAsync(
      buckets.map((b) => ({ account_id: b.id, percent: Number(percents[b.id]) || 0 })),
    )
    setMsg('Guardado')
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold text-slate-900">Asignación por porcentaje</h2>
      <p className="mb-3 text-sm text-slate-500">
        Reparto de la nómina entre buckets. Debe sumar 100%.
      </p>

      <div className="space-y-2">
        {buckets.map((b) => {
          const pct = Number(percents[b.id]) || 0
          return (
            <div key={b.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-slate-700">{b.name}</span>
              <span className="w-28 text-right text-xs text-slate-500">
                {formatEuro(Math.round((incomeCents * pct) / 100))}
              </span>
              <div className="flex w-24 items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={percents[b.id] ?? '0'}
                  onChange={(e) => setPercents((p) => ({ ...p, [b.id]: e.target.value }))}
                  className="text-right"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
        <span className="flex-1 text-sm font-medium text-slate-700">Total</span>
        <span className={cn('text-sm font-semibold', valid ? 'text-emerald-600' : 'text-rose-600')}>
          {sum.toFixed(2).replace('.', ',')}%
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={onSave} loading={save.isPending} disabled={!valid}>
          Guardar
        </Button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </Card>
  )
}

// --- Cuentas y categorías -----------------------------------------------------
const TYPE_LABEL: Record<Enums<'account_type'>, string> = {
  asset: 'Cuentas (activo)',
  income: 'Orígenes de ingreso',
  expense: 'Categorías de gasto',
}

function AccountsCard({ accounts }: { accounts: Account[] }) {
  const archive = useArchiveAccount()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const groups: Enums<'account_type'>[] = ['asset', 'income', 'expense']

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Cuentas y categorías</h2>
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          Añadir
        </Button>
      </div>

      <div className="space-y-4">
        {groups.map((g) => {
          const items = accounts.filter((a) => a.type === g)
          if (items.length === 0) return null
          return (
            <div key={g}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {TYPE_LABEL[g]}
              </p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                    <span className={cn('flex-1 text-sm', a.is_archived ? 'text-slate-400 line-through' : 'text-slate-800')}>
                      {a.name}
                    </span>
                    {a.is_budget_bucket && (
                      <span className="badge bg-indigo-50 text-indigo-700">bucket</span>
                    )}
                    <button
                      onClick={() => {
                        setEditing(a)
                        setOpen(true)
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => archive.mutate({ id: a.id, archived: !a.is_archived })}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100"
                    >
                      {a.is_archived ? 'Restaurar' : 'Archivar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
      >
        <AccountForm account={editing} onDone={() => setOpen(false)} />
      </Modal>
    </Card>
  )
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const save = useSaveAccount()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<Enums<'account_type'>>(account?.type ?? 'expense')
  const [bucket, setBucket] = useState(account?.is_budget_bucket ?? false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Nombre obligatorio')
      return
    }
    try {
      await save.mutateAsync({
        id: account?.id,
        name: name.trim(),
        type,
        is_budget_bucket: bucket,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nombre" htmlFor="acc-name">
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo" htmlFor="acc-type" hint="No cambies el tipo si la cuenta ya tiene movimientos.">
        <Select
          id="acc-type"
          value={type}
          onChange={(e) => setType(e.target.value as Enums<'account_type'>)}
        >
          <option value="asset">Cuenta (activo)</option>
          <option value="income">Origen de ingreso</option>
          <option value="expense">Categoría de gasto</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={bucket}
          onChange={(e) => setBucket(e.target.checked)}
        />
        Usar en la asignación por % (bucket)
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
