// ---------------------------------------------------------------------------
// Lectura completa paginada. PostgREST/Supabase devuelve como máximo `max-rows`
// filas por petición (1000 por defecto) y trunca el resto SIN error, así que
// cualquier lectura de "todas las filas" de una tabla que crece (entries,
// entry_lines) tiene que pasar por aquí.
//
// `page` debe construir una query NUEVA en cada llamada (los builders de
// supabase-js son de un solo uso), aplicarle `.range(from, to)` y llevar un
// `.order()` sobre una columna única para que la paginación sea estable.
// ---------------------------------------------------------------------------

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    // Se para con una página VACÍA, no con una incompleta: si el max-rows del
    // servidor es menor que pageSize, una página corta no significa el final.
    if (rows.length === 0) return out
    out.push(...rows)
    from += rows.length
  }
}
