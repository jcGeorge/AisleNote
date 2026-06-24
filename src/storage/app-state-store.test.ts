import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_STATE_STORAGE_KEY, createAppStateStore, type AppStateStore } from './app-state-store'
import { createAppPersistenceService } from './app-persistence-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app state storage keys', () => {
  it('uses the current renderer cache key', () => {
    expect(APP_STATE_STORAGE_KEY).toBe('aislenote:app-state-cache:v1')
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
    const appendDiagnosticLogEntry = vi.fn(async () => ({ ok: true }))
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
        appendDiagnosticLogEntry,
        listDiagnosticLogDays: vi.fn(),
        readDiagnosticLogEntries: vi.fn(),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{}', { trigger: 'blocked-test', pendingEditorCount: 3 })
    expect(saveAppState).not.toHaveBeenCalled()
    expect(appendDiagnosticLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      area: 'storage',
      event: 'app-state-save-blocked-load-failure',
      details: expect.objectContaining({
        trigger: 'blocked-test',
        pendingEditorCount: 3,
      }),
    }))
  })

  it('unblocks saves after a storage profile switch reports ready', () => {
    let statusHandler:
      | ((status: {
          status: 'ready' | 'error' | 'setup-required'
          profileRootPath: string
          notebookPath: string
          notebookName: string
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
      profileRootPath: '/tmp/aislenote',
      notebookPath: '/tmp/aislenote',
      notebookName: 'aislenote',
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
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState: saveAppState.mockReturnValue({
          ok: true,
          serializedState: '{"theme":"light"}',
          revision: 2,
        }),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}')
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"light"}',
      baseRevision: 1,
    })
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
          serializedState: '{"theme":"cheese"}',
          revision: 1,
        }),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBeNull()
    store.save('{"theme":"cheese"}')
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"cheese"}',
      baseRevision: 0,
    })
  })

  it('coalesces queued async Electron saves to the latest payload', async () => {
    let nextRevision = 2
    const saveAppState = vi.fn()
    const saveAppStateAsync = vi.fn(async (payload) => ({
      ok: true,
      serializedState: payload.serializedState,
      revision: nextRevision++,
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}')
    store.save('{"theme":"dark"}')
    await store.flush?.()

    expect(saveAppState).not.toHaveBeenCalled()
    expect(saveAppStateAsync).toHaveBeenCalledOnce()
    expect(saveAppStateAsync).toHaveBeenCalledWith({
      serializedState: '{"theme":"dark"}',
      baseRevision: 1,
    })
  })

  it('skips duplicate async Electron payloads queued while the same save is in flight', async () => {
    let resolveSave:
      | ((value: {
          ok: true
          serializedState: string
          revision: number
        }) => void)
      | undefined
    const saveAppState = vi.fn()
    const saveAppStateAsync = vi.fn(
      (payload) =>
        new Promise<{ ok: true; serializedState: string; revision: number }>((resolve) => {
          resolveSave = () => resolve({
            ok: true,
            serializedState: payload.serializedState,
            revision: 2,
          })
        }),
    )
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}')
    await Promise.resolve()
    await Promise.resolve()
    store.save('{"theme":"light"}')
    resolveSave?.({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
    })
    await store.flush?.()

    expect(saveAppState).not.toHaveBeenCalled()
    expect(saveAppStateAsync).toHaveBeenCalledOnce()
  })

  it('skips saves when the serialized state is unchanged and no async payload is pending', async () => {
    const saveAppState = vi.fn()
    const saveAppStateAsync = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"cheese"}')
    store.save('{"theme":"cheese"}', { preferSync: true })
    await store.flush?.()

    expect(saveAppState).not.toHaveBeenCalled()
    expect(saveAppStateAsync).not.toHaveBeenCalled()
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
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}', { preferSync: true })

    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"light"}',
      baseRevision: 1,
    })
  })

  it('records save metrics diagnostics returned by Electron saves', async () => {
    const saveMetrics = {
      totalDurationMs: 75,
      phases: {
        parseState: 1,
        buildFileMap: 2,
        noteBodyTraversal: 0,
        noteContentGeneration: 0,
        assetReferenceExtraction: 0,
        manifestAssembly: 0,
        assetResolve: 0,
        fingerprint: 3,
        expectedFileRebuild: 0,
        textWrites: 4,
        binaryWrites: 0,
        prune: 0,
        appSettingsWrite: 1,
      },
      counts: {
        generatedFiles: 5,
        generatedBytes: 200,
        textFiles: 5,
        jsonFiles: 3,
        mdFiles: 2,
        binaryFiles: 0,
        existingAssetFiles: 0,
        expectedFiles: 5,
        hashesComputed: 5,
        assetsReferenced: 0,
        assetsReadFromDisk: 0,
        assetsReused: 0,
        assetBytesReferenced: 0,
        assetBytesReadFromDisk: 0,
        filesChanged: 1,
        filesSkipped: 4,
        filesPruned: 0,
        directoriesPruned: 0,
        aisleStorageCacheHits: 0,
        aisleStorageCacheMisses: 0,
      },
    }
    const appendDiagnosticLogEntry = vi.fn(async () => ({ ok: true }))
    const saveAppState = vi.fn(() => ({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
      saveMetrics,
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        appendDiagnosticLogEntry,
        listDiagnosticLogDays: vi.fn(),
        readDiagnosticLogEntries: vi.fn(),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}', {
      preferSync: true,
      trigger: 'test-trigger',
      pendingEditorCount: 2,
      rendererSerializeDurationMs: 3.4,
      rendererSerializedBytes: 17,
    })
    await Promise.resolve()

    expect(appendDiagnosticLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      area: 'storage',
      event: 'app-state-save-metrics',
      details: expect.objectContaining({
        trigger: 'test-trigger',
        mode: 'sync',
        pendingEditorCount: 2,
        rendererSerializeDurationMs: 3.4,
        rendererSerializedBytes: 17,
        rendererSaveMetrics: expect.objectContaining({
          serializeDurationMs: 3.4,
          serializedBytes: 17,
          ipcDurationMs: expect.any(Number),
        }),
        saveMetrics,
      }),
    }))
  })

  it('does not record verbose save metrics diagnostics for fast Electron saves', async () => {
    const appendDiagnosticLogEntry = vi.fn(async () => ({ ok: true }))
    const saveAppState = vi.fn(() => ({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
      saveMetrics: {
        totalDurationMs: 12,
      },
    }))
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        appendDiagnosticLogEntry,
        listDiagnosticLogDays: vi.fn(),
        readDiagnosticLogEntries: vi.fn(),
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"light"}', { preferSync: true, trigger: 'fast-save' })
    await Promise.resolve()

    expect(appendDiagnosticLogEntry).not.toHaveBeenCalledWith(expect.objectContaining({
      area: 'storage',
      event: 'app-state-save-metrics',
    }))
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
          serializedState: '{"theme":"cheese"}',
          source: 'hybrid',
          revision: 1,
        }),
        saveAppState,
        saveAppStateAsync,
      },
    })

    const store = createAppStateStore()

    expect(store.load()).toBe('{"theme":"cheese"}')
    store.save('{"theme":"stale"}')
    await Promise.resolve()
    await Promise.resolve()
    store.save('{"theme":"fresh"}', { preferSync: true })
    resolveAsyncSave?.({ ok: true, serializedState: '{"theme":"stale"}', revision: 2 })
    await store.flush?.()

    expect(saveAppStateAsync).toHaveBeenCalledOnce()
    expect(saveAppState).toHaveBeenCalledWith({
      serializedState: '{"theme":"fresh"}',
      baseRevision: 1,
    })
    expect(window.__aislenoteGetAppStateRevision?.()).toBe(7)
  })

  it('subscribes to accepted app-state updates from other windows', () => {
    let updateHandler: ((payload: { serializedState: string; revision: number }) => void) | undefined
    const unsubscribe = vi.fn()
    vi.stubGlobal('window', {
      electronAPI: {
        loadAppStateResult: () => ({
          ok: true,
          serializedState: '{"theme":"cheese"}',
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
