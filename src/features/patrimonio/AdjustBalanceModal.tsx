import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button, Field, Input } from '@/components/ui'
import { Money } from '@/components/Money'
import { formatEuro, tryEuroToCents } from '@/lib/money'
import { useAdjustBalance } from '@/lib/queries'

export type AdjustTarget = { id: string; name: string; balanceCents: number }

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function AdjustBalanceModal({
  account,
  onClose,
}: {
  account: AdjustTarget | null
  onClose: () => void
}) {
  return (
    <Modal open={!!account} onClose={onClose} title={`Ajustar saldo · ${account?.name ?? ''}`}>
      {account && <AdjustForm account={account} onDone={onClose} />}
    </Modal>
  )
}

function AdjustForm({ account, onDone }: { account: AdjustTarget; onDone: () => void }) {
  const adjust = useAdjustBalance()
  const [real, setReal] = useState(centsToInput(account.balanceCents))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const targetCents = tryEuroToCents(real)
  const delta = targetCents === null ? null : targetCents - account.balanceCents

  async function onSubmit() {
    setError(null)
    if (targetCents === null) {
      setError('Importe no válido')
      return
    }
    if (delta === 0) {
      setError('El saldo ya coincide; no hay nada que ajustar')
      return
    }
    try {
      await adjust.mutateAsync({
        accountId: account.id,
        targetCents,
        currentCents: account.balanceCents,
        description: note,
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ajustar')
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Saldo actual (derivado)</span>
        <Money cents={account.balanceCents} className="font-semibold" />
      </div>

      <Field
        label="Saldo real (€)"
        htmlFor="real"
        hint="El valor real de la cuenta hoy. Se registrará la diferencia como ajuste."
        error={error ?? undefined}
      >
        <Input
          id="real"
          inputMode="decimal"
          value={real}
          onChange={(e) => setReal(e.target.value)}
          invalid={targetCents === null}
        />
      </Field>

      {delta !== null && delta !== 0 && (
        <p className="text-sm text-slate-600">
          Ajuste:{' '}
          <span className={delta > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
            {delta > 0 ? '+' : '−'}
            {formatEuro(Math.abs(delta))}
          </span>{' '}
          {delta > 0 ? '(plusvalía)' : '(minusvalía)'}
        </p>
      )}

      <Field label="Nota (opcional)" htmlFor="note">
        <Input
          id="note"
          placeholder="p. ej. Revalorización Q2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={adjust.isPending} disabled={delta === 0}>
          Guardar ajuste
        </Button>
      </div>
    </form>
  )
}
