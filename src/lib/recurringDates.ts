// ---------------------------------------------------------------------------
// Fechas pendientes de una plantilla recurrente. Función pura (sin supabase)
// para poder testearla; la generación en sí está en recurring.ts.
//
// `next_run_on` = primera fecha que todavía NO se ha generado. La próxima
// ocurrencia es la primera fecha >= next_run_on que cae en `day_of_month`:
//   - mensual: ese mes, o el siguiente si ese día ya pasó;
//   - anual: siempre en el mes de next_run_on (el mes en que se creó).
// ---------------------------------------------------------------------------

export type RecurringSchedule = {
  cadence: 'monthly' | 'annual'
  day_of_month: number
  next_run_on: string // 'YYYY-MM-DD'
}

export type PendingDates = {
  dates: string[] // 'YYYY-MM-DD', de más antigua a más reciente, todas <= today
  nextRunOn: string // primera fecha que queda sin generar
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Suma `months` meses a (y, m) con m en 1..12.
function addMonths(y: number, m: number, months: number): [number, number] {
  const idx = y * 12 + (m - 1) + months
  return [Math.floor(idx / 12), (idx % 12) + 1]
}

// `max` limita cuántas fechas se devuelven por llamada, para no generar cientos
// de golpe si next_run_on es muy antiguo; lo que quede se genera la próxima vez.
export function pendingDates(t: RecurringSchedule, today: string, max = 24): PendingDates {
  const step = t.cadence === 'annual' ? 12 : 1
  const day = Math.min(t.day_of_month, 28)
  const [y0, m0, d0] = t.next_run_on.split('-').map(Number) as [number, number, number]

  let [y, m] = day < d0 ? addMonths(y0, m0, step) : [y0, m0]
  let candidate = toISO(y, m, day)
  const dates: string[] = []
  while (candidate <= today && dates.length < max) {
    dates.push(candidate)
    ;[y, m] = addMonths(y, m, step)
    candidate = toISO(y, m, day)
  }
  return { dates, nextRunOn: candidate }
}
