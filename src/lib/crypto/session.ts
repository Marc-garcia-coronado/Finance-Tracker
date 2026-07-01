// ---------------------------------------------------------------------------
// Sostiene la MK desbloqueada a nivel de módulo para que la capa de datos
// (queryFns, mutaciones — que no son componentes React) pueda cifrar/descifrar
// sin pasar la clave por props. La establece el CryptoProvider al desbloquear.
// ---------------------------------------------------------------------------

let masterKey: CryptoKey | null = null

export function setSessionKey(mk: CryptoKey | null): void {
  masterKey = mk
}

export function hasSessionKey(): boolean {
  return masterKey !== null
}

// Devuelve la MK o lanza si el vault está bloqueado. La app monta un gate que
// impide renderizar páginas con datos mientras está bloqueado, así que en la
// práctica esto siempre tiene clave cuando se ejecuta una query de datos.
export function requireSessionKey(): CryptoKey {
  if (!masterKey) throw new Error('Vault bloqueado: sin clave de cifrado')
  return masterKey
}
