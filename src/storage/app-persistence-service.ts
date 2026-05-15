import { appStateStore } from './app-state-store'
import type { AppStateStore } from './app-state-store'

export interface AppPersistenceService {
  loadSerializedState(): string | null
  saveSerializedState(serializedState: string): void
  hydrateSerializedState?(onHydratedState: (serializedState: string) => void): Promise<void> | void
}

export function createAppPersistenceService(store: AppStateStore): AppPersistenceService {
  const service: AppPersistenceService = {
    loadSerializedState: () => store.load(),
    saveSerializedState: (serializedState) => store.save(serializedState),
  }

  if (typeof store.hydrate === 'function') {
    service.hydrateSerializedState = (onHydratedState) => store.hydrate?.(onHydratedState)
  }

  return service
}

export const appPersistenceService: AppPersistenceService = createAppPersistenceService(appStateStore)
