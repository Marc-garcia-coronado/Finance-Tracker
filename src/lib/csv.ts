// ---------------------------------------------------------------------------
// Parser CSV mínimo y sin dependencias.
//   - Autodetecta el delimitador (';', ',' o tab). Importante: el Excel español
//     exporta con ';' porque la coma es el separador decimal.
//   - Soporta campos entre comillas dobles, comillas escapadas ("") y saltos de
//     línea dentro de un campo entrecomillado.
//   - Ignora el BOM inicial y las líneas vacías finales.
// ---------------------------------------------------------------------------

export type ParsedCsv = { headers: string[]; rows: string[][] }

const DELIMITERS = [';', ',', '\t'] as const
type Delimiter = (typeof DELIMITERS)[number]

// Cuenta apariciones de cada delimitador fuera de comillas en la primera línea
// "lógica" (respetando campos entrecomillados) y elige el más frecuente.
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++ // comilla escapada
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (inQuotes) continue
    if (ch === '\n') break // fin de la primera línea
    if (ch === ';' || ch === ',' || ch === '\t') counts[ch]++
  }
  let best: Delimiter = ';'
  for (const d of DELIMITERS) {
    if (counts[d] > counts[best]) best = d
  }
  return best
}

export function parseCsv(input: string, delimiter?: Delimiter): ParsedCsv {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const delim = delimiter ?? detectDelimiter(text)

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      pushField()
    } else if (ch === '\n') {
      pushRecord()
    } else {
      field += ch
    }
  }
  // Último campo/registro si el texto no termina en salto de línea.
  if (field !== '' || record.length > 0) pushRecord()

  // Descarta registros completamente vacíos (p. ej. líneas en blanco).
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const [headers, ...rows] = nonEmpty
  return {
    headers: (headers ?? []).map((h) => h.trim()),
    rows: rows.map((r) => r.map((c) => c.trim())),
  }
}
