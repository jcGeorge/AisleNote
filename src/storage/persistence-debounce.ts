export type AppStateSaveOptions = {
  preferSync?: boolean
  trigger?: string
  pendingEditorCount?: number
  rendererSerializeDurationMs?: number
  rendererSerializedBytes?: number
}

export type AppStateCommitOptions = AppStateSaveOptions & {
  flushQueue?: boolean
}

export type AppStateScheduleOptions = {
  debounceMs?: number
  maxWaitMs?: number
  saveOptions?: AppStateSaveOptions
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
export const APP_STATE_EDITOR_CONTENT_PERSISTENCE_DEBOUNCE_MS = 10_000
export const APP_STATE_EDITOR_CONTENT_PERSISTENCE_MAX_WAIT_MS = 30_000

export function createPersistenceDebounceController<T>({
  debounceMs = APP_STATE_PERSISTENCE_DEBOUNCE_MS,
  maxWaitMs = APP_STATE_PERSISTENCE_MAX_WAIT_MS,
  serialize = JSON.stringify,
  save,
  setTimeoutFn = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeoutFn = (timeoutId) => clearTimeout(timeoutId),
}: PersistenceDebounceOptions<T>) {
  let pendingValue: T | null = null
  let pendingSaveOptions: AppStateSaveOptions = {}
  let quietTimer: TimeoutId | null = null
  let maxWaitTimer: TimeoutId | null = null
  let activeMaxWaitMs: number | null = null

  const clearQuietTimer = () => {
    if (quietTimer === null) return
    clearTimeoutFn(quietTimer)
    quietTimer = null
  }

  const clearMaxWaitTimer = () => {
    if (maxWaitTimer === null) return
    clearTimeoutFn(maxWaitTimer)
    maxWaitTimer = null
    activeMaxWaitMs = null
  }

  const savePending = (options: AppStateSaveOptions, clearPending: boolean) => {
    if (pendingValue === null) return
    save(serialize(pendingValue), options)
    if (!clearPending) return
    pendingValue = null
    pendingSaveOptions = {}
    clearQuietTimer()
    clearMaxWaitTimer()
  }

  const flush = (options: AppStateSaveOptions = { preferSync: true }) => {
    savePending(options, true)
  }

  const schedule = (value: T, options: AppStateScheduleOptions = {}) => {
    const scheduleDebounceMs = options.debounceMs ?? debounceMs
    const scheduleMaxWaitMs = options.maxWaitMs ?? maxWaitMs
    pendingValue = value
    pendingSaveOptions = options.saveOptions ?? {}
    clearQuietTimer()
    quietTimer = setTimeoutFn(() => {
      savePending(pendingSaveOptions, true)
    }, scheduleDebounceMs)

    if (maxWaitTimer === null || activeMaxWaitMs !== scheduleMaxWaitMs) {
      clearMaxWaitTimer()
      activeMaxWaitMs = scheduleMaxWaitMs
      maxWaitTimer = setTimeoutFn(() => {
        maxWaitTimer = null
        activeMaxWaitMs = null
        savePending(pendingSaveOptions, false)
      }, scheduleMaxWaitMs)
    }
  }

  const cancel = () => {
    pendingValue = null
    pendingSaveOptions = {}
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
