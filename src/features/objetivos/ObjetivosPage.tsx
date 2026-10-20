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
import { PencilIcon, TrashIcon } from '@/components/icons'
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
  const actualOf = (g: Goal) =>
    g.linked_account_id ? (balanceById.get(g.linked_account_id) ?? 0) : 0
  // Los objetivos que superan su meta no inflan el total: se recorta a la meta.
  const totalActual = list.reduce((s, g) => s + Math.min(actualOf(g), g.target_cents), 0)
  const totalTarget = list.reduce((s, g) => s + g.target_cents, 0)
  const totalProgress = totalTarget > 0 ? totalActual / totalTarget : 0
  const done = list.filter((g) => g.target_cents > 0 && actualOf(g) >= g.target_cents).length

  return (
    <div>
      <PageTour id="objetivos" />
      <PageHeader
        title="Objetivos"
        subtitle="Lo que ahorras para cada meta"
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
        <div className="space-y-4">
          <section className="rounded-2xl bg-brand p-5 text-white shadow-lg shadow-brand/25">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Ahorrado en objetivos</p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
              {formatEuro(totalActual)}
            </p>
            <p className="mt-1 text-sm text-white/70">
              de {formatEuro(totalTarget)} · {done} de {list.length} cumplido{done === 1 ? '' : 's'}
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"
              role="progressbar"
              aria-label="Progreso total"
              aria-valuenow={Math.round(totalProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-white" style={{ width: `${totalProgress * 100}%` }} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {list.map((g) => {
              const actual = actualOf(g)
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
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{g.name}</h3>
                      <p className="text-xs text-slate-500">
                        {formatEuro(g.monthly_contribution_cents)}/mes planificados
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <button
                        onClick={() => openEdit(g)}
                        aria-label={`Editar ${g.name}`}
                        title="Editar"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(g)}
                        aria-label={`Eliminar ${g.name}`}
                        title="Eliminar"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">
                      <Money cents={actual} />
                      <span className="ml-1 text-sm font-normal text-slate-500">
                        de <Money cents={g.target_cents} />
                      </span>
                    </p>
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <ProgressBar className="mt-2" value={progress} />
                  <p className="mt-2 text-xs text-slate-500">
                    {months === 0
                      ? 'Objetivo cumplido 🎉'
                      : months === null
                        ? 'Sin aportación mensual definida'
                        : `Faltan ${formatEuro(remaining)} · ~${months} mes(es) al ritmo actual`}
                  </p>

                  {(g.deadline || required?.status === 'expired') && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      {g.deadline && (
                        <p>
                          Fecha límite {formatDate(g.deadline)}
                          {required?.status === 'ok' && (
                            <>
                              {' · necesitas '}
                              <strong className="font-semibold text-slate-900">
                                {formatEuro(required.cents)}/mes
                              </strong>
                              {` durante ${required.monthsLeft} mes(es)`}
                            </>
                          )}
                        </p>
                      )}
                      {required?.status === 'expired' && (
                        <p className="mt-1 font-medium text-rose-600">
                          La fecha límite ya ha pasado y todavía falta dinero.
                        </p>
                      )}
                      {required?.status === 'ok' &&
                        (required.cents > g.monthly_contribution_cents ? (
                          <p className="mt-1 font-medium text-amber-600">
                            ⚠ Tu aportación planificada no llega: te faltan{' '}
                            {formatEuro(required.cents - g.monthly_contribution_cents)}/mes.
                          </p>
                        ) : (
                          <p className="mt-1 font-medium text-emerald-600">
                            ✓ Con tu aportación planificada llegas a tiempo.
                          </p>
                        ))}
                    </div>
                  )}

                  {contributed !== null && (
                    <div className={'mt-3 border-t border-slate-100 pt-3'}>
                      <div className="flex justify-between gap-2 text-xs text-slate-500">
                        <span>Aportado este mes</span>
                        <span className="tabular-nums text-slate-700">
                          {formatEuro(contributed)} de {formatEuro(g.monthly_contribution_cents)}
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
                </Card>
              )
            })}
          </div>
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
