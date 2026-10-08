// ---------------------------------------------------------------------------
// Jerarquía de categorías de gasto: una subcategoría (Supermercado) cuelga de un
// bucket (Necesidades) mediante accounts.parent_id. Un solo nivel. Funciones
// puras sobre los datos ya descifrados.
// ---------------------------------------------------------------------------
import type { Enums } from './database.types'

export type TreeAccount = {
  id: string
  name: string
  type: Enums<'account_type'>
  is_budget_bucket: boolean
  is_archived: boolean
  parent_id: string | null
}

// Buckets de gasto que pueden ser padre de `selfId` (el propio no, ni archivados).
export function parentOptions<T extends TreeAccount>(accounts: T[], selfId?: string): T[] {
  return accounts.filter(
    (a) =>
      a.type === 'expense' &&
      a.is_budget_bucket &&
      !a.is_archived &&
      a.parent_id === null &&
      a.id !== selfId,
  )
}

export function childrenOf<T extends TreeAccount>(accounts: T[], id: string): T[] {
  return accounts.filter((a) => a.parent_id === id)
}

// Nombre de la subcategoría con su bucket: «Supermercado · Necesidades».
export function qualifiedName(account: TreeAccount, byId: Map<string, TreeAccount>): string {
  const parent = account.parent_id ? byId.get(account.parent_id) : undefined
  return parent ? `${account.name} · ${parent.name}` : account.name
}

export type GroupedAmount = {
  accountId: string
  name: string
  cents: number // total del grupo: propio + subcategorías
  ownCents: number // lo gastado directamente en la cuenta
  children: { accountId: string; name: string; cents: number }[]
}

// Agrupa importes por cuenta bajo su bucket. Un grupo aparece si el padre o
// alguna hija tiene importe; el orden es por total descendente. Una cuenta cuyo
// padre no se conoce se trata como raíz.
export function groupByBucket(
  rows: { accountId: string; name: string; cents: number }[],
  accounts: Pick<TreeAccount, 'id' | 'name' | 'parent_id'>[],
): GroupedAmount[] {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const groups = new Map<string, GroupedAmount>()
  const group = (id: string, name: string): GroupedAmount => {
    let g = groups.get(id)
    if (!g) groups.set(id, (g = { accountId: id, name, cents: 0, ownCents: 0, children: [] }))
    return g
  }

  for (const r of rows) {
    const parent = byId.get(r.accountId)?.parent_id
    const parentAcc = parent ? byId.get(parent) : undefined
    if (parent && parentAcc) {
      const g = group(parent, parentAcc.name)
      g.children.push(r)
      g.cents += r.cents
    } else {
      const g = group(r.accountId, r.name)
      g.ownCents += r.cents
      g.cents += r.cents
    }
  }
  for (const g of groups.values()) g.children.sort((a, b) => b.cents - a.cents)
  return [...groups.values()].sort((a, b) => b.cents - a.cents)
}

// Lista plana con cada subcategoría justo debajo de su bucket (depth 1). Respeta
// el orden de entrada; una hija cuyo padre no está en la lista se trata como raíz.
export function orderWithChildren<T extends Pick<TreeAccount, 'id' | 'parent_id'>>(
  accounts: T[],
): { account: T; depth: 0 | 1 }[] {
  const ids = new Set(accounts.map((a) => a.id))
  const out: { account: T; depth: 0 | 1 }[] = []
  for (const a of accounts) {
    if (a.parent_id !== null && ids.has(a.parent_id)) continue // va bajo su padre
    out.push({ account: a, depth: 0 })
    for (const c of accounts) if (c.parent_id === a.id) out.push({ account: c, depth: 1 })
  }
  return out
}
