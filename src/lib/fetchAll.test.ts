import { describe, expect, it } from 'vitest'
import { fetchAll } from './fetchAll'

// Simula PostgREST: devuelve el rango pedido, recortado a `maxRows`.
function fakeTable(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to + 1, from + maxRows)
    return { data: rows.slice(from, end), error: null }
  }
  return { rows, calls, page }
}

describe('fetchAll', () => {
  it('lee más de 1000 filas en varias páginas', async () => {
    const t = fakeTable(2500)
    const out = await fetchAll(t.page)
    expect(out).toEqual(t.rows)
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2500, 3499],
    ])
  })

  it('no se corta si el servidor devuelve menos filas que pageSize', async () => {
    const t = fakeTable(1234, 300)
    const out = await fetchAll(t.page)
    expect(out).toEqual(t.rows)
  })

  it('devuelve [] sin filas', async () => {
    const t = fakeTable(0)
    expect(await fetchAll(t.page)).toEqual([])
    expect(t.calls).toHaveLength(1)
  })

  it('propaga el error de cualquier página', async () => {
    let n = 0
    const page = async () => {
      n++
      return n === 1
        ? { data: [{ id: 1 }], error: null }
        : { data: null, error: { message: 'boom' } }
    }
    await expect(fetchAll(page)).rejects.toThrow('boom')
  })
})
