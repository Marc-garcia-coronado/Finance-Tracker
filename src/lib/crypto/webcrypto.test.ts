import { describe, expect, it } from 'vitest'
import {
  decryptCents,
  decryptString,
  encryptCents,
  encryptString,
  generateMasterKeyBytes,
  importMasterKey,
  isEncrypted,
} from './webcrypto'
import {
  createVault,
  generateRecoveryCode,
  unlockWithPassphrase,
  unlockWithRecovery,
} from './keyvault'

async function freshKey() {
  return importMasterKey(generateMasterKeyBytes())
}

describe('encryptString / decryptString', () => {
  it('round-trip de texto', async () => {
    const key = await freshKey()
    const token = await encryptString(key, 'Psicólogo · sesión')
    expect(isEncrypted(token)).toBe(true)
    expect(token).not.toContain('Psicólogo')
    expect(await decryptString(key, token)).toBe('Psicólogo · sesión')
  })

  it('deja pasar valores en claro (no cifrados)', async () => {
    const key = await freshKey()
    expect(await decryptString(key, 'Cuenta corriente')).toBe('Cuenta corriente')
    expect(await decryptString(key, null)).toBe('')
  })

  it('cada cifrado usa un IV distinto (no determinista)', async () => {
    const key = await freshKey()
    const a = await encryptString(key, 'igual')
    const b = await encryptString(key, 'igual')
    expect(a).not.toBe(b)
    expect(await decryptString(key, a)).toBe('igual')
    expect(await decryptString(key, b)).toBe('igual')
  })

  it('una clave distinta no puede descifrar', async () => {
    const k1 = await freshKey()
    const k2 = await freshKey()
    const token = await encryptString(k1, 'secreto')
    await expect(decryptString(k2, token)).rejects.toThrow()
  })
})

describe('encryptCents / decryptCents', () => {
  it('round-trip de importes', async () => {
    const key = await freshKey()
    const token = await encryptCents(key, 123456)
    expect(isEncrypted(token)).toBe(true)
    expect(await decryptCents(key, token)).toBe(123456)
  })

  it('acepta number en claro (dato sin migrar)', async () => {
    const key = await freshKey()
    expect(await decryptCents(key, 500)).toBe(500)
  })
})

describe('vault', () => {
  it('desbloquea con la contraseña y comparte la misma MK', async () => {
    const { row, masterKey } = await createVault('mi-contraseña-larga')
    const token = await encryptString(masterKey, 'dato')
    const mk2 = await unlockWithPassphrase(row, 'mi-contraseña-larga')
    expect(await decryptString(mk2, token)).toBe('dato')
  })

  it('rechaza una contraseña incorrecta', async () => {
    const { row } = await createVault('correcta')
    await expect(unlockWithPassphrase(row, 'incorrecta')).rejects.toThrow()
  })

  it('desbloquea con el código de recuperación (tolera guiones/minúsculas)', async () => {
    const { row, recoveryCode, masterKey } = await createVault('pass')
    const token = await encryptString(masterKey, 'dato')
    const mk2 = await unlockWithRecovery(row, recoveryCode.toLowerCase())
    expect(await decryptString(mk2, token)).toBe('dato')
  })

  it('rechaza un código de recuperación incorrecto', async () => {
    const { row } = await createVault('pass')
    await expect(unlockWithRecovery(row, 'AAAA-BBBB-CCCC-DDDD-EEEE')).rejects.toThrow()
  })
})

describe('generateRecoveryCode', () => {
  it('formato de 5 grupos de 4', () => {
    expect(generateRecoveryCode()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/)
  })
})
