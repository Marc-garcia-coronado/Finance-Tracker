import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { queryClient } from '@/lib/queryClient'
import { requireSessionKey, setSessionKey } from '@/lib/crypto/session'
import {
  clearOfflineCache,
  restoreOfflineCache,
  startOfflinePersistence,
} from '@/lib/offlineCache'
import {
  cacheMasterKey,
  createVault,
  loadCachedMasterKey,
  unlockWithPassphrase,
  unlockWithRecovery,
  type VaultRow,
} from '@/lib/crypto/keyvault'
import { fetchVaultRow, saveVaultRow } from '@/lib/crypto/vaultStore'
import { migratePlaintext } from '@/lib/crypto/migrate'

type Status = 'idle' | 'loading' | 'setup' | 'recovery' | 'locked' | 'unlocked'

type CryptoState = {
  status: Status
  busy: boolean
  recoveryCode: string | null
  setup: (passphrase: string) => Promise<void>
  acknowledgeRecovery: () => void
  unlockPassphrase: (passphrase: string) => Promise<void>
  unlockRecovery: (code: string) => Promise<void>
}

const CryptoContext = createContext<CryptoState | undefined>(undefined)

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  const [status, setStatus] = useState<Status>('idle')
  const [busy, setBusy] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const vaultRef = useRef<VaultRow | null>(null)
  const prevUserRef = useRef<string | null>(null)

  // Decide el estado del vault cada vez que cambia la sesión.
  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setSessionKey(null)
      vaultRef.current = null
      // Cierre de sesión: fuera la caché offline y los datos descifrados en memoria.
      if (prevUserRef.current) {
        void clearOfflineCache(prevUserRef.current)
        queryClient.clear()
      }
      prevUserRef.current = null
      setStatus('idle')
      return
    }
    prevUserRef.current = userId

    setStatus('loading')
    ;(async () => {
      // 1) ¿Llave cacheada en este dispositivo? → desbloqueado sin contraseña.
      const cached = await loadCachedMasterKey(userId)
      if (cancelled) return
      if (cached) {
        setSessionKey(cached)
        // Datos de la última sesión (cifrados en disco): se ven aunque no haya red.
        await restoreOfflineCache(queryClient, userId, cached)
        if (cancelled) return
        setStatus('unlocked')
        return
      }
      // 2) ¿Existe vault? sí → bloqueado; no → configurar.
      try {
        const row = await fetchVaultRow()
        if (cancelled) return
        vaultRef.current = row
        setStatus(row ? 'locked' : 'setup')
      } catch {
        if (!cancelled) setStatus('locked')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  async function afterUnlock(mk: CryptoKey) {
    setSessionKey(mk)
    if (userId) {
      await cacheMasterKey(userId, mk)
      await restoreOfflineCache(queryClient, userId, mk)
    }
    await queryClient.invalidateQueries()
  }

  // Con el vault desbloqueado, la caché de datos se guarda cifrada en el disco.
  useEffect(() => {
    if (status !== 'unlocked' || !userId) return
    return startOfflinePersistence(queryClient, userId, requireSessionKey())
  }, [status, userId])

  async function setup(passphrase: string) {
    setBusy(true)
    try {
      const { row, recoveryCode: code, masterKey } = await createVault(passphrase)
      await saveVaultRow(row)
      vaultRef.current = row
      await afterUnlock(masterKey)
      await migratePlaintext(masterKey) // cifra cualquier dato en claro existente
      await queryClient.invalidateQueries()
      setRecoveryCode(code)
      setStatus('recovery')
    } finally {
      setBusy(false)
    }
  }

  function acknowledgeRecovery() {
    setRecoveryCode(null)
    setStatus('unlocked')
  }

  async function unlockPassphrase(passphrase: string) {
    if (!vaultRef.current) throw new Error('No hay vault')
    setBusy(true)
    try {
      const mk = await unlockWithPassphrase(vaultRef.current, passphrase)
      await afterUnlock(mk)
      setStatus('unlocked')
    } finally {
      setBusy(false)
    }
  }

  async function unlockRecovery(code: string) {
    if (!vaultRef.current) throw new Error('No hay vault')
    setBusy(true)
    try {
      const mk = await unlockWithRecovery(vaultRef.current, code)
      await afterUnlock(mk)
      setStatus('unlocked')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CryptoContext.Provider
      value={{ status, busy, recoveryCode, setup, acknowledgeRecovery, unlockPassphrase, unlockRecovery }}
    >
      {children}
    </CryptoContext.Provider>
  )
}

export function useCrypto(): CryptoState {
  const ctx = useContext(CryptoContext)
  if (!ctx) throw new Error('useCrypto debe usarse dentro de <CryptoProvider>')
  return ctx
}
