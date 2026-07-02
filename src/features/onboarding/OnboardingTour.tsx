import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  ArrowsRightLeftIcon,
  CalendarIcon,
  LockIcon,
  SettingsIcon,
  TargetIcon,
} from '@/components/icons'
import { TourDialog, type TourStep } from './TourDialog'
import {
  WELCOME_DONE_EVENT,
  WELCOME_SHOW_EVENT,
  WELCOME_STORAGE,
  isDone,
  markDone,
  userKey,
} from './tourStorage'

export { showOnboarding } from './tourStorage'

const STEPS: TourStep[] = [
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
      'Indica tu ingreso mensual y revisa tus cuentas en Configuración. Cada sección te enseñará una mini-guía la primera vez que entres; el botón «?» junto al título la reabre cuando quieras.',
  },
]

// Tutorial de bienvenida por pasos. Se muestra solo la primera vez que el
// usuario entra (persistido en localStorage por usuario) y puede reabrirse
// con showOnboarding().
export function OnboardingTour() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const key = userKey(WELCOME_STORAGE, session?.user.id)
  const [open, setOpen] = useState(() => !isDone(key))

  useEffect(() => {
    function onShow() {
      setOpen(true)
    }
    window.addEventListener(WELCOME_SHOW_EVENT, onShow)
    return () => window.removeEventListener(WELCOME_SHOW_EVENT, onShow)
  }, [])

  function close() {
    markDone(key)
    setOpen(false)
    // Da paso a los tours de sección que estuvieran esperando.
    window.dispatchEvent(new Event(WELCOME_DONE_EVENT))
  }

  return (
    <TourDialog
      open={open}
      steps={STEPS}
      onClose={close}
      finalAction={{ label: 'Ir a Configuración', onClick: () => navigate('/config') }}
    />
  )
}
