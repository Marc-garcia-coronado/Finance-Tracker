import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/movimientos', label: 'Movimientos' },
  { to: '/mensual', label: 'Mensual' },
  { to: '/recurrentes', label: 'Recurrentes' },
  { to: '/objetivos', label: 'Objetivos' },
  { to: '/patrimonio', label: 'Patrimonio' },
  { to: '/config', label: 'Config' },
]

export function AppLayout() {
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            €
          </div>
          <span className="font-semibold text-slate-900">Finanzas</span>
          <div className="ml-auto">
            <button
              onClick={signOut}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Salir
            </button>
          </div>
        </div>

        <nav
          aria-label="Secciones"
          className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2"
        >
          {NAV.map((item) => (
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

      <main className="mx-auto max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  )
}
