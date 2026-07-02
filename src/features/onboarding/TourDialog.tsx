import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'

export type TourStep = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
}

// Diálogo de tutorial por pasos (bottom sheet en móvil). Presentacional:
// quién lo abre y cuándo se persiste lo decide el componente que lo usa.
export function TourDialog({
  open,
  steps,
  onClose,
  finalAction,
}: {
  open: boolean
  steps: TourStep[]
  onClose: () => void
  // Acción destacada del último paso (p. ej. «Ir a Configuración»).
  finalAction?: { label: string; onClick: () => void }
}) {
  const [step, setStep] = useState(0)

  // Al reabrir, siempre desde el principio.
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || steps.length === 0) return null

  const current = steps[step] ?? steps[0]!
  const isLast = step >= steps.length - 1
  const Icon = current.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-6"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600 ring-1 ring-indigo-100">
            <Icon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{current.title}</h2>
          <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-slate-600">
            {current.description}
          </p>
        </div>

        <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-5 bg-indigo-600' : 'w-1.5 bg-slate-200',
              )}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {!isLast ? (
            <>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Saltar
              </button>
              <div className="ml-auto flex gap-2">
                {step > 0 && (
                  <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                    Atrás
                  </Button>
                )}
                <Button onClick={() => setStep((s) => s + 1)}>Siguiente</Button>
              </div>
            </>
          ) : finalAction ? (
            <div className="flex w-full flex-col gap-2">
              <Button
                onClick={() => {
                  onClose()
                  finalAction.onClick()
                }}
                className="w-full"
              >
                {finalAction.label}
              </Button>
              <Button variant="secondary" onClick={onClose} className="w-full">
                Explorar por mi cuenta
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                  Atrás
                </Button>
              )}
              <Button onClick={onClose} className="flex-1">
                ¡Entendido!
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
