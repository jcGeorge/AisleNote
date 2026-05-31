import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_STATE_STORAGE_KEY, createAppStateStore, type AppStateStore } from './app-state-store'
import { createAppPersistenceService } from './app-persistence-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app state storage keys', () => {
  it('uses the current renderer cache key', () => {
    expect(APP_STATE_STORAGE_KEY).toBe('tabs:app-state-cache:v1')
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

  it('exposes subscriptions when the active store supports state updates', () => {
    const subscribe = vi.fn(() => () => undefined)
    const store: AppStateStore = {
      load: () => null,
      save: vi.fn(),
      subscribe,
    }

    const service = createAppPersistenceService(store)
    service.subscribeSerializedState?.(() => undefined)

    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('exposes pending save flushing when the active store supports it', async () => {
    const flush = vi.fn()
    const store: AppStateStore = {
      load: () => null,
      save: vi.fn(),
      flush,
    }

    const service = createAppPersistenceService(store)
    await service.flushPendingSaves?.()

    expect(flush).toHaveBeenCalledOnce()
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
          revision: 0,
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{}')
    expect(saveAppState).not.toHaveBeenCalled()
  })

  it('unblocks saves after a storage profile switch reports ready', () => {
    let statusHandler:
      | ((status: {
          status: 'ready' | 'error'
          profileRootPath: string
          notesPath: string
          isDefault: boolean
          hasProfile: boolean
          canWrite: boolean
          revision?: number
        }) => void)
      | undefined
    const saveAppState = vi.fn(() => ({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 1,
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: false,
          serializedState: null,
          source: 'hybrid',
          error: 'Existing app state could not be loaded.',
          revision: 0,
        }),
        saveAppState,
        onStorageProfileStatusUpdated: vi.fn((handler) => {
          statusHandler = handler
          return vi.fn()
        }),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{"theme":"blocked"}')
    expect(saveAppState).not.toHaveBeenCalled()

    statusHandler?.({
      status: 'ready',
      profileRootPath: '/tmp/tabs',
      notesPath: '/tmp/tabs/notes',
      isDefault: false,
      hasProfile: false,
      canWrite: true,
      revision: 0,
    })
    store.save('{"theme":"light"}')

    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"light"}',
      baseRevision: 0,
    })
  })

  it('allows saves after a successful structured load result', () => {
    const saveAppState = vi.fn()
    const dispatchEvent = vi.fn()
    class TestCustomEvent {
      type: string
      detail: unknown

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
    vi.stubGlobal('window', {
      dispatchEvent,
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState: saveAppState.mockReturnValue({
          ok: true,
          serializedState: '{"theme":"light"}',
          revision: 2,
        }),
      },
      CustomEvent: TestCustomEvent,
    })
    vi.stubGlobal('CustomEvent', TestCustomEvent)

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"dawn"}')
    store.save('{"theme":"light"}')
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"light"}',
      baseRevision: 1,
    })
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tabs:app-state-saved',
      detail: {
        serializedState: '{"theme":"light"}',
        snapshotMode: 'force',
      },
    }))
  })

  it('allows saves after a truly empty profile load result', () => {
    const saveAppState = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: null,
          source: 'empty',
          revision: 0,
        }),
        saveAppState: saveAppState.mockReturnValue({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          revision: 1,
        }),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{"theme":"dawn"}')
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"dawn"}',
      baseRevision: 0,
    })
  })

  it('uses async Electron saves when available and keeps revisions ordered', async () => {
    let nextRevision = 2
    const saveAppState = vi.fn()
    const dispatchEvent = vi.fn()
    class TestCustomEvent {
      type: string
      detail: unknown

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
    const saveAppStateAsync = vi.fn(async (payload) => ({
      ok: true,
      serializedState: payload.serializedState,
      revision: nextRevision++,
    }))
    vi.stubGlobal('window', {
      dispatchEvent,
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
      CustomEvent: TestCustomEvent,
    })
    vi.stubGlobal('CustomEvent', TestCustomEvent)

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"dawn"}')
    store.save('{"theme":"light"}', { snapshotMode: 'skip' })
    store.save('{"theme":"dark"}', { snapshotMode: 'debounced' })
    await store.flush?.()

    expect(saveAppState).not.toHaveBeenCalled()
    expect(saveAppStateAsync).toHaveBeenCalledTimes(2)
    expect(saveAppStateAsync).toHaveBeenNthCalledWith(1, {
      serializedState: '{"theme":"light"}',
      baseRevision: 1,
      snapshotMode: 'skip',
    })
    expect(saveAppStateAsync).toHaveBeenNthCalledWith(2, {
      serializedState: '{"theme":"dark"}',
      baseRevision: 2,
      snapshotMode: 'debounced',
    })
    expect(dispatchEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'tabs:app-state-saved',
      detail: {
        serializedState: '{"theme":"dark"}',
        snapshotMode: 'debounced',
      },
    }))
  })

  it('falls back to sync Electron saves when async save is unavailable or sync is preferred', () => {
    const saveAppState = vi.fn(() => ({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"dawn"}')
    store.save('{"theme":"light"}', { snapshotMode: 'force', preferSync: true })

    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"light"}',
      baseRevision: 1,
      snapshotMode: 'force',
    })
  })

  it('does not apply an older async save result after a forced sync save', async () => {
    let resolveAsyncSave: ((value: { ok: true; serializedState: string; revision: number }) => void) | undefined
    const saveAppStateAsync = vi.fn(
      () =>
        new Promise<{ ok: true; serializedState: string; revision: number }>((resolve) => {
          resolveAsyncSave = resolve
        }),
    )
    const saveAppState = vi.fn(() => ({
      ok: true,
      serializedState: '{"theme":"fresh"}',
      revision: 7,
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"dawn"}')
    store.save('{"theme":"stale"}', { snapshotMode: 'skip' })
    await Promise.resolve()
    await Promise.resolve()
    store.save('{"theme":"fresh"}', { snapshotMode: 'force', preferSync: true })
    resolveAsyncSave?.({ ok: true, serializedState: '{"theme":"stale"}', revision: 2 })
    await store.flush?.()

    expect(saveAppStateAsync).toHaveBeenCalledOnce()
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"fresh"}',
      baseRevision: 1,
      snapshotMode: 'force',
    })
    expect(window.__tabsGetAppStateRevision?.()).toBe(7)
  })

  it('subscribes to accepted app-state updates from other windows', () => {
    let updateHandler: ((payload: { serializedState: string; revision: number }) => void) | undefined
    const unsubscribe = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"dawn"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState: vi.fn(),
        onAppStateUpdated: vi.fn((handler) => {
          updateHandler = handler
          return unsubscribe
        }),
      },
    })

    const store = createAppStateStore()
    const onUpdatedState = vi.fn()
    const stop = store.subscribe?.(onUpdatedState)

    if (!updateHandler) throw new Error('missing app state update handler')
    updateHandler({ serializedState: '{"theme":"light"}', revision: 2 })
    stop?.()

    expect(onUpdatedState).toHaveBeenCalledWith('{"theme":"light"}')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
