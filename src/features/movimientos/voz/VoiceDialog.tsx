import { useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button, Spinner } from '@/components/ui'
import { MicIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/dates'
import { ADJUSTMENT_ACCOUNT_NAME, useAccounts } from '@/lib/queries'
import { useSpeechRecognition } from '@/lib/useSpeechRecognition'
import { interpretDictation } from '@/lib/voiceApi'
import { MAX_TEXT_LENGTH, buildVoicePayload, parseVoiceResponse } from '@/lib/voiceParse'
import { pickDefaultAccount, readLastExpenseAccount } from '@/lib/lastAccount'
import { ReviewList, type ReviewItem } from './ReviewList'

type Step = 'capture' | 'text' | 'review'

// Dictado de uno o varios movimientos: voz -> texto editable -> IA -> lista de
// revisión. Nada se guarda hasta que el usuario aprueba cada movimiento.
export function VoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // El contenido se monta solo con el diálogo abierto, así cada apertura empieza limpia.
  return (
    <Modal open={open} onClose={onClose} title="Dictar movimientos">
      <VoiceFlow onClose={onClose} />
    </Modal>
  )
}

function VoiceFlow({ onClose }: { onClose: () => void }) {
  const accounts = useAccounts()
  const speech = useSpeechRecognition()
  const [step, setStep] = useState<Step>(speech.supported ? 'capture' : 'text')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [dictated, setDictated] = useState('')
  const nextId = useRef(1)

  const assetIds = useMemo(
    () => (accounts.data ?? []).filter((a) => a.type === 'asset' && !a.is_archived).map((a) => a.id),
    [accounts.data],
  )

  function finishDictation() {
    speech.stop()
    setText((prev) => [prev, speech.finalText, speech.interim].filter(Boolean).join(' ').trim())
    setStep('text')
  }

  async function interpret() {
    const list = accounts.data
    if (!list) return
    setError(null)
    setLoading(true)
    try {
      const today = todayISO()
      const { payload, keys } = buildVoicePayload(text, today, list, [ADJUSTMENT_ACCOUNT_NAME])
      const raw = await interpretDictation(payload)
      const drafts = parseVoiceResponse(raw, today, keys)
      const defaultAccount = pickDefaultAccount(readLastExpenseAccount(), assetIds) || assetIds[0] || ''
      setDictated(payload.text)
      setItems(
        drafts.map((d) => ({
          ...d,
          id: nextId.current++,
          accountId: defaultAccount,
          status: 'pending',
          editing: false,
          error: null,
        })),
      )
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo interpretar el dictado.')
    } finally {
      setLoading(false)
    }
  }

  if (accounts.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (step === 'review') {
    return (
      <ReviewList
        items={items}
        setItems={setItems}
        accounts={accounts.data ?? []}
        dictated={dictated}
        onDictateAgain={() => {
          speech.reset()
          setText('')
          setStep(speech.supported ? 'capture' : 'text')
        }}
        onClose={onClose}
      />
    )
  }

  if (step === 'text') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {speech.supported
            ? 'Revisa lo que has dicho y corrige el texto si hace falta. Después la IA lo separa en movimientos.'
            : 'Este navegador no reconoce voz. Escribe lo que quieres registrar (también sirve el micrófono del teclado del móvil).'}
        </p>
        <div>
          <label htmlFor="dictado-texto" className="label">
            {speech.supported ? 'Transcripción' : 'Lo que quieres registrar'}
          </label>
          <textarea
            id="dictado-texto"
            data-autofocus=""
            className="input min-h-[7.5rem] resize-y"
            placeholder="Ayer 12 euros en el súper y hoy 3,50 de café…"
            maxLength={MAX_TEXT_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">
          Solo se envían este texto y los nombres de tus categorías. Tus importes y movimientos
          guardados no salen del dispositivo.
        </p>
        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          {speech.supported && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setError(null)
                setStep('capture')
              }}
            >
              <MicIcon className="h-4 w-4" />
              Dictar de nuevo
            </Button>
          )}
          <Button className="flex-1" onClick={interpret} loading={loading} disabled={!text.trim() || !accounts.data}>
            {error ? 'Reintentar' : 'Interpretar'}
          </Button>
        </div>
      </div>
    )
  }

  // step === 'capture'
  const listening = speech.status === 'listening'
  const shown = [speech.finalText, speech.interim].filter(Boolean).join(' ')
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Puedes decir varios movimientos seguidos. Indica el importe, qué fue y, si no es de hoy, cuándo.
      </p>

      {speech.status === 'denied' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p className="font-medium">No podemos usar el micrófono</p>
          <p className="mt-1">
            Permite el micrófono en los ajustes del navegador para este sitio, o escribe lo que quieres
            registrar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={listening ? finishDictation : speech.start}
            aria-label={listening ? 'Terminar de dictar' : 'Empezar a dictar'}
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30 transition active:scale-95"
          >
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-indigo-400 motion-reduce:animate-none" />
            )}
            <MicIcon className="relative h-9 w-9" />
          </button>
          <p className="text-sm font-medium text-slate-700" role="status">
            {listening ? 'Escuchando…' : speech.status === 'error' ? 'El reconocimiento de voz falló' : 'Toca para dictar'}
          </p>
        </div>
      )}

      <div
        className={cn(
          'min-h-[5rem] rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm',
          !shown && 'text-slate-400',
        )}
        aria-label="Transcripción en vivo"
      >
        {shown ? (
          <>
            <span className="text-slate-800">{speech.finalText}</span>
            {speech.interim && <span className="text-slate-400"> {speech.interim}</span>}
          </>
        ) : (
          '«Ayer 12 euros en el súper y hoy 3,50 de café»'
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setStep('text')}>
          Escribir
        </Button>
        <Button className="flex-1" onClick={finishDictation} disabled={!shown && !listening}>
          Terminar
        </Button>
      </div>
    </div>
  )
}
