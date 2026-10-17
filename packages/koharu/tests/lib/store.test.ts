import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { receiveDownload, useKoharuStore } from '@/lib/store'

describe('editor state', () => {
  it('retains failed downloads until they are dismissed', () => {
    useKoharuStore.setState({ downloads: {} })
    receiveDownload({
      state: 'failed',
      id: 9,
      name: 'weights.bin',
      completed: 0,
      total: 0,
      error: 'network unavailable',
    })
    expect(useKoharuStore.getState().downloads[9]).toMatchObject({
      state: 'failed',
      name: 'weights.bin',
    })

    useKoharuStore.getState().dismissDownload(9)
    expect(useKoharuStore.getState().downloads[9]).toBeUndefined()
  })

  it('defaults paint brush color to pure white (#FFFFFF)', () => {
    expect(useKoharuStore.getState().brush.color).toBe('#FFFFFF')
  })
})

describe('shortcut persistence', () => {
  const values = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  })

  afterEach(() => {
    values.clear()
    vi.resetModules()
  })

  it('restores changed shortcuts in a new session', async () => {
    const first = await import('@/lib/store')
    first.useKoharuStore.getState().setShortcut('select', 'Q')
    first.useKoharuStore.getState().setShortcut('pan', '')

    vi.resetModules()
    const next = await import('@/lib/store')
    expect(next.useKoharuStore.getState().shortcuts).toEqual({
      ...next.defaultShortcuts,
      select: 'q',
      pan: '',
    })
  })

  it('ignores invalid stored shortcuts', async () => {
    values.set('koharu-shortcuts', JSON.stringify({ select: 'long', text: 4 }))
    const { defaultShortcuts, useKoharuStore } = await import('@/lib/store')
    expect(useKoharuStore.getState().shortcuts).toEqual(defaultShortcuts)
  })
})
