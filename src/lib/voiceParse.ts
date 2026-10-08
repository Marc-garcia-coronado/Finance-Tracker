// Dictado por voz: construye lo que se envía a la Edge Function y valida lo que
// devuelve la IA. Funciones puras. La IA nunca ve ids reales de cuentas: recibe
// claves opacas («e1», «i2») y aquí se traducen de vuelta.
import { isValid, parseISO } from 'date-fns'
import { centsToInput } from './entryForm'
import { tryEuroToCents } from './money'
import type { TreeAccount } from './accountTree'
import { qualifiedName } from './accountTree'

export const MAX_TEXT_LENGTH = 1000
export const MAX_MOVEMENTS = 20
const MAX_CENTS = 100_000_000_00 // 100 millones de euros: por encima es un error seguro
const MAX_DESCRIPTION = 200

export type VoiceKind = 'expense' | 'income'

export type VoicePayload = {
  text: string
  today: string // 'YYYY-MM-DD'
  expenseCategories: { id: string; name: string }[]
  incomeCategories: { id: string; name: string }[]
}

// Clave opaca -> cuenta real y tipo al que pertenece.
export type CategoryKeys = Map<string, { accountId: string; kind: VoiceKind }>

export type VoiceDraft = {
  kind: VoiceKind
  amount: string // texto del input ("12,50"); vacío si la IA no dio un importe válido
  date: string // 'YYYY-MM-DD'
  description: string
  categoryId: string // id real de la cuenta; '' si no encaja ninguna categoría
}

// Cuentas que se ofrecen como categoría: activas, de gasto o ingreso, y sin la
// cuenta técnica de ajustes de valor.
export function buildVoicePayload(
  text: string,
  today: string,
  accounts: TreeAccount[],
  excludeNames: string[] = [],
): { payload: VoicePayload; keys: CategoryKeys } {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const usable = accounts.filter((a) => !a.is_archived && !excludeNames.includes(a.name))
  const keys: CategoryKeys = new Map()

  const build = (type: 'expense' | 'income', prefix: string) =>
    usable
      .filter((a) => a.type === type)
      .map((a, i) => {
        const id = `${prefix}${i + 1}`
        keys.set(id, { accountId: a.id, kind: type })
        return { id, name: qualifiedName(a, byId) }
      })

  return {
    payload: {
      text: text.trim().slice(0, MAX_TEXT_LENGTH),
      today,
      expenseCategories: build('expense', 'e'),
      incomeCategories: build('income', 'i'),
    },
    keys,
  }
}

function validDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  return isValid(parseISO(value)) ? value : fallback
}

function amountText(value: unknown): string {
  if (typeof value !== 'number' && typeof value !== 'string') return ''
  const cents = tryEuroToCents(String(value))
  return cents !== null && cents > 0 && cents <= MAX_CENTS ? centsToInput(cents) : ''
}

// Valida la respuesta de la Edge Function ({ movements: [...] }). Lo que no
// encaja se corrige de forma segura: fecha inválida -> hoy, categoría
// desconocida o de otro tipo -> sin categoría, importe inválido -> vacío (el
// usuario lo completa al revisar). Lanza si la forma general no es la esperada.
export function parseVoiceResponse(raw: unknown, today: string, keys: CategoryKeys): VoiceDraft[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { movements?: unknown }).movements)) {
    throw new Error('Respuesta de la IA no válida')
  }
  const list = (raw as { movements: unknown[] }).movements.slice(0, MAX_MOVEMENTS)

  const drafts: VoiceDraft[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const m = item as Record<string, unknown>
    if (m.kind !== 'expense' && m.kind !== 'income') continue

    const category = typeof m.categoryId === 'string' ? keys.get(m.categoryId) : undefined
    drafts.push({
      kind: m.kind,
      amount: amountText(m.amount),
      date: validDate(m.date, today),
      description: typeof m.description === 'string' ? m.description.trim().slice(0, MAX_DESCRIPTION) : '',
      categoryId: category && category.kind === m.kind ? category.accountId : '',
    })
  }
  return drafts
}
