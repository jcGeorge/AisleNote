import { BrowserHybridStateAdapter } from './browser-hybrid-state'

export const LEGACY_APP_STATE_STORAGE_KEY = 'data/notes/index.json'
export const APP_STATE_STORAGE_KEY = 'tabs:app-state-cache:v1'

export interface AppStateStore {
  load(): string | null
  save(serializedState: string): void
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
  private readonly legacyCacheStore = new BrowserLocalStorageAppStateStore(LEGACY_APP_STATE_STORAGE_KEY)
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
    this.legacyCacheStore.clear()

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

class ElectronAppStateStore implements AppStateStore {
  private readonly legacyRendererStore = new BrowserLocalStorageAppStateStore(LEGACY_APP_STATE_STORAGE_KEY)
  private readonly subscribers = new Set<(serializedState: string) => void>()
  private savesBlockedByLoadFailure = false
  private revision = 0

  constructor() {
    window.__tabsGetAppStateRevision = () => this.revision
  }

  load(): string | null {
    try {
      this.legacyRendererStore.clear()
      const loadResult = window.electronAPI?.loadAppStateResult?.()
      if (loadResult) {
        this.savesBlockedByLoadFailure = !loadResult.ok
        this.revision = loadResult.revision
        return loadResult.ok ? loadResult.serializedState : null
      }

      this.savesBlockedByLoadFailure = false
      this.revision = 0
      return window.electronAPI?.loadAppState() ?? null
    } catch {
      this.savesBlockedByLoadFailure = true
      return null
    }
  }

  save(serializedState: string): void {
    if (this.savesBlockedByLoadFailure) return
    try {
      const result = window.electronAPI?.saveAppState({
        serializedState,
        baseRevision: this.revision,
      })
      if (result?.ok) {
        this.revision = result.revision
        return
      }
      if (result && !result.ok && typeof result.currentRevision === 'number') {
        this.revision = result.currentRevision
      }
      if (typeof result?.serializedState === 'string') {
        this.notifySubscribers(result.serializedState)
      }
    } catch {
      // Keep current behavior non-fatal until a dedicated error surface is added.
    }
  }

  subscribe(onUpdatedState: (serializedState: string) => void): () => void {
    this.subscribers.add(onUpdatedState)
    const unsubscribeFromIpc =
      window.electronAPI?.onAppStateUpdated?.((payload) => {
        if (!payload || typeof payload.serializedState !== 'string' || !Number.isInteger(payload.revision)) return
        this.revision = payload.revision
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
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    return new BrowserIndexedDbHybridAppStateStore(APP_STATE_STORAGE_KEY)
  }
  return new BrowserLocalStorageAppStateStore(APP_STATE_STORAGE_KEY)
}

export const appStateStore: AppStateStore = createAppStateStore()
