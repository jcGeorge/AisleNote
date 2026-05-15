import { appStateStore } from './app-state-store'
import type { AppStateStore } from './app-state-store'

export interface AppPersistenceService {
  loadSerializedState(): string | null
  saveSerializedState(serializedState: string): void
  hydrateSerializedState?(onHydratedState: (serializedState: string) => void): Promise<void> | void
  subscribeSerializedState?(onUpdatedState: (serializedState: string) => void): () => void
}

export function createAppPersistenceService(store: AppStateStore): AppPersistenceService {
  const service: AppPersistenceService = {
    loadSerializedState: () => store.load(),
    saveSerializedState: (serializedState) => store.save(serializedState),
  }

  if (typeof store.hydrate === 'function') {
    service.hydrateSerializedState = (onHydratedState) => store.hydrate?.(onHydratedState)
  }

  if (typeof store.subscribe === 'function') {
    service.subscribeSerializedState = (onUpdatedState) => store.subscribe?.(onUpdatedState) ?? (() => undefined)
  }

  return service
}

export const appPersistenceService: AppPersistenceService = createAppPersistenceService(appStateStore)
