// ---------------------------------------------------------------------------
// Gestión del "vault": la MK envuelta por dos KEK (contraseña y código de
// recuperación). El servidor solo guarda material envuelto; nunca la MK.
//
//   wrap_p = AESGCM(KEK(contraseña, salt_p), MK)
//   wrap_r = AESGCM(KEK(códigoRecuperación, salt_r), MK)
//
// Cambiar la contraseña = volver a envolver la MK (no se recifran datos).
// Olvidar la contraseña = desenvolver con el código de recuperación.
// ---------------------------------------------------------------------------

import {
  aesGcmDecryptBytes,
  aesGcmEncryptBytes,
  b64ToBytes,
  bytesToB64,
  deriveKek,
  encryptString,
  decryptString,
  generateMasterKeyBytes,
  importMasterKey,
  randomBytes,
  cryptoConstants,
  type EncToken,
} from './webcrypto'

// Fila que se guarda en la tabla `vault` (todo en base64/token, nada secreto en claro).
export type VaultRow = {
  salt_p: string
  salt_r: string
  wrap_p: EncToken
  wrap_r: EncToken
  verifier: EncToken
  version: number
}

const VERIFIER_PLAINTEXT = 'finance-vault-ok'
const VAULT_VERSION = 1

// Código de recuperación legible: 5 grupos de 4 chars base32 (sin I/O/0/1).
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateRecoveryCode(): string {
  const bytes = randomBytes(13)
  let s = ''
  for (let i = 0; i < 20; i++) {
    s += RECOVERY_ALPHABET[bytes[i % bytes.length]! % RECOVERY_ALPHABET.length]
  }
  return s.match(/.{1,4}/g)!.join('-')
}

// Normaliza para derivar la KEK del código (ignora guiones y mayúsculas).
function normalizeRecovery(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export type CreatedVault = {
  row: VaultRow
  recoveryCode: string
  masterKey: CryptoKey
}

// Crea un vault nuevo a partir de una contraseña. Devuelve también el código de
// recuperación (mostrar UNA vez) y la MK ya lista para usar.
export async function createVault(passphrase: string): Promise<CreatedVault> {
  const mkBytes = generateMasterKeyBytes()
  const masterKey = await importMasterKey(mkBytes)

  const saltP = randomBytes(cryptoConstants.SALT_BYTES)
  const kekP = await deriveKek(passphrase, saltP)
  const wrapP = await aesGcmEncryptBytes(kekP, mkBytes)

  const recoveryCode = generateRecoveryCode()
  const saltR = randomBytes(cryptoConstants.SALT_BYTES)
  const kekR = await deriveKek(normalizeRecovery(recoveryCode), saltR)
  const wrapR = await aesGcmEncryptBytes(kekR, mkBytes)

  const verifier = await encryptString(masterKey, VERIFIER_PLAINTEXT)

  // Limpia los bytes de la MK de memoria una vez envueltos.
  mkBytes.fill(0)

  return {
    row: {
      salt_p: bytesToB64(saltP),
      salt_r: bytesToB64(saltR),
      wrap_p: wrapP,
      wrap_r: wrapR,
      verifier,
      version: VAULT_VERSION,
    },
    recoveryCode,
    masterKey,
  }
}

async function unwrap(saltB64: string, wrap: EncToken, secret: string): Promise<CryptoKey> {
  const kek = await deriveKek(secret, b64ToBytes(saltB64))
  let mkBytes: Uint8Array
  try {
    mkBytes = await aesGcmDecryptBytes(kek, wrap)
  } catch {
    throw new Error('Contraseña o código incorrectos')
  }
  const mk = await importMasterKey(mkBytes)
  mkBytes.fill(0)
  return mk
}

// Verifica que la MK desenvuelta es la correcta descifrando el verifier.
async function assertVerifier(mk: CryptoKey, verifier: EncToken): Promise<void> {
  const value = await decryptString(mk, verifier).catch(() => '')
  if (value !== VERIFIER_PLAINTEXT) throw new Error('Contraseña o código incorrectos')
}

export async function unlockWithPassphrase(row: VaultRow, passphrase: string): Promise<CryptoKey> {
  const mk = await unwrap(row.salt_p, row.wrap_p, passphrase)
  await assertVerifier(mk, row.verifier)
  return mk
}

export async function unlockWithRecovery(row: VaultRow, recoveryCode: string): Promise<CryptoKey> {
  const mk = await unwrap(row.salt_r, row.wrap_r, normalizeRecovery(recoveryCode))
  await assertVerifier(mk, row.verifier)
  return mk
}

// ---------------------------------------------------------------------------
// Caché de la MK en IndexedDB (CryptoKey no extraíble: persiste sin exponer
// material). Evita reintroducir la contraseña en cada recarga del dispositivo.
// ---------------------------------------------------------------------------
const DB_NAME = 'finance-crypto'
const STORE = 'keys'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
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
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function cacheMasterKey(userId: string, mk: CryptoKey): Promise<void> {
  try {
    await idbRun('readwrite', (s) => s.put(mk, userId))
  } catch {
    // Sin IndexedDB (modo privado, etc.): se reintroducirá la contraseña.
  }
}

export async function loadCachedMasterKey(userId: string): Promise<CryptoKey | null> {
  try {
    const v = await idbRun<CryptoKey | undefined>('readonly', (s) => s.get(userId))
    return v ?? null
  } catch {
    return null
  }
}

export async function clearCachedMasterKey(userId: string): Promise<void> {
  try {
    await idbRun('readwrite', (s) => s.delete(userId))
  } catch {
    // ignorar
  }
}
