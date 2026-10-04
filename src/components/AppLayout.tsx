import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAutoRecurring } from '@/features/recurrentes/useAutoRecurring'
import { supabase } from '@/lib/supabase'
import { lastDataUpdate } from '@/lib/offlineCache'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/cn'
import { Modal } from './Modal'
import { MovementForm } from '@/features/movimientos/MovementForm'
import { OnboardingTour } from '@/features/onboarding/OnboardingTour'
import {
  ArrowsRightLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  EllipsisIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
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

// Aviso de modo sin conexión: se ve lo último cargado, en solo lectura.
function OfflineNotice() {
  const online = useOnline()
  const qc = useQueryClient()
  if (online) return null
  const last = lastDataUpdate(qc)
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      Sin conexión{last ? ` · datos de ${format(last, 'dd/MM/yyyy HH:mm')}` : ''}. Solo lectura:
      no se pueden guardar cambios hasta que vuelva la red.
    </div>
  )
}

// Aviso de la generación automática de recurrentes al abrir la app.
function AutoRecurringNotice() {
  const state = useAutoRecurring()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  let body: ReactNode = null
  let tone = ''
  if (state.status === 'done' && state.created > 0) {
    tone = 'border-indigo-200 bg-indigo-50 text-indigo-900'
    body = (
      <>
        {state.created === 1
          ? 'Se ha creado 1 movimiento recurrente pendiente.'
          : `Se han creado ${state.created} movimientos recurrentes pendientes.`}{' '}
        <Link to="/movimientos" className="font-medium underline" onClick={() => setDismissed(true)}>
          Ver
        </Link>
      </>
    )
  } else if (state.status === 'error') {
    tone = 'border-rose-200 bg-rose-50 text-rose-800'
    body = `No se pudieron generar los recurrentes: ${state.message}`
  }
  if (!body) return null

  return (
    <div role="status" className={cn('mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tone)}>
      <p className="flex-1">{body}</p>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso"
        className="-my-1 rounded-lg px-2 py-1 text-base leading-none opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  )
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const online = useOnline()

  const moreActive = MORE.some((item) => location.pathname.startsWith(item.to))

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  function goTo(to: string) {
    setMoreOpen(false)
    navigate(to)
  }

  function renderTab(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition',
            isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={cn('rounded-full px-3.5 py-0.5 transition', isActive && 'bg-indigo-100/80')}
            >
              <item.icon className="h-6 w-6" />
            </span>
            {item.label}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-600/30">
            €
          </div>
          <span className="font-bold tracking-tight text-slate-900">Finanzas</span>
          <button
            onClick={() => setQuickOpen(true)}
            disabled={!online}
            title={online ? undefined : 'Sin conexión'}
            className="btn-primary ml-auto hidden md:inline-flex"
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo movimiento
          </button>
          <button
            onClick={signOut}
            className="hidden text-sm font-medium text-slate-500 hover:text-slate-900 md:block"
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
        <OfflineNotice />
        <AutoRecurringNotice />
        <Outlet />
      </main>

      {/* Barra de pestañas inferior (solo móvil) */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(15_23_42_/_0.12)] backdrop-blur-lg md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-6">
          {PRIMARY.slice(0, 2).map((item) => renderTab(item))}
          <button
            onClick={() => setQuickOpen(true)}
            disabled={!online}
            aria-label="Añadir movimiento"
            className="flex items-center justify-center disabled:opacity-40"
          >
            <span className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/40 transition active:scale-95">
              <PlusIcon className="h-6 w-6" strokeWidth={2.2} />
            </span>
          </button>
          {PRIMARY.slice(2).map((item) => renderTab(item))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition',
              moreActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <span
              className={cn(
                'rounded-full px-3.5 py-0.5 transition',
                moreActive && 'bg-indigo-100/80',
              )}
            >
              <EllipsisIcon className="h-6 w-6" />
            </span>
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

      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Nuevo movimiento">
        <MovementForm onDone={() => setQuickOpen(false)} />
      </Modal>

      <OnboardingTour />
    </div>
  )
}
