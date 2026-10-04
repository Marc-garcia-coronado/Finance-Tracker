// ---------------------------------------------------------------------------
// Caché offline cifrada. La caché de react-query contiene datos YA DESCIFRADOS
// (importes, descripciones), así que NUNCA se guarda en claro: todo el estado
// se serializa y se cifra con la master key (AES-GCM, igual que el resto de
// datos sensibles) antes de ir a IndexedDB. Sin la clave, el blob es inservible.
//
//  - sealCache / openCache / isExpired: puros (solo Web Crypto), testeados.
//  - restoreOfflineCache / startOfflinePersistence: pegamento con IndexedDB y
//    react-query. Cualquier fallo se ignora: la caché es una comodidad, nunca
//    debe romper la app.
// ---------------------------------------------------------------------------
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'
import { decryptString, encryptString } from './crypto/webcrypto'

const FORMAT_VERSION = 1
// Lo guardado hace más de esto no se restaura (datos demasiado viejos).
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 3000

// Lo único en claro es la versión y la fecha de guardado (no es un dato financiero).
export type Envelope = { v: number; savedAt: number; payload: string }

export async function sealCache(
  state: DehydratedState,
  key: CryptoKey,
  savedAt: number,
): Promise<Envelope> {
  return { v: FORMAT_VERSION, savedAt, payload: await encryptString(key, JSON.stringify(state)) }
}

// Lanza si la versión no coincide o la clave no es la correcta (AES-GCM autentica).
export async function openCache(
  envelope: Envelope,
  key: CryptoKey,
): Promise<{ state: DehydratedState; savedAt: number }> {
  if (envelope.v !== FORMAT_VERSION) throw new Error('Versión de caché no soportada')
  const state = JSON.parse(await decryptString(key, envelope.payload)) as DehydratedState
  return { state, savedAt: envelope.savedAt }
}

export function isExpired(savedAt: number, now: number, maxAgeMs = MAX_AGE_MS): boolean {
  return now - savedAt > maxAgeMs
}

// Solo se guarda lo cargado con éxito (nada de errores ni cargas a medias).
function dehydrateForCache(qc: QueryClient): DehydratedState {
  return dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' })
}

// ---------------------------------------------------------------------------
// IndexedDB (BD propia: no toca la de la master key)
// ---------------------------------------------------------------------------
const DB_NAME = 'finance-offline'
const STORE = 'cache'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbRun<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function clearOfflineCache(userId: string): Promise<void> {
  try {
    await idbRun('readwrite', (s) => s.delete(userId))
  } catch {
    // ignorar
  }
}

// Carga la caché cifrada del usuario en el QueryClient. Devuelve la fecha del
// guardado, o null si no había nada utilizable (se borra lo caducado o corrupto).
export async function restoreOfflineCache(
  qc: QueryClient,
  userId: string,
  key: CryptoKey,
  now = Date.now(),
): Promise<number | null> {
  try {
    const envelope = await idbRun<Envelope | undefined>('readonly', (s) => s.get(userId))
    if (!envelope) return null
    const { state, savedAt } = await openCache(envelope, key)
    if (isExpired(savedAt, now)) {
      await clearOfflineCache(userId)
      return null
    }
    hydrate(qc, state)
    return savedAt
  } catch {
    await clearOfflineCache(userId) // clave distinta, versión vieja o datos corruptos
    return null
  }
}

// Guarda (cifrada) la caché cada vez que cambian los datos, con debounce, y al
// ocultar la app. Devuelve la función para detenerlo (bloqueo / cierre de sesión).
export function startOfflinePersistence(qc: QueryClient, userId: string, key: CryptoKey): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  async function save() {
    if (stopped) return
    try {
      const envelope = await sealCache(dehydrateForCache(qc), key, Date.now())
      if (!stopped) await idbRun('readwrite', (s) => s.put(envelope, userId))
    } catch {
      // sin IndexedDB o sin espacio: simplemente no hay caché offline
    }
  }

  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      void save()
    }
  }
  document.addEventListener('visibilitychange', onHide)

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
    document.removeEventListener('visibilitychange', onHide)
  }
}

// Última vez que se cargó algún dato con éxito (para «datos de <fecha>»).
export function lastDataUpdate(qc: QueryClient): number | null {
  let max = 0
  for (const q of qc.getQueryCache().getAll()) max = Math.max(max, q.state.dataUpdatedAt)
  return max > 0 ? max : null
}
