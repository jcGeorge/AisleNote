import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { measureSlowOperation } from '../performance/performance-logging'
import { applyAutoPurgeToAppState, parseSavedState } from '../state/app-state'
import type { AppState } from '../types/app'
import { appPersistenceService } from './app-persistence-service'
import { createPersistenceDebounceController } from './persistence-debounce'
import type { AppStateSaveOptions } from './persistence-debounce'

type PersistentAppStateController = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  stateRef: MutableRefObject<AppState>
  storageHydrated: boolean
  flushPendingPersistence: (options?: AppStateSaveOptions) => Promise<void>
}

export function usePersistentAppState(): PersistentAppStateController {
  const initialSerializedState = useMemo(() => appPersistenceService.loadSerializedState(), [])
  const initialParsedState = useMemo(() => applyAutoPurgeToAppState(parseSavedState(initialSerializedState)), [initialSerializedState])
  const [state, setState] = useState<AppState>(() => initialParsedState)
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appPersistenceService.hydrateSerializedState !== 'function')
  const stateRef = useRef(state)
  const initialStateRef = useRef<AppState>(initialParsedState)
  const stateDirtySinceBootRef = useRef(false)
  const externallyAppliedStateRef = useRef<AppState | null>(null)
  const persistenceControllerRef = useRef(
    createPersistenceDebounceController<AppState>({
      serialize: (value) => measureSlowOperation('app-state serialization', () => JSON.stringify(value)),
      save: (serializedState, options) => appPersistenceService.saveSerializedState(serializedState, options),
    }),
  )

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (typeof appPersistenceService.hydrateSerializedState !== 'function') return

    let disposed = false
    Promise.resolve(
      appPersistenceService.hydrateSerializedState((serializedState) => {
        if (disposed || stateDirtySinceBootRef.current) return
        const nextState = applyAutoPurgeToAppState(parseSavedState(serializedState))
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
  }, [])

  useEffect(() => {
    if (typeof appPersistenceService.subscribeSerializedState !== 'function') return

    let disposed = false
    const unsubscribe = appPersistenceService.subscribeSerializedState((serializedState) => {
      if (disposed) return
      const nextState = applyAutoPurgeToAppState(parseSavedState(serializedState))
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
  }, [])

  useEffect(() => {
    const sanitizedState = applyAutoPurgeToAppState(state)
    if (sanitizedState !== state) {
      stateRef.current = sanitizedState
      setState(sanitizedState)
      return
    }

    stateRef.current = sanitizedState
    if (externallyAppliedStateRef.current === sanitizedState) {
      externallyAppliedStateRef.current = null
      stateDirtySinceBootRef.current = false
      return
    }
    stateDirtySinceBootRef.current = sanitizedState !== initialStateRef.current
    if (!storageHydrated || !stateDirtySinceBootRef.current) return
    persistenceControllerRef.current.schedule(sanitizedState)
  }, [state, storageHydrated])

  const flushPendingPersistence = async (options: AppStateSaveOptions = { snapshotMode: 'force', preferSync: true }) => {
    persistenceControllerRef.current.flush(options)
    await appPersistenceService.flushPendingSaves?.()
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
    const runAutoPurgeSweep = () => {
      setState((previous) => applyAutoPurgeToAppState(previous))
    }

    const intervalId = window.setInterval(runAutoPurgeSweep, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoPurgeSweep()
      }
    }

    window.addEventListener('focus', runAutoPurgeSweep)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', runAutoPurgeSweep)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return {
    state,
    setState,
    stateRef,
    storageHydrated,
    flushPendingPersistence,
  }
}
