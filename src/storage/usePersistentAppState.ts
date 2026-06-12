import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { measureSlowOperation } from '../performance/performance-logging'
import {
  applyAutoPurgeToAppState,
  getAutoPurgeScheduleSignatureForAppState,
  getNextAutoPurgeTimeForAppState,
  parseSavedState,
} from '../state/app-state'
import type { AppState } from '../types/app'
import { appPersistenceService } from './app-persistence-service'
import {
  extractDeviceSettingsFromAppState,
  loadDeviceSettings,
  loadDeviceSettingsRecord,
  mergeLoadedSettings,
  saveDeviceSettings,
} from './device-settings-store'
import { createPersistenceDebounceController } from './persistence-debounce'
import {
  APP_STATE_EDITOR_CONTENT_PERSISTENCE_DEBOUNCE_MS,
  APP_STATE_EDITOR_CONTENT_PERSISTENCE_MAX_WAIT_MS,
  type AppStateCommitOptions,
  type AppStateSaveOptions,
} from './persistence-debounce'
import { getEditorContentStateMutationVersion } from './persistence-scheduling'

type PersistentAppStateController = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  stateRef: MutableRefObject<AppState>
  storageHydrated: boolean
  flushPendingPersistence: (options?: AppStateSaveOptions) => Promise<void>
  commitAppStateNow: (nextState: AppState, options?: AppStateCommitOptions) => Promise<AppState>
}

const MAX_AUTO_PURGE_TIMEOUT_MS = 2_147_483_647

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMetricMs(value: number): number {
  return Math.round(value * 10) / 10
}

function parsePersistedStateWithDeviceSettings(serializedState: string | null): AppState {
  return mergeLoadedSettings(parseSavedState(serializedState), loadDeviceSettingsRecord())
}

function saveDeviceSettingsForState(state: AppState): void {
  saveDeviceSettings(extractDeviceSettingsFromAppState(state, loadDeviceSettings()))
}

export function usePersistentAppState(): PersistentAppStateController {
  const initialSerializedState = useMemo(() => appPersistenceService.loadSerializedState(), [])
  const initialParsedState = useMemo(
    () => applyAutoPurgeToAppState(parsePersistedStateWithDeviceSettings(initialSerializedState)),
    [initialSerializedState],
  )
  const [state, setReactState] = useState<AppState>(() => initialParsedState)
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appPersistenceService.hydrateSerializedState !== 'function')
  const autoPurgeScheduleSignature = useMemo(() => getAutoPurgeScheduleSignatureForAppState(state), [state])
  const stateRef = useRef(state)
  const storageHydratedRef = useRef(storageHydrated)
  const initialStateRef = useRef<AppState>(initialParsedState)
  const stateDirtySinceBootRef = useRef(false)
  const externallyAppliedStateRef = useRef<AppState | null>(null)
  const lastEditorContentStateMutationVersionRef = useRef(getEditorContentStateMutationVersion())
  const lastSerializationMetricsRef = useRef<{ durationMs: number; payloadBytes: number } | null>(null)
  const serializeAppState = useCallback((value: AppState) => {
    const startedAt = nowMs()
    const serializedState = measureSlowOperation('app-state serialization', () => JSON.stringify(value))
    lastSerializationMetricsRef.current = {
      durationMs: roundMetricMs(nowMs() - startedAt),
      payloadBytes: serializedState.length,
    }
    return serializedState
  }, [])
  const persistenceControllerRef = useRef(
    createPersistenceDebounceController<AppState>({
      serialize: serializeAppState,
      save: (serializedState, options) => {
        const serializationMetrics = lastSerializationMetricsRef.current
        appPersistenceService.saveSerializedState(serializedState, {
          ...options,
          ...(serializationMetrics
            ? {
                rendererSerializeDurationMs: serializationMetrics.durationMs,
                rendererSerializedBytes: serializationMetrics.payloadBytes,
              }
            : { rendererSerializedBytes: serializedState.length }),
        })
      },
    }),
  )

  const setState = useCallback<Dispatch<SetStateAction<AppState>>>((action) => {
    const nextState = typeof action === 'function'
      ? (action as (previous: AppState) => AppState)(stateRef.current)
      : action
    stateRef.current = nextState
    setReactState(nextState)
  }, [])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    storageHydratedRef.current = storageHydrated
  }, [storageHydrated])

  useEffect(() => {
    if (typeof appPersistenceService.hydrateSerializedState !== 'function') return

    let disposed = false
    Promise.resolve(
      appPersistenceService.hydrateSerializedState((serializedState) => {
        if (disposed || stateDirtySinceBootRef.current) return
        const nextState = applyAutoPurgeToAppState(parsePersistedStateWithDeviceSettings(serializedState))
        initialStateRef.current = nextState
        if (nextState === stateRef.current) return
        externallyAppliedStateRef.current = nextState
        stateRef.current = nextState
        setState(nextState)
      }),
    ).finally(() => {
      if (!disposed) {
        setStorageHydrated(true)
      }
    })

    return () => {
      disposed = true
    }
  }, [setState])

  useEffect(() => {
    if (typeof appPersistenceService.subscribeSerializedState !== 'function') return

    let disposed = false
    const unsubscribe = appPersistenceService.subscribeSerializedState((serializedState) => {
      if (disposed) return
      const nextState = applyAutoPurgeToAppState(parsePersistedStateWithDeviceSettings(serializedState))
      initialStateRef.current = nextState
      stateDirtySinceBootRef.current = false
      if (nextState === stateRef.current) return
      externallyAppliedStateRef.current = nextState
      stateRef.current = nextState
      setState(nextState)
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [setState])

  useEffect(() => {
    const sanitizedState = applyAutoPurgeToAppState(state)
    if (sanitizedState !== state) {
      stateRef.current = sanitizedState
      setState(sanitizedState)
      return
    }

    stateRef.current = sanitizedState
    saveDeviceSettingsForState(sanitizedState)
    const editorContentStateMutationVersion = getEditorContentStateMutationVersion()
    const changedFromEditorContent =
      editorContentStateMutationVersion !== lastEditorContentStateMutationVersionRef.current
    lastEditorContentStateMutationVersionRef.current = editorContentStateMutationVersion
    if (externallyAppliedStateRef.current === sanitizedState) {
      externallyAppliedStateRef.current = null
      stateDirtySinceBootRef.current = false
      return
    }
    stateDirtySinceBootRef.current = sanitizedState !== initialStateRef.current
    if (!storageHydrated || !stateDirtySinceBootRef.current) return
    persistenceControllerRef.current.schedule(
      sanitizedState,
      changedFromEditorContent
        ? {
            debounceMs: APP_STATE_EDITOR_CONTENT_PERSISTENCE_DEBOUNCE_MS,
            maxWaitMs: APP_STATE_EDITOR_CONTENT_PERSISTENCE_MAX_WAIT_MS,
            saveOptions: {
              trigger: 'editor-content-idle',
            },
          }
        : {
            saveOptions: {
              trigger: 'app-state-idle',
            },
          },
    )
  }, [setState, state, storageHydrated])

  const flushPendingPersistence = async (options: AppStateSaveOptions = { preferSync: true }) => {
    persistenceControllerRef.current.flush(options)
    await appPersistenceService.flushPendingSaves?.()
  }

  const commitAppStateNow = async (
    nextState: AppState,
    options: AppStateCommitOptions = { preferSync: true, flushQueue: true },
  ) => {
    const sanitizedState = applyAutoPurgeToAppState(nextState)
    stateRef.current = sanitizedState
    setState(sanitizedState)
    saveDeviceSettingsForState(sanitizedState)

    if (!storageHydratedRef.current) {
      stateDirtySinceBootRef.current = true
      return sanitizedState
    }

    persistenceControllerRef.current.cancel()
    const serializedState = serializeAppState(sanitizedState)
    const serializationMetrics = lastSerializationMetricsRef.current
    appPersistenceService.saveSerializedState(serializedState, {
      ...options,
      ...(serializationMetrics
        ? {
            rendererSerializeDurationMs: serializationMetrics.durationMs,
            rendererSerializedBytes: serializationMetrics.payloadBytes,
          }
        : { rendererSerializedBytes: serializedState.length }),
    })
    if (options.flushQueue !== false) {
      await appPersistenceService.flushPendingSaves?.()
    }
    initialStateRef.current = sanitizedState
    externallyAppliedStateRef.current = sanitizedState
    stateDirtySinceBootRef.current = false
    return sanitizedState
  }

  useEffect(() => {
    const persistenceController = persistenceControllerRef.current
    const flushOnExit = () => {
      void flushPendingPersistence()
    }
    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
      persistenceController.cancel()
    }
  }, [])

  useEffect(() => {
    if (!storageHydrated) return

    let disposed = false
    let timeoutId: number | null = null

    const scheduleNextAutoPurge = () => {
      if (disposed) return
      const now = Date.now()
      const nextPurgeAt = getNextAutoPurgeTimeForAppState(stateRef.current, now)
      if (nextPurgeAt === null) return
      const delayMs = Math.min(Math.max(nextPurgeAt - now, 0), MAX_AUTO_PURGE_TIMEOUT_MS)

      timeoutId = window.setTimeout(() => {
        timeoutId = null
        const current = stateRef.current
        const purged = applyAutoPurgeToAppState(current)
        if (purged !== current) {
          stateRef.current = purged
          setState(purged)
          return
        }
        scheduleNextAutoPurge()
      }, delayMs)
    }

    scheduleNextAutoPurge()

    return () => {
      disposed = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [autoPurgeScheduleSignature, setState, storageHydrated])

  useEffect(() => {
    if (!storageHydrated) return

    const runAutoPurgeSweep = () => {
      setState((previous) => {
        const purged = applyAutoPurgeToAppState(previous)
        return purged === previous ? previous : purged
      })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoPurgeSweep()
      }
    }

    window.addEventListener('focus', runAutoPurgeSweep)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', runAutoPurgeSweep)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [setState, storageHydrated])

  return {
    state,
    setState,
    stateRef,
    storageHydrated,
    flushPendingPersistence,
    commitAppStateNow,
  }
}
