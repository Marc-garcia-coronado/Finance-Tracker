import { describe, expect, it } from 'vitest'
import {
  childrenOf,
  groupByBucket,
  orderWithChildren,
  parentOptions,
  qualifiedName,
  type TreeAccount,
} from './accountTree'

const acc = (over: Partial<TreeAccount> & { id: string }): TreeAccount => ({
  name: over.id,
  type: 'expense',
  is_budget_bucket: false,
  is_archived: false,
  parent_id: null,
  ...over,
})

const accounts: TreeAccount[] = [
  acc({ id: 'nec', name: 'Necesidades', is_budget_bucket: true }),
  acc({ id: 'ocio', name: 'Ocio', is_budget_bucket: true }),
  acc({ id: 'super', name: 'Supermercado', parent_id: 'nec' }),
  acc({ id: 'transp', name: 'Transporte', parent_id: 'nec' }),
  acc({ id: 'viejo', name: 'Viejo', is_budget_bucket: true, is_archived: true }),
  acc({ id: 'cc', type: 'asset', is_budget_bucket: true }),
]

describe('parentOptions', () => {
  it('solo buckets de gasto activos y de primer nivel', () => {
    expect(parentOptions(accounts).map((a) => a.id)).toEqual(['nec', 'ocio'])
  })
  it('excluye la propia cuenta', () => {
    expect(parentOptions(accounts, 'nec').map((a) => a.id)).toEqual(['ocio'])
  })
})

describe('childrenOf / qualifiedName', () => {
  it('lista las hijas de un bucket', () => {
    expect(childrenOf(accounts, 'nec').map((a) => a.id)).toEqual(['super', 'transp'])
    expect(childrenOf(accounts, 'ocio')).toEqual([])
  })
  it('añade el bucket al nombre de la subcategoría', () => {
    const byId = new Map(accounts.map((a) => [a.id, a]))
    expect(qualifiedName(accounts[2]!, byId)).toBe('Supermercado · Necesidades')
    expect(qualifiedName(accounts[1]!, byId)).toBe('Ocio')
  })
})

describe('groupByBucket', () => {
  it('suma las subcategorías bajo su bucket y ordena por total', () => {
    const rows = [
      { accountId: 'super', name: 'Supermercado', cents: 30000 },
      { accountId: 'transp', name: 'Transporte', cents: 10000 },
      { accountId: 'nec', name: 'Necesidades', cents: 5000 },
      { accountId: 'ocio', name: 'Ocio', cents: 20000 },
    ]
    expect(groupByBucket(rows, accounts)).toEqual([
      {
        accountId: 'nec',
        name: 'Necesidades',
        cents: 45000,
        ownCents: 5000,
        children: [
          { accountId: 'super', name: 'Supermercado', cents: 30000 },
          { accountId: 'transp', name: 'Transporte', cents: 10000 },
        ],
      },
      { accountId: 'ocio', name: 'Ocio', cents: 20000, ownCents: 0 + 20000, children: [] },
    ])
  })

  it('crea el grupo del padre aunque solo tenga gasto una hija', () => {
    const [g] = groupByBucket([{ accountId: 'super', name: 'Supermercado', cents: 700 }], accounts)
    expect(g).toMatchObject({ accountId: 'nec', name: 'Necesidades', cents: 700, ownCents: 0 })
  })

  it('una cuenta con padre desconocido es raíz', () => {
    const rows = [{ accountId: 'x', name: 'X', cents: 5 }]
    const orphan = [acc({ id: 'x', name: 'X', parent_id: 'borrado' })]
    expect(groupByBucket(rows, orphan)[0]).toMatchObject({ accountId: 'x', ownCents: 5, children: [] })
  })
})

describe('orderWithChildren', () => {
  it('coloca cada hija justo debajo de su bucket', () => {
    const list = orderWithChildren([
      acc({ id: 'super', parent_id: 'nec' }),
      acc({ id: 'ocio' }),
      acc({ id: 'nec' }),
      acc({ id: 'transp', parent_id: 'nec' }),
    ])
    expect(list.map((x) => `${x.depth}:${x.account.id}`)).toEqual([
      '0:ocio',
      '0:nec',
      '1:super',
      '1:transp',
    ])
  })

  it('una hija cuyo padre no está en la lista sale como raíz', () => {
    const list = orderWithChildren([acc({ id: 'x', parent_id: 'otro' })])
    expect(list).toEqual([{ account: expect.objectContaining({ id: 'x' }), depth: 0 }])
  })
})
