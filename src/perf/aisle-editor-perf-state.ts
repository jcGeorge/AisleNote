export type AisleEditorPerfState = {
  editorChangeCount: number
  lastEditorChangeAt: number | null
  lastEditorChangeHotPathDurationMs: number | null
  maxEditorChangeHotPathDurationMs: number | null
  skippedActiveEditorActivationCount: number
  ranActiveEditorActivationCount: number
  skippedImageToolsMissingCheckCount: number
  ranImageToolsMissingCheckCount: number
  activeAisleId: string
  activeAisleBodyId: string
  pendingMapSize: number
  pendingAisleBodyIds: string[]
  contentCommitTimerArmed: boolean
  lastPendingUpdateAt: number | null

  flushCount: number
  lastFlushStartedAt: number | null
  lastFlushEndedAt: number | null
  lastFlushDurationMs: number | null
  snapshotsApplied: number
  snapshotsByAisleBodyId: Record<string, number>
  lastApplyEditorContentSnapshotsDurationMs: number | null
  lastApplyMarkdownToAppStateDurationMs: number | null

  noteFilterIndexBuildCount: number
  lastNoteFilterIndexBuildDurationMs: number | null
  tagAutocompleteFilterIndexBuildCount: number
  lastTagAutocompleteFilterIndexBuildDurationMs: number | null

  listSearchableNoteLocationsCallCount: number
  lastListSearchableNoteLocationsDurationMs: number | null
  lastListSearchableNoteLocationsResultCount: number

  mountedEditorCount: number
  mountedEditorCountByAisleBodyId: Record<string, number>
  visibleAisleIds: string[]
  recentAisleIds: string[]
}

type AisleEditorPerfWindow = {
  __tabsAisleEditorPerfState?: AisleEditorPerfState
  __tabsResetEditorPerfState?: () => AisleEditorPerfState | null
  __tabsLogEditorPerfState?: () => AisleEditorPerfState | null
}

const createAisleEditorPerfState = (): AisleEditorPerfState => ({
  editorChangeCount: 0,
  lastEditorChangeAt: null,
  lastEditorChangeHotPathDurationMs: null,
  maxEditorChangeHotPathDurationMs: null,
  skippedActiveEditorActivationCount: 0,
  ranActiveEditorActivationCount: 0,
  skippedImageToolsMissingCheckCount: 0,
  ranImageToolsMissingCheckCount: 0,
  activeAisleId: '',
  activeAisleBodyId: '',
  pendingMapSize: 0,
  pendingAisleBodyIds: [],
  contentCommitTimerArmed: false,
  lastPendingUpdateAt: null,

  flushCount: 0,
  lastFlushStartedAt: null,
  lastFlushEndedAt: null,
  lastFlushDurationMs: null,
  snapshotsApplied: 0,
  snapshotsByAisleBodyId: {},
  lastApplyEditorContentSnapshotsDurationMs: null,
  lastApplyMarkdownToAppStateDurationMs: null,

  noteFilterIndexBuildCount: 0,
  lastNoteFilterIndexBuildDurationMs: null,
  tagAutocompleteFilterIndexBuildCount: 0,
  lastTagAutocompleteFilterIndexBuildDurationMs: null,

  listSearchableNoteLocationsCallCount: 0,
  lastListSearchableNoteLocationsDurationMs: null,
  lastListSearchableNoteLocationsResultCount: 0,

  mountedEditorCount: 0,
  mountedEditorCountByAisleBodyId: {},
  visibleAisleIds: [],
  recentAisleIds: [],
})

export const getAisleEditorPerfNow = () => {
  if (!import.meta.env?.DEV) return 0
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

const getPerfWindow = (): AisleEditorPerfWindow | null => {
  if (typeof window === 'undefined') return null
  return window as unknown as AisleEditorPerfWindow
}

const getAisleEditorPerfState = (createIfMissing = false): AisleEditorPerfState | null => {
  if (!import.meta.env?.DEV) return null
  const container = getPerfWindow()
  if (!container) return null
  if (!container.__tabsAisleEditorPerfState && createIfMissing) {
    container.__tabsAisleEditorPerfState = createAisleEditorPerfState()
  }
  return container.__tabsAisleEditorPerfState ?? null
}

export const withAisleEditorPerfState = (updater: (state: AisleEditorPerfState) => void) => {
  const state = getAisleEditorPerfState(true)
  if (!state) return
  updater(state)
}

export const runAisleEditorPerfTiming = <T,>(
  updater: (state: AisleEditorPerfState, durationMs: number) => void,
  callback: () => T,
): T => {
  if (!import.meta.env?.DEV) return callback()
  const started = getAisleEditorPerfNow()
  const nextValue = callback()
  const ended = getAisleEditorPerfNow()
  withAisleEditorPerfState((state) => updater(state, ended - started))
  return nextValue
}

export const resetAisleEditorPerfState = (): AisleEditorPerfState | null => {
  if (!import.meta.env?.DEV) return null
  const container = getPerfWindow()
  if (!container) return null
  container.__tabsAisleEditorPerfState = createAisleEditorPerfState()
  return container.__tabsAisleEditorPerfState
}

export const installAisleEditorPerfStateWindowHelpers = () => {
  if (!import.meta.env?.DEV) return
  const container = getPerfWindow()
  if (!container) return
  if (!container.__tabsAisleEditorPerfState) {
    container.__tabsAisleEditorPerfState = createAisleEditorPerfState()
  }
  if (!container.__tabsResetEditorPerfState) {
    container.__tabsResetEditorPerfState = () => resetAisleEditorPerfState()
  }
  if (!container.__tabsLogEditorPerfState) {
    container.__tabsLogEditorPerfState = () => {
      const state = getAisleEditorPerfState(false)
      if (!state) return null
      const snapshot = {
        ...state,
        snapshotsByAisleBodyId: { ...state.snapshotsByAisleBodyId },
        mountedEditorCountByAisleBodyId: { ...state.mountedEditorCountByAisleBodyId },
        pendingAisleBodyIds: [...state.pendingAisleBodyIds],
        visibleAisleIds: [...state.visibleAisleIds],
        recentAisleIds: [...state.recentAisleIds],
      }
      console.info(snapshot)
      return snapshot
    }
  }
}
