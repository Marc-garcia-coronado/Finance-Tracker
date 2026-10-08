import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { MicIcon } from '@/components/icons'
import { useOnline } from '@/lib/useOnline'
import { useDemoMode } from '@/lib/demo/demoMode'
import { useVoiceEnabled } from '@/lib/voiceSettings'
import { MovementForm } from './MovementForm'
import { VoiceDialog } from './voz/VoiceDialog'

// «Nuevo movimiento»: formulario manual y, si el usuario lo ha activado en
// Configuración, la opción de dictar uno o varios con IA.
export function NewMovementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const voiceEnabled = useVoiceEnabled()
  const online = useOnline()
  const demo = useDemoMode() // el dictado llama a un servicio real: fuera en la demo
  const [voiceOpen, setVoiceOpen] = useState(false)

  return (
    <>
      <Modal open={open} onClose={onClose} title="Nuevo movimiento">
        {voiceEnabled && online && !demo && (
          <>
            <button
              type="button"
              onClick={() => {
                onClose()
                setVoiceOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <MicIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">Dictar con IA</span>
                <span className="block text-xs text-slate-500">Di uno o varios movimientos seguidos.</span>
              </span>
              <span className="badge shrink-0 bg-indigo-50 text-indigo-700">Nuevo</span>
            </button>
            <p className="my-3 text-center text-xs text-slate-400">o escríbelo a mano</p>
          </>
        )}
        <MovementForm onDone={onClose} />
      </Modal>
      <VoiceDialog open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  )
}
