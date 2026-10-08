import { exitDemo } from '@/lib/demo/demoControl'
import { useDemoMode } from '@/lib/demo/demoMode'

// Aviso permanente del modo demo: los datos que se ven no son los reales.
export function DemoBanner() {
  const demo = useDemoMode()
  if (!demo) return null
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 text-amber-950"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Modo demo</strong> · estos datos no son los reales
        </p>
        <button
          onClick={exitDemo}
          className="shrink-0 rounded-lg border border-amber-400 bg-white/70 px-3 py-1 text-sm font-medium hover:bg-white"
        >
          Salir
        </button>
      </div>
    </div>
  )
}
