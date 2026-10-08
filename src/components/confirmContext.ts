import { createContext, useContext } from 'react'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string // por defecto «Confirmar»
  cancelLabel?: string // por defecto «Cancelar»
  destructive?: boolean // botón rojo
}

// Resuelve true al confirmar y false al cancelar (botón, Esc o clic fuera).
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

// Sustituto del diálogo nativo del navegador:
//   const ask = useConfirm(); if (!(await ask({ title: '…' }))) return
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm requiere <ConfirmProvider>')
  return fn
}
