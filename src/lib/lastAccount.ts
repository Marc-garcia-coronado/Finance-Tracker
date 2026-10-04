// Última cuenta de origen usada al crear un gasto, para preseleccionarla en el
// formulario rápido. Solo una comodidad por navegador: si el almacenamiento no
// está disponible, simplemente no se recuerda nada.
const KEY = 'finanzas.lastExpenseAccount.v1'

export function readLastExpenseAccount(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveLastExpenseAccount(accountId: string): void {
  try {
    localStorage.setItem(KEY, accountId)
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

// La cuenta recordada solo vale si sigue entre las opciones (puede haberse
// archivado o borrado); si no, se deja vacío para que el usuario elija.
export function pickDefaultAccount(lastId: string | null, optionIds: string[]): string {
  return lastId !== null && optionIds.includes(lastId) ? lastId : ''
}
