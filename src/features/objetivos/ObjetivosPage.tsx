import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { Money } from '@/components/Money'
import { ProgressBar } from '@/components/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { tryEuroToCents, formatEuro } from '@/lib/money'
import { monthsToTarget } from '@/lib/metrics'
import {
  useAccounts,
  useBalances,
  useDeleteGoal,
  useGoals,
  useSaveGoal,
  type Goal,
} from '@/lib/queries'

export function ObjetivosPage() {
  const goals = useGoals()
  const balances = useBalances()
  const accounts = useAccounts()
  const del = useDeleteGoal()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [open, setOpen] = useState(false)

  if (goals.isLoading || balances.isLoading) return <LoadingState />
  if (goals.isError)
    return <ErrorState error={goals.error} onRetry={() => goals.refetch()} />

  const balanceById = new Map(
    (balances.data ?? []).map((b) => [b.account_id, b.balance_cents ?? 0]),
  )

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(g: Goal) {
    setEditing(g)
    setOpen(true)
  }
  async function onDelete(g: Goal) {
    if (!confirm(`¿Eliminar el objetivo "${g.name}"?`)) return
    await del.mutateAsync(g.id)
  }

  const list = goals.data ?? []

  return (
    <div>
      <PageHeader title="Objetivos" action={<Button onClick={openNew}>Nuevo</Button>} />

      {list.length === 0 ? (
        <EmptyState
          title="Sin objetivos"
          description="Crea un objetivo (p. ej. el fondo de emergencia) vinculado a una cuenta de activo."
          action={<Button onClick={openNew}>Nuevo objetivo</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((g) => {
            const actual = g.linked_account_id
              ? (balanceById.get(g.linked_account_id) ?? 0)
              : 0
            const remaining = Math.max(0, g.target_cents - actual)
            const progress = g.target_cents > 0 ? actual / g.target_cents : 0
            const months = monthsToTarget(remaining, g.monthly_contribution_cents)
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{g.name}</h3>
                    <p className="text-xs text-slate-500">
                      Meta {formatEuro(g.target_cents)} · {formatEuro(g.monthly_contribution_cents)}/mes
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(g)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(g)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <ProgressBar value={progress} />
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-slate-600">
                      <Money cents={actual} /> de <Money cents={g.target_cents} />
                    </span>
                    <span className="font-medium text-slate-900">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Faltan <Money cents={remaining} />
                    {months === 0
                      ? ' · objetivo cumplido 🎉'
                      : months === null
                        ? ' · sin aportación mensual definida'
                        : ` · ~${months} mes(es) al ritmo actual`}
                  </p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar objetivo' : 'Nuevo objetivo'}
      >
        <GoalForm
          goal={editing}
          assetAccounts={(accounts.data ?? []).filter(
            (a) => a.type === 'asset' && !a.is_archived,
          )}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </div>
  )
}

const schema = z.object({
  name: z.string().min(1, 'Nombre obligatorio'),
  target: z.string().refine((v) => {
    const c = tryEuroToCents(v)
    return c !== null && c > 0
  }, 'Meta no válida'),
  monthly: z.string().refine((v) => {
    const c = tryEuroToCents(v)
    return c !== null && c >= 0
  }, 'Aportación no válida'),
  linked_account_id: z.string(),
})
type FormValues = z.infer<typeof schema>

function GoalForm({
  goal,
  assetAccounts,
  onDone,
}: {
  goal: Goal | null
  assetAccounts: { id: string; name: string }[]
  onDone: () => void
}) {
  const save = useSaveGoal()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: goal?.name ?? '',
      target: goal ? String(goal.target_cents / 100).replace('.', ',') : '',
      monthly: goal ? String(goal.monthly_contribution_cents / 100).replace('.', ',') : '',
      linked_account_id: goal?.linked_account_id ?? '',
    },
  })

  async function onSubmit(v: FormValues) {
    try {
      await save.mutateAsync({
        id: goal?.id,
        name: v.name.trim(),
        target_cents: tryEuroToCents(v.target)!,
        monthly_contribution_cents: tryEuroToCents(v.monthly)!,
        linked_account_id: v.linked_account_id || null,
      })
      onDone()
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : 'No se pudo guardar' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <Input id="name" invalid={!!errors.name} {...register('name')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meta (€)" htmlFor="target" error={errors.target?.message}>
          <Input id="target" inputMode="decimal" placeholder="0,00" invalid={!!errors.target} {...register('target')} />
        </Field>
        <Field label="Aportación/mes (€)" htmlFor="monthly" error={errors.monthly?.message}>
          <Input id="monthly" inputMode="decimal" placeholder="0,00" invalid={!!errors.monthly} {...register('monthly')} />
        </Field>
      </div>
      <Field
        label="Cuenta vinculada"
        htmlFor="linked_account_id"
        hint="El saldo actual del objetivo se lee de esta cuenta de activo."
        error={errors.linked_account_id?.message}
      >
        <Select id="linked_account_id" {...register('linked_account_id')}>
          <option value="">Sin vincular</option>
          {assetAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      {errors.root && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {errors.root.message}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
