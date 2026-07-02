import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { Money } from '@/components/Money'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { cn } from '@/lib/cn'
import { tryEuroToCents } from '@/lib/money'
import { currentMonthKey, formatMonthLabel, recentMonths, todayISO } from '@/lib/dates'
import {
  useAccounts,
  useDeleteRecurring,
  useGenerateRecurring,
  useRecurring,
  useSaveRecurring,
  type Account,
  type Recurring,
} from '@/lib/queries'
import { PageTour } from '@/features/onboarding/PageTour'
import { showTour } from '@/features/onboarding/tourStorage'

const MONTHS = recentMonths(6)

export function RecurrentesPage() {
  const recurring = useRecurring()
  const accounts = useAccounts()
  const del = useDeleteRecurring()
  const generate = useGenerateRecurring()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [genMonth, setGenMonth] = useState(currentMonthKey())
  const [genMsg, setGenMsg] = useState<string | null>(null)

  if (recurring.isLoading || accounts.isLoading) return <LoadingState />
  if (recurring.isError)
    return <ErrorState error={recurring.error} onRetry={() => recurring.refetch()} />

  const byId = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  const list = recurring.data ?? []

  async function onGenerate() {
    setGenMsg(null)
    try {
      const r = await generate.mutateAsync(genMonth)
      setGenMsg(
        `${r.created} creado(s), ${r.skipped} ya existía(n) en ${formatMonthLabel(genMonth)}.`,
      )
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : 'Error al generar')
    }
  }
  async function onDelete(r: Recurring) {
    if (!confirm(`¿Eliminar la plantilla "${r.description}"?`)) return
    await del.mutateAsync(r.id)
  }

  return (
    <div>
      <PageTour id="recurrentes" />
      <PageHeader
        title="Recurrentes"
        subtitle="Plantillas que generan movimientos. Generar es idempotente: no duplica."
        onHelp={() => showTour('recurrentes')}
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            Nueva
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-medium text-slate-700">Generar movimientos de</span>
        <Select className="w-auto" value={genMonth} onChange={(e) => setGenMonth(e.target.value)}>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </Select>
        <Button onClick={onGenerate} loading={generate.isPending}>
          Generar
        </Button>
        {genMsg && <span className="text-sm text-slate-600">{genMsg}</span>}
      </Card>

      {list.length === 0 ? (
        <EmptyState
          title="Sin plantillas recurrentes"
          description="Crea plantillas para tus gastos e ingresos fijos."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Nueva plantilla
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {list.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-800">{r.description}</span>
                  {!r.is_active && (
                    <span className="badge bg-slate-100 text-slate-500">Inactiva</span>
                  )}
                  <span className="badge bg-slate-100 text-slate-500">
                    {r.cadence === 'monthly' ? 'Mensual' : 'Anual'} · día {r.day_of_month}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {byId.get(r.from_account_id) ?? '—'} → {byId.get(r.to_account_id) ?? '—'}
                </p>
              </div>
              <Money cents={r.amount_cents} className={cn('shrink-0 font-semibold', !r.is_active && 'text-slate-400')} />
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setEditing(r)
                    setOpen(true)
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(r)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar plantilla' : 'Nueva plantilla'}
      >
        <RecurringForm
          template={editing}
          accounts={(accounts.data ?? []).filter((a) => !a.is_archived)}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </div>
  )
}

const schema = z
  .object({
    description: z.string().min(1, 'Descripción obligatoria'),
    amount: z.string().refine((v) => {
      const c = tryEuroToCents(v)
      return c !== null && c > 0
    }, 'Importe no válido'),
    kind: z.enum(['expense', 'income', 'transfer']),
    from_account_id: z.string().min(1, 'Selecciona una cuenta'),
    to_account_id: z.string().min(1, 'Selecciona una cuenta'),
    cadence: z.enum(['monthly', 'annual']),
    day_of_month: z.coerce.number().int().min(1).max(28),
    is_active: z.boolean(),
  })
  .refine((d) => d.from_account_id !== d.to_account_id, {
    path: ['to_account_id'],
    message: 'Debe ser distinta del origen',
  })
type FormValues = z.infer<typeof schema>

function RecurringForm({
  template,
  accounts,
  onDone,
}: {
  template: Recurring | null
  accounts: Account[]
  onDone: () => void
}) {
  const save = useSaveRecurring()
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: template?.description ?? '',
      amount: template ? String(template.amount_cents / 100).replace('.', ',') : '',
      kind: (template?.kind as FormValues['kind']) ?? 'expense',
      from_account_id: template?.from_account_id ?? '',
      to_account_id: template?.to_account_id ?? '',
      cadence: template?.cadence ?? 'monthly',
      day_of_month: template?.day_of_month ?? 1,
      is_active: template?.is_active ?? true,
    },
  })

  const kind = watch('kind')
  const { fromOptions, toOptions } = useMemo(() => {
    const assets = accounts.filter((a) => a.type === 'asset')
    const incomes = accounts.filter((a) => a.type === 'income')
    const expenses = accounts.filter((a) => a.type === 'expense')
    if (kind === 'expense') return { fromOptions: assets, toOptions: expenses }
    if (kind === 'income') return { fromOptions: incomes, toOptions: assets }
    return { fromOptions: assets, toOptions: assets }
  }, [kind, accounts])

  // Si cambia el tipo y las cuentas elegidas ya no son válidas, límpialas.
  const isFirst = useMemo(() => ({ current: true }), [])
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    setValue('from_account_id', '')
    setValue('to_account_id', '')
  }, [kind, setValue, isFirst])

  async function onSubmit(v: FormValues) {
    try {
      await save.mutateAsync({
        id: template?.id,
        description: v.description.trim(),
        amount_cents: tryEuroToCents(v.amount)!,
        from_account_id: v.from_account_id,
        to_account_id: v.to_account_id,
        kind: v.kind,
        cadence: v.cadence,
        day_of_month: v.day_of_month,
        next_run_on: template?.next_run_on ?? todayISO(),
        is_active: v.is_active,
      })
      onDone()
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : 'No se pudo guardar' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
        <Input id="description" invalid={!!errors.description} {...register('description')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe (€)" htmlFor="amount" error={errors.amount?.message}>
          <Input id="amount" inputMode="decimal" placeholder="0,00" invalid={!!errors.amount} {...register('amount')} />
        </Field>
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" {...register('kind')}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="transfer">Traspaso</option>
          </Select>
        </Field>
      </div>

      <Field label="Desde" htmlFor="from_account_id" error={errors.from_account_id?.message}>
        <Select id="from_account_id" invalid={!!errors.from_account_id} {...register('from_account_id')}>
          <option value="">Selecciona…</option>
          {fromOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Hacia" htmlFor="to_account_id" error={errors.to_account_id?.message}>
        <Select id="to_account_id" invalid={!!errors.to_account_id} {...register('to_account_id')}>
          <option value="">Selecciona…</option>
          {toOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cadencia" htmlFor="cadence">
          <Select id="cadence" {...register('cadence')}>
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </Select>
        </Field>
        <Field label="Día del mes (1-28)" htmlFor="day_of_month" error={errors.day_of_month?.message}>
          <Input id="day_of_month" type="number" min={1} max={28} invalid={!!errors.day_of_month} {...register('day_of_month')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('is_active')} />
        Activa
      </label>

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
