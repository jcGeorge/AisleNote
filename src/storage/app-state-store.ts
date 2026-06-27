import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { measureSlowAsyncOperation, measureSlowOperation } from '../performance/performance-logging'
import type { AppStateSaveOptions } from './persistence-debounce'

export const APP_STATE_STORAGE_KEY = 'aislenote:app-state-cache'
const SAVE_DIAGNOSTIC_THROTTLE_MS = 10_000
const SAVE_METRICS_SLOW_THRESHOLD_MS = 50

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMetricNumber(value: number): number {
  return Math.round(value * 10) / 10
}

export interface AppStateStore {
  load(): string | null
  save(serializedState: string, options?: AppStateSaveOptions): void
  flush?(): Promise<void> | void
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

class ElectronAppStateStore implements AppStateStore {
  private readonly subscribers = new Set<(serializedState: string) => void>()
  private savesBlockedByLoadFailure = false
  private revision = 0
  private saveQueue: Promise<void> = Promise.resolve()
  private syncSaveEpoch = 0
  private asyncSaveActive = false
  private pendingAsyncSerializedState: string | null = null
  private pendingAsyncSaveOptions: AppStateSaveOptions | null = null
  private lastSavedSerializedState: string | null = null
  private lastSaveDiagnosticAtByKey = new Map<string, number>()
  private lastSaveMetricsDiagnosticAtByKey = new Map<string, number>()

  constructor() {
    window.__aislenoteGetAppStateRevision = () => this.revision
    window.electronAPI?.onStorageProfileStatusUpdated?.((status) => {
      this.savesBlockedByLoadFailure = status.status !== 'ready'
      const nextRevision = status.revision
      if (typeof nextRevision === 'number' && Number.isInteger(nextRevision)) {
        this.revision = nextRevision
      }
    })
  }

  load(): string | null {
    try {
      const loadResult = window.electronAPI?.loadAppStateResult?.()
      if (loadResult) {
        this.savesBlockedByLoadFailure = !loadResult.ok
        this.revision = loadResult.revision
        this.lastSavedSerializedState = loadResult.ok ? loadResult.serializedState : null
        return loadResult.ok ? loadResult.serializedState : null
      }

      this.savesBlockedByLoadFailure = false
      this.revision = 0
      this.lastSavedSerializedState = window.electronAPI?.loadAppState() ?? null
      return this.lastSavedSerializedState
    } catch {
      this.savesBlockedByLoadFailure = true
      return null
    }
  }

  private applySaveResult(
    result: ReturnType<NonNullable<Window['electronAPI']>['saveAppState']> | undefined,
  ) {
    if (result?.ok) {
      this.revision = result.revision
      if (typeof result.serializedState === 'string') {
        this.lastSavedSerializedState = result.serializedState
      }
      return
    }
    if (result && !result.ok && typeof result.currentRevision === 'number') {
      this.revision = result.currentRevision
    }
    if (typeof result?.serializedState === 'string') {
      this.lastSavedSerializedState = result.serializedState
      this.notifySubscribers(result.serializedState)
    }
  }

  private getSaveDiagnosticsDetails(
    serializedState: string,
    mode: 'async' | 'sync' | 'skip',
    trigger: string,
    pendingEditorCount: number | undefined,
    queueDepth = 0,
    options: AppStateSaveOptions = {},
  ) {
    return {
      trigger,
      mode,
      payloadBytes: serializedState.length,
      rendererSerializeDurationMs: options.rendererSerializeDurationMs ?? null,
      rendererSerializedBytes: options.rendererSerializedBytes ?? serializedState.length,
      queueDepth,
      pendingEditorCount: pendingEditorCount ?? null,
      revision: this.revision,
    }
  }

  private recordSaveDiagnostic(
    event: string,
    serializedState: string,
    mode: 'async' | 'sync' | 'skip',
    trigger: string,
    pendingEditorCount: number | undefined,
    queueDepth = 0,
    options: AppStateSaveOptions = {},
  ) {
    if (!this.shouldRecordSaveDiagnostic(event, mode, trigger)) return
    recordDiagnosticEvent('storage', event, {
      details: this.getSaveDiagnosticsDetails(serializedState, mode, trigger, pendingEditorCount, queueDepth, options),
    })
  }

  private shouldRecordSaveDiagnostic(event: string, mode: 'async' | 'sync' | 'skip', trigger: string): boolean {
    if (event === 'app-state-save-start') return true
    const key = `${event}:${mode}:${trigger}`
    const currentTime = nowMs()
    const lastRecordedAt = this.lastSaveDiagnosticAtByKey.get(key)
    if (lastRecordedAt !== undefined && currentTime - lastRecordedAt < SAVE_DIAGNOSTIC_THROTTLE_MS) {
      return false
    }
    this.lastSaveDiagnosticAtByKey.set(key, currentTime)
    return true
  }

  private shouldRecordSaveMetricsDiagnostic(
    result: ReturnType<NonNullable<Window['electronAPI']>['saveAppState']>,
    mode: 'async' | 'sync',
    trigger: string,
    options: AppStateSaveOptions,
    ipcDurationMs: number | null,
  ): boolean {
    const slowestKnownDurationMs = Math.max(
      ipcDurationMs ?? 0,
      result?.ok ? result.saveMetrics?.totalDurationMs ?? 0 : 0,
      options.rendererSerializeDurationMs ?? 0,
    )
    if (slowestKnownDurationMs < SAVE_METRICS_SLOW_THRESHOLD_MS) return false
    const key = `${mode}:${trigger}`
    const currentTime = nowMs()
    const lastRecordedAt = this.lastSaveMetricsDiagnosticAtByKey.get(key)
    if (lastRecordedAt !== undefined && currentTime - lastRecordedAt < SAVE_DIAGNOSTIC_THROTTLE_MS) {
      return false
    }
    this.lastSaveMetricsDiagnosticAtByKey.set(key, currentTime)
    return true
  }

  private recordSaveMetricsDiagnostic(
    result: ReturnType<NonNullable<Window['electronAPI']>['saveAppState']> | undefined,
    serializedState: string,
    mode: 'async' | 'sync',
    trigger: string,
    pendingEditorCount: number | undefined,
    queueDepth = 0,
    options: AppStateSaveOptions = {},
    ipcDurationMs: number | null = null,
  ) {
    if (!result?.ok || !result.saveMetrics) return
    if (!this.shouldRecordSaveMetricsDiagnostic(result, mode, trigger, options, ipcDurationMs)) return
    recordDiagnosticEvent('storage', 'app-state-save-metrics', {
      details: {
        ...this.getSaveDiagnosticsDetails(serializedState, mode, trigger, pendingEditorCount, queueDepth, options),
        rendererSaveMetrics: {
          serializeDurationMs: options.rendererSerializeDurationMs ?? null,
          serializedBytes: options.rendererSerializedBytes ?? serializedState.length,
          ipcDurationMs,
        },
        saveMetrics: result.saveMetrics,
      },
    })
  }

  private recordSaveBlockedDiagnostic(trigger: string, serializedState: string, options: AppStateSaveOptions = {}) {
    this.recordSaveDiagnostic(
      'app-state-save-blocked-load-failure',
      serializedState,
      'skip',
      trigger,
      options.pendingEditorCount,
      0,
      options,
    )
  }

  private recordSaveFailureDiagnostic(
    result: ReturnType<NonNullable<Window['electronAPI']>['saveAppState']> | undefined,
    serializedState: string,
    mode: 'async' | 'sync',
    trigger: string,
    options: AppStateSaveOptions = {},
  ) {
    if (result?.ok) return
    recordDiagnosticEvent('storage', 'app-state-save-failed', {
      level: 'error',
      details: {
        ...this.getSaveDiagnosticsDetails(serializedState, mode, trigger, options.pendingEditorCount, 0, options),
        reason: result?.reason ?? 'unknown',
        error: result?.error ?? 'App state save failed.',
      },
    })
  }

  private runAsyncSaveQueue(): void {
    if (this.asyncSaveActive) return
    this.asyncSaveActive = true
    const saveEpoch = this.syncSaveEpoch
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          while (this.pendingAsyncSerializedState !== null) {
            if (saveEpoch !== this.syncSaveEpoch) {
              this.pendingAsyncSerializedState = null
              this.pendingAsyncSaveOptions = null
              return
            }
            const serializedState = this.pendingAsyncSerializedState
            const saveOptions = this.pendingAsyncSaveOptions ?? {}
            this.pendingAsyncSerializedState = null
            this.pendingAsyncSaveOptions = null
            if (serializedState === this.lastSavedSerializedState) {
              this.recordSaveDiagnostic(
                'app-state-save-skipped',
                serializedState,
                'skip',
                saveOptions.trigger ?? 'duplicate-async-payload',
                saveOptions.pendingEditorCount,
                0,
                saveOptions,
              )
              continue
            }
            const payload = {
              serializedState,
              baseRevision: this.revision,
            }
            const ipcStartedAt = nowMs()
            const result = await measureSlowAsyncOperation('electron async app-state save', () =>
              window.electronAPI!.saveAppStateAsync!(payload),
            )
            const ipcDurationMs = roundMetricNumber(nowMs() - ipcStartedAt)
            if (saveEpoch !== this.syncSaveEpoch) return
            this.recordSaveMetricsDiagnostic(
              result,
              serializedState,
              'async',
              saveOptions.trigger ?? 'unknown',
              saveOptions.pendingEditorCount,
              0,
              saveOptions,
              ipcDurationMs,
            )
            this.recordSaveFailureDiagnostic(result, serializedState, 'async', saveOptions.trigger ?? 'unknown', saveOptions)
            this.applySaveResult(result)
          }
        } finally {
          this.asyncSaveActive = false
          if (this.pendingAsyncSerializedState !== null) this.runAsyncSaveQueue()
        }
      })
  }

  save(serializedState: string, options: AppStateSaveOptions = {}): void {
    const trigger = options.trigger ?? 'unknown'
    if (this.savesBlockedByLoadFailure) {
      this.recordSaveBlockedDiagnostic(trigger, serializedState, options)
      return
    }
    if (serializedState === this.lastSavedSerializedState && this.pendingAsyncSerializedState === null) {
      this.recordSaveDiagnostic('app-state-save-skipped', serializedState, 'skip', trigger, options.pendingEditorCount, 0, options)
      return
    }
    if (!options.preferSync && serializedState === this.pendingAsyncSerializedState) {
      this.recordSaveDiagnostic('app-state-save-skipped', serializedState, 'skip', trigger, options.pendingEditorCount, 1, options)
      return
    }
    const payload = {
      serializedState,
      baseRevision: this.revision,
    }

    if (!options.preferSync && typeof window.electronAPI?.saveAppStateAsync === 'function') {
      this.pendingAsyncSerializedState = serializedState
      this.pendingAsyncSaveOptions = options
      this.recordSaveDiagnostic(
        'app-state-save-queued',
        serializedState,
        'async',
        trigger,
        options.pendingEditorCount,
        this.asyncSaveActive ? 1 : 0,
        options,
      )
      this.runAsyncSaveQueue()
      return
    }

    try {
      this.syncSaveEpoch += 1
      this.pendingAsyncSerializedState = null
      this.pendingAsyncSaveOptions = null
      this.recordSaveDiagnostic('app-state-save-start', serializedState, 'sync', trigger, options.pendingEditorCount, 0, options)
      const ipcStartedAt = nowMs()
      const result = measureSlowOperation('electron sync app-state save', () => window.electronAPI?.saveAppState(payload))
      const ipcDurationMs = roundMetricNumber(nowMs() - ipcStartedAt)
      this.recordSaveMetricsDiagnostic(result, serializedState, 'sync', trigger, options.pendingEditorCount, 0, options, ipcDurationMs)
      this.recordSaveFailureDiagnostic(result, serializedState, 'sync', trigger, options)
      this.applySaveResult(result)
    } catch (error) {
      recordDiagnosticEvent('storage', 'app-state-save-threw', {
        level: 'error',
        details: {
          ...this.getSaveDiagnosticsDetails(serializedState, 'sync', trigger, options.pendingEditorCount, 0, options),
          error: error instanceof Error ? error.message : 'Electron app-state save threw.',
        },
      })
    }
  }

  flush(): Promise<void> {
    return this.saveQueue
  }

  subscribe(onUpdatedState: (serializedState: string) => void): () => void {
    this.subscribers.add(onUpdatedState)
    const unsubscribeFromIpc =
      window.electronAPI?.onAppStateUpdated?.((payload) => {
        if (!payload || typeof payload.serializedState !== 'string' || !Number.isInteger(payload.revision)) return
        this.savesBlockedByLoadFailure = false
        this.revision = payload.revision
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('aislenote:external-app-state-updated'))
        }
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
  return new BrowserLocalStorageAppStateStore(APP_STATE_STORAGE_KEY)
}

export const appStateStore: AppStateStore = createAppStateStore()
