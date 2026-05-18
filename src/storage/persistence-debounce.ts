export type AppStateSnapshotMode = 'force' | 'debounced' | 'skip'

export type AppStateSaveOptions = {
  snapshotMode?: AppStateSnapshotMode
  preferSync?: boolean
}

type TimeoutId = ReturnType<typeof setTimeout>

type PersistenceDebounceOptions<T> = {
  debounceMs?: number
  maxWaitMs?: number
  serialize?: (value: T) => string
  save: (serializedState: string, options?: AppStateSaveOptions) => void
  setTimeoutFn?: (callback: () => void, delayMs: number) => TimeoutId
  clearTimeoutFn?: (timeoutId: TimeoutId) => void
}

export const APP_STATE_PERSISTENCE_DEBOUNCE_MS = 1500
export const APP_STATE_PERSISTENCE_MAX_WAIT_MS = 5000

export function createPersistenceDebounceController<T>({
  debounceMs = APP_STATE_PERSISTENCE_DEBOUNCE_MS,
  maxWaitMs = APP_STATE_PERSISTENCE_MAX_WAIT_MS,
  serialize = JSON.stringify,
  save,
  setTimeoutFn = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeoutFn = (timeoutId) => clearTimeout(timeoutId),
}: PersistenceDebounceOptions<T>) {
  let pendingValue: T | null = null
  let quietTimer: TimeoutId | null = null
  let maxWaitTimer: TimeoutId | null = null

  const clearQuietTimer = () => {
    if (quietTimer === null) return
    clearTimeoutFn(quietTimer)
    quietTimer = null
  }

  const clearMaxWaitTimer = () => {
    if (maxWaitTimer === null) return
    clearTimeoutFn(maxWaitTimer)
    maxWaitTimer = null
  }

  const savePending = (options: AppStateSaveOptions, clearPending: boolean) => {
    if (pendingValue === null) return
    save(serialize(pendingValue), options)
    if (!clearPending) return
    pendingValue = null
    clearQuietTimer()
    clearMaxWaitTimer()
  }

  const flush = (options: AppStateSaveOptions = { snapshotMode: 'force', preferSync: true }) => {
    savePending(options, true)
  }

  const schedule = (value: T) => {
    pendingValue = value
    clearQuietTimer()
    quietTimer = setTimeoutFn(() => {
      savePending({ snapshotMode: 'debounced' }, true)
    }, debounceMs)

    if (maxWaitTimer === null) {
      maxWaitTimer = setTimeoutFn(() => {
        maxWaitTimer = null
        savePending({ snapshotMode: 'skip' }, false)
      }, maxWaitMs)
    }
  }

  const cancel = () => {
    pendingValue = null
    clearQuietTimer()
    clearMaxWaitTimer()
  }

  const hasPending = () => pendingValue !== null

  return {
    schedule,
    flush,
    cancel,
    hasPending,
  }
}
