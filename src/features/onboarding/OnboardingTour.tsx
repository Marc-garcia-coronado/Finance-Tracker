import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  ArrowsRightLeftIcon,
  CalendarIcon,
  LockIcon,
  SettingsIcon,
  TargetIcon,
} from '@/components/icons'

const STORAGE_KEY = 'finanzas.onboarding.v1'
const SHOW_EVENT = 'finanzas:show-onboarding'

// Reabre el tutorial desde cualquier parte de la app (p. ej. Configuración).
export function showOnboarding() {
  window.dispatchEvent(new Event(SHOW_EVENT))
}

type Step = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    icon: LockIcon,
    title: 'Bienvenido a Finanzas',
    description:
      'Controla tus gastos, tu ahorro y tu patrimonio en un solo sitio. Tus datos van cifrados de extremo a extremo: solo tú puedes leerlos.',
  },
  {
    icon: ArrowsRightLeftIcon,
    title: 'Apunta tus movimientos',
    description:
      'En Movimientos registras gastos e ingresos en segundos. También puedes importar el CSV de tu banco para no teclearlos a mano.',
  },
  {
    icon: CalendarIcon,
    title: 'Controla tu mes',
    description:
      'Mensual compara lo que llevas gastado con lo asignado a cada categoría, para saber si vas bien antes de que acabe el mes.',
  },
  {
    icon: TargetIcon,
    title: 'Ahorra con intención',
    description:
      'Crea metas en Objetivos y automatiza pagos fijos con Recurrentes (en el móvil están en la pestaña «Más»). Patrimonio muestra cómo evolucionan tus cuentas.',
  },
  {
    icon: SettingsIcon,
    title: 'Un último paso',
    description:
      'Indica tu ingreso mensual y revisa tus cuentas y categorías en Configuración. Con eso, la asignación por porcentajes hace el resto.',
  },
]

function storageKey(userId: string | undefined) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
}

// Tutorial de bienvenida por pasos. Se muestra solo la primera vez que el
// usuario entra (persistido en localStorage por usuario) y puede reabrirse
// con showOnboarding().
export function OnboardingTour() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const key = storageKey(session?.user.id)
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(key)
    } catch {
      return false
    }
  })
  const [step, setStep] = useState(0)

  useEffect(() => {
    function onShow() {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(SHOW_EVENT, onShow)
    return () => window.removeEventListener(SHOW_EVENT, onShow)
  }, [])

  function close() {
    try {
      localStorage.setItem(key, 'done')
    } catch {
      // ignorar (modo privado, etc.)
    }
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const current = STEPS[step] ?? STEPS[0]!
  const isLast = step >= STEPS.length - 1
  const Icon = current.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
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
          {STEPS.map((_, i) => (
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
                onClick={close}
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
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Button
                onClick={() => {
                  close()
                  navigate('/config')
                }}
                className="w-full"
              >
                Ir a Configuración
              </Button>
              <Button variant="secondary" onClick={close} className="w-full">
                Explorar por mi cuenta
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
