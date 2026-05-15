import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_STATE_STORAGE_KEY, LEGACY_APP_STATE_STORAGE_KEY, createAppStateStore, type AppStateStore } from './app-state-store'
import { createAppPersistenceService } from './app-persistence-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app state storage keys', () => {
  it('keeps the current renderer cache separate from the legacy app-state key', () => {
    expect(LEGACY_APP_STATE_STORAGE_KEY).toBe('data/notes/index.json')
    expect(APP_STATE_STORAGE_KEY).toBe('tabs:app-state-cache:v1')
    expect(APP_STATE_STORAGE_KEY).not.toBe(LEGACY_APP_STATE_STORAGE_KEY)
  })
})

describe('app persistence service', () => {
  it('does not expose hydration when the active store is synchronous', () => {
    const store: AppStateStore = {
      load: () => null,
      save: vi.fn(),
    }

    const service = createAppPersistenceService(store)

    expect(service.hydrateSerializedState).toBeUndefined()
  })

  it('exposes hydration when the active store supports async hydration', () => {
    const hydrate = vi.fn()
    const store: AppStateStore = {
      load: () => null,
      save: vi.fn(),
      hydrate,
    }

    const service = createAppPersistenceService(store)
    service.hydrateSerializedState?.(() => undefined)

    expect(hydrate).toHaveBeenCalledOnce()
  })
})

describe('Electron app state store', () => {
  it('blocks saves after a failed structured load result', () => {
    const saveAppState = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: false,
          serializedState: null,
          source: 'hybrid',
          error: 'Existing app state could not be loaded.',
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{}')
    expect(saveAppState).not.toHaveBeenCalled()
  })

  it('allows saves after a successful structured load result', () => {
    const saveAppState = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"dawn"}')
    store.save('{"theme":"light"}')
    expect(saveAppState).toHaveBeenCalledWith('{"theme":"light"}')
  })

  it('allows saves after a truly empty profile load result', () => {
    const saveAppState = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: null,
          source: 'empty',
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{"theme":"dawn"}')
    expect(saveAppState).toHaveBeenCalledWith('{"theme":"dawn"}')
  })
})
