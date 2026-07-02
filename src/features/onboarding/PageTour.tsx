import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  ArrowsRightLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  DownloadIcon,
  FunnelIcon,
  HomeIcon,
  LinkIcon,
  PencilIcon,
  PercentIcon,
  RepeatIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  UndoIcon,
  WalletIcon,
} from '@/components/icons'
import { TourDialog, type TourStep } from './TourDialog'
import {
  SHOW_TOUR_EVENT,
  WELCOME_DONE_EVENT,
  isDone,
  isWelcomeDone,
  markDone,
  tourKey,
} from './tourStorage'

export type TourId =
  | 'movimientos'
  | 'mensual'
  | 'recurrentes'
  | 'objetivos'
  | 'patrimonio'
  | 'config'

// Guía de cada sección, pensada para quien entra por primera vez.
const PAGE_TOURS: Record<TourId, TourStep[]> = {
  movimientos: [
    {
      icon: ArrowsRightLeftIcon,
      title: 'Tus gastos e ingresos',
      description:
        'Aquí queda apuntado todo: cada gasto sale de una cuenta (p. ej. Banco) hacia una categoría (p. ej. Necesidades); cada ingreso entra desde un origen (p. ej. Nómina) a una cuenta; y un traspaso mueve dinero entre tus cuentas.',
    },
    {
      icon: DownloadIcon,
      title: 'Añadir es rápido',
      description:
        'Con «Nuevo» registras un movimiento en segundos: tipo, importe, fecha y cuentas. Con «Importar» subes el CSV de tu banco y se cargan de golpe, sin duplicar los que ya existan.',
    },
    {
      icon: FunnelIcon,
      title: 'Encuentra cualquier cosa',
      description:
        'Usa los filtros de mes y tipo para revisar lo que quieras: los gastos de este mes, solo los ingresos, los traspasos… La lista se pagina de 20 en 20.',
    },
    {
      icon: UndoIcon,
      title: '¿Un error? Anula, no borres',
      description:
        'El botón «Anular» crea el movimiento inverso en vez de borrar: tus saldos vuelven a cuadrar y el historial queda intacto. Es contabilidad por partida doble.',
    },
  ],
  mensual: [
    {
      icon: CalendarIcon,
      title: 'Tu mes de un vistazo',
      description:
        'Arriba tienes los ingresos, los gastos y el flujo neto (lo que te queda) del mes elegido. Cambia de mes con el selector de la esquina superior.',
    },
    {
      icon: ChartBarIcon,
      title: '¿A dónde va el dinero?',
      description:
        'Las dos tablas desglosan ingresos y gastos por categoría, con su total. Así ves en qué se te va el mes y qué categoría se dispara.',
    },
    {
      icon: ArrowsRightLeftIcon,
      title: 'Los traspasos no cuentan',
      description:
        'Mover dinero entre tus cuentas (p. ej. del banco al fondo de emergencia) no es ni gasto ni ingreso, así que no afecta al flujo neto. Abajo tienes también el acumulado del año.',
    },
  ],
  recurrentes: [
    {
      icon: RepeatIcon,
      title: 'Plantillas de pagos fijos',
      description:
        'Alquiler, suscripciones, nómina… Crea una plantilla con su importe, sus cuentas y su día del mes, y olvídate de teclearlos cada vez.',
    },
    {
      icon: CalendarIcon,
      title: 'Genera el mes con un botón',
      description:
        '«Generar» crea de una vez todos los movimientos del mes elegido a partir de tus plantillas. Es idempotente: si ya existían, no se duplican, así que puedes pulsarlo sin miedo.',
    },
    {
      icon: HomeIcon,
      title: 'Tu gasto fijo mínimo',
      description:
        'Los recurrentes marcados como fijos definen tu «suelo de necesidades»: el Dashboard lo compara con lo que asignas a Necesidades para avisarte si no te llega.',
    },
  ],
  objetivos: [
    {
      icon: TargetIcon,
      title: 'Metas de ahorro',
      description:
        'Define qué quieres conseguir (p. ej. un fondo de emergencia de 10.000 €) y cuánto piensas aportar al mes. La app te dice cuántos meses faltan a ese ritmo.',
    },
    {
      icon: LinkIcon,
      title: 'Vincúlalo a una cuenta',
      description:
        'Si vinculas el objetivo a una cuenta de activo, el progreso se calcula solo con el saldo real de esa cuenta: cada aportación que registres actualiza la barra automáticamente.',
    },
    {
      icon: ShieldIcon,
      title: 'Empieza por el colchón',
      description:
        'Un buen primer objetivo: vincula uno a la cuenta «Fondo emergencia» con 3–6 meses de gastos como meta. Aparecerá destacado en el Dashboard.',
    },
  ],
  patrimonio: [
    {
      icon: ChartBarIcon,
      title: 'Todo lo que tienes',
      description:
        'Esta es la suma de los saldos de tus cuentas de activo (banco, efectivo, fondo de emergencia, inversiones…). Los saldos se derivan automáticamente de tus movimientos.',
    },
    {
      icon: PencilIcon,
      title: 'Ajusta cuando difiera',
      description:
        'Si el saldo real no coincide (intereses, revalorización de inversiones…), pulsa «Ajustar» e indica el saldo correcto: se crea un movimiento de ajuste y el historial queda intacto.',
    },
  ],
  config: [
    {
      icon: WalletIcon,
      title: 'Tu ingreso mensual',
      description:
        'Indica cuánto ingresas al mes (tu nómina estimada). Es la base sobre la que se calcula el reparto recomendado del dinero.',
    },
    {
      icon: PercentIcon,
      title: 'Reparte por porcentajes',
      description:
        'Asigna un % de tu ingreso a cada bucket (Necesidades, Ocio, Ahorro…) hasta sumar 100. La app traduce cada porcentaje a euros y lo usa en el Dashboard y en Mensual.',
    },
    {
      icon: SettingsIcon,
      title: 'Cuentas y categorías',
      description:
        'Crea o edita tus cuentas (activo), orígenes de ingreso y categorías de gasto. Lo que no uses, archívalo: desaparece de los formularios pero conserva su historial.',
    },
  ],
}

// Tutorial contextual de una sección: se abre solo la primera vez que el
// usuario la visita (y nunca encima del tutorial de bienvenida) y puede
// reabrirse con showTour(id).
export function PageTour({ id }: { id: TourId }) {
  const { session } = useAuth()
  const key = tourKey(id, session?.user.id)
  const [open, setOpen] = useState(false)

  // Primera visita: si el tutorial de bienvenida sigue pendiente, espera a
  // que termine para no apilar dos diálogos.
  useEffect(() => {
    if (isDone(key)) return
    if (isWelcomeDone(session?.user.id)) {
      setOpen(true)
      return
    }
    function onWelcomeDone() {
      setOpen(true)
    }
    window.addEventListener(WELCOME_DONE_EVENT, onWelcomeDone)
    return () => window.removeEventListener(WELCOME_DONE_EVENT, onWelcomeDone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Reapertura manual desde el botón de ayuda.
  useEffect(() => {
    function onShow(e: Event) {
      if ((e as CustomEvent).detail === id) setOpen(true)
    }
    window.addEventListener(SHOW_TOUR_EVENT, onShow)
    return () => window.removeEventListener(SHOW_TOUR_EVENT, onShow)
  }, [id])

  function close() {
    markDone(key)
    setOpen(false)
  }

  return <TourDialog open={open} steps={PAGE_TOURS[id]} onClose={close} />
}
