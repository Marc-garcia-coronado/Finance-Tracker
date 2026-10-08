// Reconocimiento de voz del navegador (Web Speech API, español). El audio lo
// procesa el propio navegador; nuestro backend nunca lo recibe.
import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type SpeechStatus = 'idle' | 'listening' | 'denied' | 'error'

export function useSpeechRecognition() {
  const supported = getCtor() !== null
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    recRef.current?.abort()
    const rec = new Ctor()
    rec.lang = 'es-ES'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let finals = ''
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) finals += r[0].transcript
        else partial += r[0].transcript
      }
      if (finals) setFinalText((t) => (t ? `${t} ${finals.trim()}` : finals.trim()))
      setInterim(partial)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setStatus('denied')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setStatus('error')
    }
    rec.onend = () => {
      setInterim('')
      setStatus((s) => (s === 'listening' ? 'idle' : s))
    }
    recRef.current = rec
    setStatus('listening')
    try {
      rec.start()
    } catch {
      setStatus('error')
    }
  }, [])

  const stop = useCallback(() => recRef.current?.stop(), [])

  const reset = useCallback(() => {
    recRef.current?.abort()
    setFinalText('')
    setInterim('')
    setStatus('idle')
  }, [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, status, finalText, interim, start, stop, reset }
}
