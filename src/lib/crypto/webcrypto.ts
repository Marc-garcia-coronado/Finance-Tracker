// ---------------------------------------------------------------------------
// Primitivas de cifrado (WebCrypto). Todo el cifrado E2EE pasa por aquí.
//
//   - MK (master key): AES-GCM 256, la única clave que cifra los datos.
//   - KEK: clave derivada de una contraseña (o código de recuperación) con
//     PBKDF2; solo se usa para envolver/desenvolver la MK.
//   - Cada valor cifrado se serializa como token de texto: `v1.<iv>.<ct>` en
//     base64. El IV es aleatorio (12 bytes) por valor.
// ---------------------------------------------------------------------------

const VERSION = 'v1'
const PBKDF2_ITERATIONS = 250_000
const IV_BYTES = 12
const SALT_BYTES = 16
const MK_BYTES = 32

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// --- base64 <-> bytes (válido en navegador y Node) --------------------------
export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

// --- token v1.<iv>.<ct> -----------------------------------------------------
export type EncToken = string

// Distingue un valor cifrado (token `v1.…`) de uno en claro. Sirve para que el
// descifrado tolere valores no cifrados (nombres semilla, anulaciones del
// servidor) y para que la migración sea idempotente.
export function isEncrypted(value: string | null | undefined): value is EncToken {
  return typeof value === 'string' && value.startsWith(VERSION + '.')
}

// --- derivación de KEK ------------------------------------------------------
export async function deriveKek(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // la KEK no es extraíble: solo envuelve/desenvuelve la MK
    ['encrypt', 'decrypt'],
  )
}

// --- MK ---------------------------------------------------------------------
export function generateMasterKeyBytes(): Uint8Array {
  return randomBytes(MK_BYTES)
}

// Importa los bytes de la MK como CryptoKey AES-GCM NO extraíble: una vez
// importada no se pueden recuperar los bytes (solo cifra/descifra).
export function importMasterKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

// --- AES-GCM sobre bytes ----------------------------------------------------
export async function aesGcmEncryptBytes(key: CryptoKey, data: Uint8Array): Promise<EncToken> {
  const iv = randomBytes(IV_BYTES)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource),
  )
  return `${VERSION}.${bytesToB64(iv)}.${bytesToB64(ct)}`
}

export async function aesGcmDecryptBytes(key: CryptoKey, token: EncToken): Promise<Uint8Array> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error('Token de cifrado no válido')
  }
  const iv = b64ToBytes(parts[1]!)
  const ct = b64ToBytes(parts[2]!)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  )
  return new Uint8Array(plain)
}

// --- AES-GCM sobre texto/números (la API que usa la app) --------------------
export async function encryptString(key: CryptoKey, text: string): Promise<EncToken> {
  return aesGcmEncryptBytes(key, textEncoder.encode(text))
}

// Descifra un token. Si el valor no está cifrado (no empieza por `v1.`) lo
// devuelve tal cual: permite convivir datos en claro con datos cifrados.
export async function decryptString(
  key: CryptoKey,
  value: string | null | undefined,
): Promise<string> {
  if (value == null) return ''
  if (!isEncrypted(value)) return value
  const bytes = await aesGcmDecryptBytes(key, value)
  return textDecoder.decode(bytes)
}

export async function encryptCents(key: CryptoKey, cents: number): Promise<EncToken> {
  return encryptString(key, String(cents))
}

// Descifra un importe. Acepta number en claro (dato sin migrar) o token cifrado.
export async function decryptCents(
  key: CryptoKey,
  value: string | number | null | undefined,
): Promise<number> {
  if (value == null) return 0
  if (typeof value === 'number') return value
  const s = await decryptString(key, value)
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export const cryptoConstants = { VERSION, PBKDF2_ITERATIONS, IV_BYTES, SALT_BYTES, MK_BYTES }
