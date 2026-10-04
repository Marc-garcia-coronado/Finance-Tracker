import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { useConfirm } from '@/components/confirmContext'
import { Money } from '@/components/Money'
import { ProgressBar } from '@/components/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { tryEuroToCents, formatEuro } from '@/lib/money'
import { monthsToTarget, requiredMonthlyContribution } from '@/lib/metrics'
import { currentMonthKey, formatDate, todayISO } from '@/lib/dates'
import {
  useAccounts,
  useBalances,
  useDeleteGoal,
  useGoals,
  useSaveGoal,
  useTransferInflows,
  type Goal,
} from '@/lib/queries'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

export function ObjetivosPage() {
  const goals = useGoals()
  const balances = useBalances()
  const accounts = useAccounts()
  const inflows = useTransferInflows(currentMonthKey())
  const del = useDeleteGoal()
  const confirmDialog = useConfirm()
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
    const ok = await confirmDialog({
      title: 'Eliminar objetivo',
      message: `¿Eliminar el objetivo "${g.name}"?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    await del.mutateAsync(g.id)
  }

  const list = goals.data ?? []

  return (
    <div>
      <PageTour id="objetivos" />
      <PageHeader
        title="Objetivos"
        onHelp={() => showTour('objetivos')}
        action={<Button onClick={openNew}>Nuevo</Button>}
      />

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
            const required = g.deadline
              ? requiredMonthlyContribution(remaining, g.deadline, todayISO())
              : null
            // Aportación real del mes: traspasos netos a la cuenta vinculada.
            const contributed = g.linked_account_id
              ? Math.max(0, inflows.data?.get(g.linked_account_id) ?? 0)
              : null
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

                  {g.deadline && (
                    <p className="mt-1 text-xs text-slate-500">
                      Fecha límite {formatDate(g.deadline)}
                      {required?.status === 'ok' && (
                        <>
                          {' · necesitas '}
                          <strong className="font-semibold text-slate-700">
                            {formatEuro(required.cents)}/mes
                          </strong>
                          {` durante ${required.monthsLeft} mes(es)`}
                        </>
                      )}
                    </p>
                  )}
                  {required?.status === 'expired' && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      La fecha límite ya ha pasado y todavía falta dinero.
                    </p>
                  )}
                  {required?.status === 'ok' &&
                    (required.cents > g.monthly_contribution_cents ? (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        ⚠ Tu aportación planificada ({formatEuro(g.monthly_contribution_cents)}/mes)
                        no llega: te faltan {formatEuro(required.cents - g.monthly_contribution_cents)}
                        /mes.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-emerald-600">
                        ✓ Con tu aportación planificada llegas a tiempo.
                      </p>
                    ))}

                  {contributed !== null && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Aportado este mes</span>
                        <span className="tabular-nums text-slate-700">
                          {formatEuro(contributed)} de {formatEuro(g.monthly_contribution_cents)}{' '}
                          planificados
                        </span>
                      </div>
                      {g.monthly_contribution_cents > 0 && (
                        <ProgressBar
                          className="mt-1.5"
                          value={Math.min(1, contributed / g.monthly_contribution_cents)}
                        />
                      )}
                    </div>
                  )}
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
  deadline: z.string(), // '' = sin fecha límite
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
      deadline: goal?.deadline ?? '',
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
        deadline: v.deadline || null,
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
        label="Fecha límite (opcional)"
        htmlFor="deadline"
        hint="Calcula cuánto necesitas aportar al mes para llegar a tiempo."
        error={errors.deadline?.message}
      >
        <Input id="deadline" type="date" {...register('deadline')} />
      </Field>
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
