// Búsqueda de texto en cliente (las descripciones van cifradas: el servidor no
// puede buscar). Ignora mayúsculas y acentos; con varias palabras, todas deben
// aparecer, en cualquier orden. Una búsqueda vacía coincide con todo.
import { normalizeText } from './importMovements'

export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(text)
  return words.every((w) => haystack.includes(w))
}
