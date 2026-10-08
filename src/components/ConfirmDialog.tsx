import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirmContext'

type Pending = { options: ConfirmOptions; resolve: (ok: boolean) => void }

// Monta un único diálogo de confirmación para toda la app (ver useConfirm).
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok)
    pendingRef.current = null
    setPending(null)
  }, [])

  const confirm = useCallback<ConfirmFn>((options) => {
    // Si ya había una confirmación abierta, se cancela.
    pendingRef.current?.resolve(false)
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const options = pending?.options
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!pending} onClose={() => settle(false)} title={options?.title ?? ''}>
        {options?.message && <p className="mb-4 text-sm text-slate-600">{options.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            type="button"
            variant={options?.destructive ? 'danger' : 'primary'}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}
