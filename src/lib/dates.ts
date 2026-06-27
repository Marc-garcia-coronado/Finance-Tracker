import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// Clave de mes 'YYYY-MM' a partir de una fecha o ISO date.
export function monthKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM')
}

export function currentMonthKey(): string {
  return monthKey()
}

export function currentYear(): number {
  return new Date().getFullYear()
}

// Rango [inicio, finExclusivo) en 'YYYY-MM-DD' para un mes 'YYYY-MM'.
export function monthRange(mKey: string): { start: string; endExclusive: string } {
  const [y, m] = mKey.split('-').map(Number)
  const start = `${mKey}-01`
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, endExclusive }
}

// Rango del año [YYYY-01-01, (YYYY+1)-01-01).
export function yearRange(year: number): { start: string; endExclusive: string } {
  return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` }
}

// Etiqueta legible 'junio 2026' (capitalizada).
export function formatMonthLabel(mKey: string): string {
  const d = parseISO(`${mKey}-01`)
  const label = format(d, 'LLLL yyyy', { locale: es })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Fecha ISO -> 'dd/MM/yyyy'.
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy')
}

// Lista de las últimas `count` claves de mes, de más reciente a más antigua.
export function recentMonths(count: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return out
}

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd')
