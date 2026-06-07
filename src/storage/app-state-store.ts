import { BrowserHybridStateAdapter } from './browser-hybrid-state'
import { CapacitorHybridStateAdapter } from './capacitor-hybrid-state'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { measureSlowAsyncOperation, measureSlowOperation } from '../performance/performance-logging'
import { isNativeCapacitorRuntime } from '../platform/data-platform'
import type { AppStateSaveOptions } from './persistence-debounce'

export const APP_STATE_STORAGE_KEY = 'tabs:app-state-cache:v1'

export interface AppStateStore {
  load(): string | null
  save(serializedState: string, options?: AppStateSaveOptions): void
  flush?(): Promise<void> | void
  hydrate?(onHydratedState: (serializedState: string) => void): Promise<void> | void
  subscribe?(onUpdatedState: (serializedState: string) => void): () => void
}

class BrowserLocalStorageAppStateStore implements AppStateStore {
  private readonly storageKey: string

  constructor(storageKey: string) {
    this.storageKey = storageKey
  }

  load(): string | null {
    try {
      return localStorage.getItem(this.storageKey)
    } catch {
      return null
    }
  }

  save(serializedState: string): void {
    try {
      localStorage.setItem(this.storageKey, serializedState)
    } catch {
      // Keep browser persistence non-fatal.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      // Keep browser persistence non-fatal.
    }
  }
}

class BrowserIndexedDbHybridAppStateStore implements AppStateStore {
  private readonly cacheStore: BrowserLocalStorageAppStateStore
  private readonly hybridAdapter = new BrowserHybridStateAdapter()

  constructor(storageKey: string) {
    this.cacheStore = new BrowserLocalStorageAppStateStore(storageKey)
  }

  load(): string | null {
    return this.cacheStore.load()
  }

  save(serializedState: string): void {
    this.cacheStore.save(serializedState)
    void this.hybridAdapter.saveSerializedState(serializedState)
  }

  async hydrate(onHydratedState: (serializedState: string) => void): Promise<void> {
    const durableState = await this.hybridAdapter.loadSerializedState()
    const cachedState = this.cacheStore.load()

    if (durableState !== null) {
      if (durableState !== cachedState) {
        this.cacheStore.save(durableState)
        onHydratedState(durableState)
      }
      return
    }

    if (cachedState !== null) {
      await this.hybridAdapter.saveSerializedState(cachedState)
    }
  }
}

class CapacitorHybridAppStateStore implements AppStateStore {
  private readonly cacheStore: BrowserLocalStorageAppStateStore
  private readonly hybridAdapter = new CapacitorHybridStateAdapter()
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(storageKey: string) {
    this.cacheStore = new BrowserLocalStorageAppStateStore(storageKey)
  }

  load(): string | null {
    return this.cacheStore.load()
  }

  save(serializedState: string): void {
    this.cacheStore.save(serializedState)
    this.saveQueue = this.hybridAdapter.saveSerializedState(serializedState)
  }

  flush(): Promise<void> {
    return this.saveQueue
  }

  async hydrate(onHydratedState: (serializedState: string) => void): Promise<void> {
    const durableState = await this.hybridAdapter.loadSerializedState()
    const cachedState = this.cacheStore.load()

    if (durableState !== null) {
      if (durableState !== cachedState) {
        this.cacheStore.save(durableState)
        onHydratedState(durableState)
      }
      return
    }

    if (cachedState !== null) {
      this.saveQueue = this.hybridAdapter.saveSerializedState(cachedState)
      await this.saveQueue
    }
  }
}

class ElectronAppStateStore implements AppStateStore {
  private readonly subscribers = new Set<(serializedState: string) => void>()
  private savesBlockedByLoadFailure = false
  private revision = 0
  private saveQueue: Promise<void> = Promise.resolve()
  private syncSaveEpoch = 0
  private asyncSaveActive = false
  private pendingAsyncSerializedState: string | null = null
  private lastSavedSerializedState: string | null = null

  constructor() {
    window.__tabsGetAppStateRevision = () => this.revision
    window.electronAPI?.onStorageProfileStatusUpdated?.((status) => {
      this.savesBlockedByLoadFailure = status.status !== 'ready'
      const nextRevision = status.revision
      if (typeof nextRevision === 'number' && Number.isInteger(nextRevision)) {
        this.revision = nextRevision
      }
    })
  }

  load(): string | null {
    try {
      const loadResult = window.electronAPI?.loadAppStateResult?.()
      if (loadResult) {
        this.savesBlockedByLoadFailure = !loadResult.ok
        this.revision = loadResult.revision
        this.lastSavedSerializedState = loadResult.ok ? loadResult.serializedState : null
        return loadResult.ok ? loadResult.serializedState : null
      }

      this.savesBlockedByLoadFailure = false
      this.revision = 0
      this.lastSavedSerializedState = window.electronAPI?.loadAppState() ?? null
      return this.lastSavedSerializedState
    } catch {
      this.savesBlockedByLoadFailure = true
      return null
    }
  }

  private applySaveResult(
    result: ReturnType<NonNullable<Window['electronAPI']>['saveAppState']> | undefined,
  ) {
    if (result?.ok) {
      this.revision = result.revision
      if (typeof result.serializedState === 'string') {
        this.lastSavedSerializedState = result.serializedState
      }
      return
    }
    if (result && !result.ok && typeof result.currentRevision === 'number') {
      this.revision = result.currentRevision
    }
    if (typeof result?.serializedState === 'string') {
      this.lastSavedSerializedState = result.serializedState
      this.notifySubscribers(result.serializedState)
    }
  }

  private getSaveDiagnosticsDetails(
    serializedState: string,
    mode: 'async' | 'sync' | 'skip',
    trigger: string,
    pendingEditorCount: number | undefined,
    queueDepth = 0,
  ) {
    return {
      trigger,
      mode,
      payloadBytes: serializedState.length,
      queueDepth,
      pendingEditorCount: pendingEditorCount ?? null,
      revision: this.revision,
    }
  }

  private recordSaveDiagnostic(
    event: string,
    serializedState: string,
    mode: 'async' | 'sync' | 'skip',
    trigger: string,
    pendingEditorCount: number | undefined,
    queueDepth = 0,
  ) {
    recordDiagnosticEvent('storage', event, {
      details: this.getSaveDiagnosticsDetails(serializedState, mode, trigger, pendingEditorCount, queueDepth),
    })
  }

  private runAsyncSaveQueue(): void {
    if (this.asyncSaveActive) return
    this.asyncSaveActive = true
    const saveEpoch = this.syncSaveEpoch
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          while (this.pendingAsyncSerializedState !== null) {
            if (saveEpoch !== this.syncSaveEpoch) {
              this.pendingAsyncSerializedState = null
              return
            }
            const serializedState = this.pendingAsyncSerializedState
            this.pendingAsyncSerializedState = null
            const payload = {
              serializedState,
              baseRevision: this.revision,
            }
            const result = await measureSlowAsyncOperation('electron async app-state save', () =>
              window.electronAPI!.saveAppStateAsync!(payload),
            )
            if (saveEpoch !== this.syncSaveEpoch) return
            this.applySaveResult(result)
          }
        } finally {
          this.asyncSaveActive = false
          if (this.pendingAsyncSerializedState !== null) this.runAsyncSaveQueue()
        }
      })
  }

  save(serializedState: string, options: AppStateSaveOptions = {}): void {
    if (this.savesBlockedByLoadFailure) return
    const trigger = options.trigger ?? 'unknown'
    if (serializedState === this.lastSavedSerializedState && this.pendingAsyncSerializedState === null) {
      return
    }
    const payload = {
      serializedState,
      baseRevision: this.revision,
    }

    if (!options.preferSync && typeof window.electronAPI?.saveAppStateAsync === 'function') {
      this.pendingAsyncSerializedState = serializedState
      this.recordSaveDiagnostic(
        'app-state-save-queued',
        serializedState,
        'async',
        trigger,
        options.pendingEditorCount,
        this.asyncSaveActive ? 1 : 0,
      )
      this.runAsyncSaveQueue()
      return
    }

    try {
      this.syncSaveEpoch += 1
      this.pendingAsyncSerializedState = null
      this.recordSaveDiagnostic('app-state-save-start', serializedState, 'sync', trigger, options.pendingEditorCount)
      const result = measureSlowOperation('electron sync app-state save', () => window.electronAPI?.saveAppState(payload))
      this.applySaveResult(result)
    } catch {
      // Keep current behavior non-fatal until a dedicated error surface is added.
    }
  }

  flush(): Promise<void> {
    return this.saveQueue
  }

  subscribe(onUpdatedState: (serializedState: string) => void): () => void {
    this.subscribers.add(onUpdatedState)
    const unsubscribeFromIpc =
      window.electronAPI?.onAppStateUpdated?.((payload) => {
        if (!payload || typeof payload.serializedState !== 'string' || !Number.isInteger(payload.revision)) return
        this.savesBlockedByLoadFailure = false
        this.revision = payload.revision
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('tabs:external-app-state-updated'))
        }
        this.notifySubscribers(payload.serializedState)
      }) ?? (() => undefined)

    return () => {
      this.subscribers.delete(onUpdatedState)
      unsubscribeFromIpc()
    }
  }

  private notifySubscribers(serializedState: string): void {
    this.subscribers.forEach((subscriber) => subscriber(serializedState))
  }
}

export function createAppStateStore(): AppStateStore {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return new ElectronAppStateStore()
  }
  if (typeof window !== 'undefined' && isNativeCapacitorRuntime()) {
    return new CapacitorHybridAppStateStore(APP_STATE_STORAGE_KEY)
  }
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    return new BrowserIndexedDbHybridAppStateStore(APP_STATE_STORAGE_KEY)
  }
  return new BrowserLocalStorageAppStateStore(APP_STATE_STORAGE_KEY)
}

export const appStateStore: AppStateStore = createAppStateStore()
