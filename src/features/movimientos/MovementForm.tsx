import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field, Input, Select } from '@/components/ui'
import { tryEuroToCents } from '@/lib/money'
import { todayISO } from '@/lib/dates'
import { useAccounts, useCreateEntry } from '@/lib/queries'
import type { EntryKind } from '@/lib/entries'

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

export function MovementForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts()
  const createEntry = useCreateEntry()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'expense', date: todayISO(), description: '', amount: '' },
  })

  const kind = watch('kind') as EntryKind
  const active = (accounts.data ?? []).filter((a) => !a.is_archived)

  const { fromOptions, toOptions } = useMemo(() => {
    const assets = active.filter((a) => a.type === 'asset')
    const incomes = active.filter((a) => a.type === 'income')
    const expenses = active.filter((a) => a.type === 'expense')
    if (kind === 'expense') return { fromOptions: assets, toOptions: expenses }
    if (kind === 'income') return { fromOptions: incomes, toOptions: assets }
    return { fromOptions: assets, toOptions: assets }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, accounts.data])

  // Al cambiar el tipo, limpia las cuentas para no dejar combinaciones inválidas.
  useEffect(() => {
    setValue('fromAccountId', '')
    setValue('toAccountId', '')
  }, [kind, setValue])

  async function onSubmit(values: FormValues) {
    const amountCents = tryEuroToCents(values.amount)
    if (amountCents === null || amountCents <= 0) {
      setError('amount', { message: 'Importe no válido' })
      return
    }
    try {
      await createEntry.mutateAsync({
        kind: values.kind,
        date: values.date,
        description: values.description?.trim() ?? '',
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amountCents,
      })
      onDone()
    } catch (e) {
      setError('root', {
        message: e instanceof Error ? e.message : 'No se pudo guardar',
      })
    }
  }

  const labels = KIND_LABEL[kind]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={labels.to} htmlFor="toAccountId" error={errors.toAccountId?.message}>
        <Select id="toAccountId" invalid={!!errors.toAccountId} {...register('toAccountId')}>
          <option value="">Selecciona…</option>
          {toOptions.map((a) => (
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
          Guardar {labels.verb.toLowerCase()}
        </Button>
      </div>
    </form>
  )
}
