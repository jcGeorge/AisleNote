import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readLocalJsonPreference,
  readLocalStringPreference,
  writeLocalJsonPreference,
  writeLocalStringPreference,
} from './local-preferences'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubLocalStorage(seed: Record<string, string> = {}) {
  const cache = new Map(Object.entries(seed))
  const storage = {
    getItem: vi.fn((key: string) => cache.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      cache.set(key, value)
    }),
  }
  vi.stubGlobal('window', { localStorage: storage })
  return { cache, storage }
}

describe('local preferences', () => {
  it('reads valid JSON preferences through a normalizer', () => {
    stubLocalStorage({
      recent: JSON.stringify([' tag ', '', 'other']),
    })

    const value = readLocalJsonPreference('recent', [], (raw) =>
      Array.isArray(raw)
        ? raw.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
        : [],
    )

    expect(value).toEqual(['tag', 'other'])
  })

  it('falls back for corrupt JSON preferences', () => {
    stubLocalStorage({ recent: '{not-json' })

    expect(readLocalJsonPreference('recent', ['fallback'])).toEqual(['fallback'])
  })

  it('writes normalized JSON preferences', () => {
    const { cache } = stubLocalStorage()

    writeLocalJsonPreference('recent', [' tag ', ''], (value) => value.map((entry) => entry.trim()).filter(Boolean))

    expect(cache.get('recent')).toBe(JSON.stringify(['tag']))
  })

  it('reads and writes string preferences with fallback', () => {
    const { cache } = stubLocalStorage({ layout: 'custom' })

    expect(readLocalStringPreference('layout', 'default')).toBe('custom')
    expect(readLocalStringPreference('missing', 'default')).toBe('default')

    writeLocalStringPreference('layout', 'other')
    expect(cache.get('layout')).toBe('other')
  })

  it('keeps storage failures non-fatal', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    vi.stubGlobal('window', { localStorage: storage })

    expect(readLocalJsonPreference('recent', ['fallback'])).toEqual(['fallback'])
    expect(readLocalStringPreference('layout', 'default')).toBe('default')
    expect(() => writeLocalJsonPreference('recent', [])).not.toThrow()
    expect(() => writeLocalStringPreference('layout', 'default')).not.toThrow()
  })
})
