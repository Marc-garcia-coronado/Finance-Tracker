// @vitest-environment jsdom
// En modo demo, ninguna lectura ni escritura llega a Supabase ni a las funciones
// reales del ledger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const real = vi.hoisted(() => {
  const touched = () => {
    throw new Error('Se ha tocado Supabase en modo demo')
  }
  return {
    from: vi.fn(touched),
    rpc: vi.fn(touched),
    getSession: vi.fn(touched),
    createEntry: vi.fn(),
    voidEntry: vi.fn(),
    replaceEntry: vi.fn(),
    adjustAccountBalance: vi.fn(),
    generateRecurringForMonth: vi.fn(),
  }
})

vi.mock('./supabase', () => ({
  supabase: { from: real.from, rpc: real.rpc, auth: { getSession: real.getSession } },
}))
vi.mock('./entries', () => ({
  createEntry: real.createEntry,
  voidEntry: real.voidEntry,
  replaceEntry: real.replaceEntry,
  adjustAccountBalance: real.adjustAccountBalance,
}))
vi.mock('./recurring', () => ({ generateRecurringForMonth: real.generateRecurringForMonth }))

import { DemoModeError, setDemoMode } from './demo/demoMode'
import { A } from './demo/demoData'
import { resetDemoStore } from './demo/demoStore'
import {
  fetchAllEntries,
  useAccounts,
  useAdjustBalance,
  useCheckIntegrity,
  useCreateEntry,
  useEntries,
  useGenerateRecurring,
  useSaveGoal,
  useVoidEntry,
} from './queries'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const params = {
  kind: 'expense',
  date: '2026-10-08',
  description: 'Prueba',
  fromAccountId: A.checking,
  toAccountId: A.groceries,
  amountCents: 500,
} as const

beforeEach(() => {
  resetDemoStore('2026-10-08')
  setDemoMode(true)
})
afterEach(() => {
  setDemoMode(false)
  vi.clearAllMocks()
})

describe('modo demo y Supabase', () => {
  it('las lecturas salen de los datos de ejemplo sin tocar Supabase', async () => {
    const { result } = renderHook(() => useAccounts(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.some((a) => a.name === 'Cuenta corriente')).toBe(true)

    const entries = renderHook(
      () => useEntries({ month: 'all', kind: 'all', accountId: 'all', hideVoided: false, page: 0, pageSize: 5 }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(entries.result.current.isSuccess).toBe(true))
    expect(entries.result.current.data!.rows).toHaveLength(5)

    expect(await fetchAllEntries({ month: 'all', kind: 'all', accountId: 'all', hideVoided: true })).not.toHaveLength(0)
    expect(real.from).not.toHaveBeenCalled()
    expect(real.rpc).not.toHaveBeenCalled()
  })

  it('crear y anular movimientos no invoca createEntry ni voidEntry reales', async () => {
    const create = renderHook(() => useCreateEntry(), { wrapper: wrapper() })
    let id = ''
    await act(async () => {
      id = await create.result.current.mutateAsync(params)
    })
    expect(id).toMatch(/^demo-new-/)

    const voidHook = renderHook(() => useVoidEntry(), { wrapper: wrapper() })
    await act(async () => {
      await voidHook.result.current.mutateAsync(id)
    })

    expect(real.createEntry).not.toHaveBeenCalled()
    expect(real.voidEntry).not.toHaveBeenCalled()
    expect(real.replaceEntry).not.toHaveBeenCalled()
    expect(real.from).not.toHaveBeenCalled()
    expect(real.rpc).not.toHaveBeenCalled()
  })

  it('el resto de escrituras se rechazan con DemoModeError sin tocar nada real', async () => {
    const adjust = renderHook(() => useAdjustBalance(), { wrapper: wrapper() })
    const goal = renderHook(() => useSaveGoal(), { wrapper: wrapper() })
    const recurring = renderHook(() => useGenerateRecurring(), { wrapper: wrapper() })

    await act(async () => {
      await expect(
        adjust.result.current.mutateAsync({ accountId: A.checking, targetCents: 1, currentCents: 0 }),
      ).rejects.toBeInstanceOf(DemoModeError)
      await expect(
        goal.result.current.mutateAsync({ name: 'x', target_cents: 100, monthly_contribution_cents: 0 } as never),
      ).rejects.toBeInstanceOf(DemoModeError)
      await expect(recurring.result.current.mutateAsync('2026-10')).rejects.toBeInstanceOf(DemoModeError)
    })

    expect(real.adjustAccountBalance).not.toHaveBeenCalled()
    expect(real.generateRecurringForMonth).not.toHaveBeenCalled()
    expect(real.from).not.toHaveBeenCalled()
    expect(real.rpc).not.toHaveBeenCalled()
    expect(real.getSession).not.toHaveBeenCalled()
  })

  it('la comprobación de integridad responde sin leer la base de datos', async () => {
    const check = renderHook(() => useCheckIntegrity(), { wrapper: wrapper() })
    let result: { problems: unknown[] } | undefined
    await act(async () => {
      result = await check.result.current.mutateAsync()
    })
    expect(result).toMatchObject({ problems: [] })
    expect(real.from).not.toHaveBeenCalled()
  })

  it('fuera del modo demo sí se usan las funciones reales', async () => {
    setDemoMode(false)
    real.createEntry.mockResolvedValue('real-id')
    const create = renderHook(() => useCreateEntry(), { wrapper: wrapper() })
    await act(async () => {
      await create.result.current.mutateAsync(params)
    })
    expect(real.createEntry).toHaveBeenCalledTimes(1)
  })
})
