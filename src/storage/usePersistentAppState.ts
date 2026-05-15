import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { applyAutoPurgeToAppState, parseSavedState } from '../state/app-state'
import type { AppState } from '../types/app'
import { appPersistenceService } from './app-persistence-service'

type PersistentAppStateController = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  stateRef: MutableRefObject<AppState>
  storageHydrated: boolean
}

export function usePersistentAppState(): PersistentAppStateController {
  const initialSerializedState = useMemo(() => appPersistenceService.loadSerializedState(), [])
  const [state, setState] = useState<AppState>(() => applyAutoPurgeToAppState(parseSavedState(initialSerializedState)))
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appPersistenceService.hydrateSerializedState !== 'function')
  const stateRef = useRef(state)
  const initialStateJsonRef = useRef<string>(JSON.stringify(parseSavedState(initialSerializedState)))
  const stateDirtySinceBootRef = useRef(false)

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
        const nextSerializedState = JSON.stringify(nextState)
        initialStateJsonRef.current = nextSerializedState
        if (nextSerializedState === JSON.stringify(stateRef.current)) return
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
    const sanitizedState = applyAutoPurgeToAppState(state)
    if (sanitizedState !== state) {
      stateRef.current = sanitizedState
      setState(sanitizedState)
      return
    }

    stateRef.current = sanitizedState
    const serializedState = JSON.stringify(sanitizedState)
    stateDirtySinceBootRef.current = serializedState !== initialStateJsonRef.current
    if (!storageHydrated) return
    appPersistenceService.saveSerializedState(serializedState)
  }, [state, storageHydrated])

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
  }
}
