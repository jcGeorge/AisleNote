import { BrowserHybridStateAdapter } from './browser-hybrid-state'

export const LEGACY_APP_STATE_STORAGE_KEY = 'data/notes/index.json'
export const APP_STATE_STORAGE_KEY = 'tabs:app-state-cache:v1'

export interface AppStateStore {
  load(): string | null
  save(serializedState: string): void
  hydrate?(onHydratedState: (serializedState: string) => void): Promise<void> | void
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
  private savesBlockedByLoadFailure = false

  load(): string | null {
    try {
      this.legacyRendererStore.clear()
      const loadResult = window.electronAPI?.loadAppStateResult?.()
      if (loadResult) {
        this.savesBlockedByLoadFailure = !loadResult.ok
        return loadResult.ok ? loadResult.serializedState : null
      }

      this.savesBlockedByLoadFailure = false
      return window.electronAPI?.loadAppState() ?? null
    } catch {
      this.savesBlockedByLoadFailure = true
      return null
    }
  }

  save(serializedState: string): void {
    if (this.savesBlockedByLoadFailure) return
    try {
      window.electronAPI?.saveAppState(serializedState)
    } catch {
      // Keep current behavior non-fatal until a dedicated error surface is added.
    }
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
