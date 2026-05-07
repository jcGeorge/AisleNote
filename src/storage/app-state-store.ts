import { BrowserHybridStateAdapter } from './browser-hybrid-state'

export const APP_STATE_STORAGE_KEY = 'data/notes/index.json'

export interface AppStateStore {
  load(): string | null
  save(serializedState: string): void
  hydrate?(onHydratedState: (serializedState: string) => void): Promise<void> | void
}

export interface StructuredStorageBackend {
  readTextFile(path: string): Promise<string | null>
  writeTextFile(path: string, contents: string): Promise<void>
  readBinaryFile(path: string): Promise<ArrayBuffer | null>
  writeBinaryFile(path: string, contents: ArrayBuffer): Promise<void>
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

class ElectronAppStateStore implements AppStateStore {
  private readonly fallbackStore = new BrowserLocalStorageAppStateStore(APP_STATE_STORAGE_KEY)

  load(): string | null {
    try {
      const fileState = window.electronAPI?.loadAppState() ?? null
      if (fileState !== null) return fileState

      const legacyState = this.fallbackStore.load()
      if (legacyState === null) return null

      try {
        const result = window.electronAPI?.saveAppState(legacyState)
        if (result?.ok) {
          this.fallbackStore.clear()
        }
      } catch {
        // Keep the legacy renderer state in place if migration fails.
      }

      return legacyState
    } catch {
      return this.fallbackStore.load()
    }
  }

  save(serializedState: string): void {
    try {
      window.electronAPI?.saveAppState(serializedState)
    } catch {
      // Keep current behavior non-fatal until a dedicated error surface is added.
    }
  }
}

function createAppStateStore(): AppStateStore {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return new ElectronAppStateStore()
  }
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    return new BrowserIndexedDbHybridAppStateStore(APP_STATE_STORAGE_KEY)
  }
  return new BrowserLocalStorageAppStateStore(APP_STATE_STORAGE_KEY)
}

export const appStateStore: AppStateStore = createAppStateStore()
