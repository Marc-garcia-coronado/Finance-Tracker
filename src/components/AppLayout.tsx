import { useState, type ComponentType, type SVGProps } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Modal } from './Modal'
import { OnboardingTour } from '@/features/onboarding/OnboardingTour'
import {
  ArrowsRightLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  EllipsisIcon,
  HomeIcon,
  LogoutIcon,
  RepeatIcon,
  SettingsIcon,
  TargetIcon,
} from './icons'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
}

// Pestañas principales de la barra inferior (móvil). El resto va en «Más».
const PRIMARY: NavItem[] = [
  { to: '/', label: 'Inicio', icon: HomeIcon, end: true },
  { to: '/movimientos', label: 'Movim.', icon: ArrowsRightLeftIcon },
  { to: '/mensual', label: 'Mensual', icon: CalendarIcon },
  { to: '/patrimonio', label: 'Patrimonio', icon: ChartBarIcon },
]

const MORE: (NavItem & { description: string })[] = [
  { to: '/recurrentes', label: 'Recurrentes', description: 'Pagos e ingresos fijos', icon: RepeatIcon },
  { to: '/objetivos', label: 'Objetivos', description: 'Metas de ahorro', icon: TargetIcon },
  { to: '/config', label: 'Configuración', description: 'Ingreso, cuentas y asignación', icon: SettingsIcon },
]

// Navegación de escritorio, en orden lógico completo.
const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: HomeIcon, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowsRightLeftIcon },
  { to: '/mensual', label: 'Mensual', icon: CalendarIcon },
  { to: '/recurrentes', label: 'Recurrentes', icon: RepeatIcon },
  { to: '/objetivos', label: 'Objetivos', icon: TargetIcon },
  { to: '/patrimonio', label: 'Patrimonio', icon: ChartBarIcon },
  { to: '/config', label: 'Configuración', icon: SettingsIcon },
]

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const moreActive = MORE.some((item) => location.pathname.startsWith(item.to))

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  function goTo(to: string) {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            €
          </div>
          <span className="font-semibold text-slate-900">Finanzas</span>
          <button
            onClick={signOut}
            className="ml-auto hidden text-sm font-medium text-slate-500 hover:text-slate-900 md:block"
          >
            Salir
          </button>
        </div>

        <nav
          aria-label="Secciones"
          className="mx-auto hidden max-w-5xl flex-wrap gap-1 px-2 pb-2 md:flex"
        >
          {DESKTOP_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
        <Outlet />
      </main>

      {/* Barra de pestañas inferior (solo móvil) */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
                  isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
                )
              }
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
              moreActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <EllipsisIcon className="h-6 w-6" />
            Más
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más">
        <div className="space-y-1">
          {MORE.map((item) => {
            const active = location.pathname.startsWith(item.to)
            return (
              <button
                key={item.to}
                onClick={() => goTo(item.to)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                  active ? 'bg-indigo-50' : 'hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      active ? 'text-indigo-700' : 'text-slate-900',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-xs text-slate-500">{item.description}</span>
                </span>
              </button>
            )
          })}

          <div className="!mt-3 border-t border-slate-100 pt-3">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-rose-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <LogoutIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-rose-700">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </Modal>

      <OnboardingTour />
    </div>
  )
}
