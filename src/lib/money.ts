// ---------------------------------------------------------------------------
// Dinero = SIEMPRE enteros en céntimos. Nunca float, nunca parseFloat sobre €.
// Estos helpers son la ÚNICA frontera entre céntimos (modelo) y texto (UI).
// ---------------------------------------------------------------------------

const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
})

// Formatea céntimos como moneda es-ES: 123456 -> "1.234,56 €"
export function formatEuro(cents: number): string {
  return eurFormatter.format(cents / 100)
}

// Convierte céntimos a un número en euros (solo para gráficos/cálculos de display).
// No usar para sumar dinero: el dinero se suma en céntimos.
export function centsToEuro(cents: number): number {
  return cents / 100
}

// Parsea un importe escrito por el usuario (es-ES o con punto decimal) a céntimos
// enteros, redondeando al céntimo. Lanza si no es un número válido.
//   "12,50" -> 1250   "1.234,56" -> 123456   "12.5" -> 1250   "-3" -> -300
export function euroToCents(input: string): number {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Importe vacío')

  const negative = trimmed.startsWith('-')
  const cleaned = trimmed.replace(/[^0-9.,]/g, '')
  if (!cleaned) throw new Error('Importe no válido')

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  // Decidir cuál es el separador decimal.
  let decimalSep: ',' | '.' | '' = ''
  if (lastComma !== -1 && lastDot !== -1) {
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma !== -1) {
    decimalSep = ','
  } else if (lastDot !== -1) {
    // Un único punto: es decimal solo si deja <= 2 dígitos detrás; si no, es de millares.
    decimalSep = cleaned.length - lastDot - 1 <= 2 ? '.' : ''
  }

  let intPart = cleaned
  let fracPart = ''
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep)
    intPart = cleaned.slice(0, idx)
    fracPart = cleaned.slice(idx + 1)
  }

  intPart = intPart.replace(/[.,]/g, '') || '0'
  fracPart = fracPart.replace(/[.,]/g, '')

  if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart))) {
    throw new Error('Importe no válido')
  }

  const frac2 = (fracPart + '00').slice(0, 2)
  let cents = Number(intPart) * 100 + Number(frac2)

  // Redondeo al céntimo si había un tercer decimal.
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) {
    cents += 1
  }

  if (!Number.isFinite(cents)) throw new Error('Importe no válido')
  return negative ? -cents : cents
}

// Versión "segura" para formularios: devuelve null en vez de lanzar.
export function tryEuroToCents(input: string): number | null {
  try {
    return euroToCents(input)
  } catch {
    return null
  }
}
