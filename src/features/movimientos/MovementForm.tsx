import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field, Input, Select } from '@/components/ui'
import { tryEuroToCents } from '@/lib/money'
import { todayISO } from '@/lib/dates'
import { entryToFormValues, type MovementFormValues } from '@/lib/entryForm'
import { useAccounts, useCreateEntry, useReplaceEntry, type EntryWithLines } from '@/lib/queries'
import type { EntryKind } from '@/lib/entries'
import {
  pickDefaultAccount,
  readLastExpenseAccount,
  saveLastExpenseAccount,
} from '@/lib/lastAccount'

const schema = z
  .object({
    kind: z.enum(['expense', 'income', 'transfer']),
    date: z.string().min(1, 'Fecha obligatoria'),
    description: z.string().max(200).optional(),
    amount: z
      .string()
      .min(1, 'Importe obligatorio')
      .refine((v) => {
        const c = tryEuroToCents(v)
        return c !== null && c > 0
      }, 'Importe no válido (debe ser mayor que 0)'),
    fromAccountId: z.string().min(1, 'Selecciona una cuenta'),
    toAccountId: z.string().min(1, 'Selecciona una cuenta'),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    path: ['toAccountId'],
    message: 'Debe ser distinta del origen',
  })

type FormValues = z.infer<typeof schema>

const KIND_LABEL: Record<EntryKind, { from: string; to: string; verb: string }> = {
  expense: { from: 'Pagada desde', to: 'Categoría de gasto', verb: 'Gasto' },
  income: { from: 'Origen del ingreso', to: 'Ingresa en', verb: 'Ingreso' },
  transfer: { from: 'Desde', to: 'Hacia', verb: 'Traspaso' },
}

// Con `entry`, modo edición: el formulario se rellena con el movimiento y al
// guardar se anula el original y se crea el corregido (replace_entry, atómico).
export function MovementForm({ onDone, entry }: { onDone: () => void; entry?: EntryWithLines }) {
  const accounts = useAccounts()
  const createEntry = useCreateEntry()
  const replaceEntry = useReplaceEntry()

  const initial: MovementFormValues = useMemo(
    () =>
      entry
        ? entryToFormValues(entry)
        : { kind: 'expense', date: todayISO(), description: '', amount: '', fromAccountId: '', toAccountId: '' },
    [entry],
  )

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  })

  const kind = watch('kind') as EntryKind
  // En edición se muestran también las cuentas archivadas que ya usa el movimiento.
  const keep = new Set([initial.fromAccountId, initial.toAccountId])
  const selectable = (accounts.data ?? []).filter((a) => !a.is_archived || keep.has(a.id))

  const { fromOptions, toOptions } = useMemo(() => {
    const assets = selectable.filter((a) => a.type === 'asset')
    const incomes = selectable.filter((a) => a.type === 'income')
    const expenses = selectable.filter((a) => a.type === 'expense')
    if (kind === 'expense') return { fromOptions: assets, toOptions: expenses }
    if (kind === 'income') return { fromOptions: incomes, toOptions: assets }
    return { fromOptions: assets, toOptions: assets }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, accounts.data])

  // Al cambiar el tipo, limpia las cuentas para no dejar combinaciones inválidas.
  // Solo si el tipo cambia de verdad (no al montar, ni en el doble efecto de
  // StrictMode): en edición borraría las cuentas precargadas.
  const prevKind = useRef(kind)
  useEffect(() => {
    if (prevKind.current === kind) return
    prevKind.current = kind
    setValue('fromAccountId', '')
    setValue('toAccountId', '')
  }, [kind, setValue])

  // Alta nueva: preselecciona la última cuenta usada para gastos, una vez
  // cargadas las cuentas y solo si el usuario aún no ha elegido nada.
  const accountsLoaded = accounts.data !== undefined
  useEffect(() => {
    if (entry || !accountsLoaded) return
    if (getValues('kind') !== 'expense' || getValues('fromAccountId')) return
    const assetIds = fromOptions.map((a) => a.id)
    const last = pickDefaultAccount(readLastExpenseAccount(), assetIds)
    if (last) setValue('fromAccountId', last)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsLoaded])

  async function onSubmit(values: FormValues) {
    const amountCents = tryEuroToCents(values.amount)
    if (amountCents === null || amountCents <= 0) {
      setError('amount', { message: 'Importe no válido' })
      return
    }
    if (entry && !isDirty) {
      onDone() // sin cambios: no se anula ni se recrea nada
      return
    }
    const params = {
      kind: values.kind,
      date: values.date,
      description: values.description?.trim() ?? '',
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      amountCents,
    }
    try {
      if (entry) await replaceEntry.mutateAsync({ id: entry.id, params })
      else {
        await createEntry.mutateAsync(params)
        if (params.kind === 'expense') saveLastExpenseAccount(params.fromAccountId)
      }
      onDone()
    } catch (e) {
      setError('root', {
        message: e instanceof Error ? e.message : 'No se pudo guardar',
      })
    }
  }

  const labels = KIND_LABEL[kind]
  const label = (a: { name: string; is_archived: boolean }) => a.name + (a.is_archived ? ' (archivada)' : '')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {entry && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Al guardar, el movimiento original se anula y se crea uno nuevo con los cambios. El
          original queda en el historial como «Anulado».
        </p>
      )}

      <Field label="Tipo" htmlFor="kind">
        <Select id="kind" {...register('kind')}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Traspaso</option>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" invalid={!!errors.date} {...register('date')} />
        </Field>
        <Field label="Importe (€)" htmlFor="amount" error={errors.amount?.message}>
          <Input
            id="amount"
            data-autofocus={entry ? undefined : ''}
            inputMode="decimal"
            placeholder="0,00"
            invalid={!!errors.amount}
            {...register('amount')}
          />
        </Field>
      </div>

      <Field label="Concepto" htmlFor="description" error={errors.description?.message}>
        <Input id="description" placeholder="Opcional" {...register('description')} />
      </Field>

      <Field label={labels.from} htmlFor="fromAccountId" error={errors.fromAccountId?.message}>
        <Select id="fromAccountId" invalid={!!errors.fromAccountId} {...register('fromAccountId')}>
          <option value="">Selecciona…</option>
          {fromOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {label(a)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={labels.to} htmlFor="toAccountId" error={errors.toAccountId?.message}>
        <Select id="toAccountId" invalid={!!errors.toAccountId} {...register('toAccountId')}>
          <option value="">Selecciona…</option>
          {toOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {label(a)}
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
          {entry ? 'Guardar cambios' : `Guardar ${labels.verb.toLowerCase()}`}
        </Button>
      </div>
    </form>
  )
}
