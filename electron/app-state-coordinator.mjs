import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'

export const LOAD_FAILED_SAVE_ERROR = 'App state did not load; refusing to overwrite existing data.'

function getSnapshotMode(payload) {
  return ['force', 'debounced', 'skip'].includes(payload?.snapshotMode) ? payload.snapshotMode : undefined
}

export function createAppStateCoordinator({
  userDataPath,
  profileRootPath = userDataPath,
  load = loadAppStateResult,
  save = saveAppState,
}) {
  let activeProfileRootPath = profileRootPath
  let loadResult = load(activeProfileRootPath)
  let serializedState = loadResult.ok ? loadResult.serializedState : null
  let revision = loadResult.ok && serializedState !== null ? 1 : 0
  let lastSavedCanonicalState = null

  const getLoadResult = () =>
    loadResult.ok
      ? {
          ...loadResult,
          serializedState,
          revision,
        }
      : {
          ...loadResult,
          revision,
        }

  const saveRevisionedState = (payload) => {
    if (!loadResult.ok) {
      return {
        ok: false,
        reason: 'load-failed',
        error: LOAD_FAILED_SAVE_ERROR,
        currentRevision: revision,
        serializedState,
      }
    }

    if (!payload || typeof payload !== 'object' || typeof payload.serializedState !== 'string') {
      return {
        ok: false,
        reason: 'invalid-payload',
        error: 'Invalid payload',
        currentRevision: revision,
        serializedState,
      }
    }

    if (!Number.isInteger(payload.baseRevision) || payload.baseRevision !== revision) {
      return {
        ok: false,
        reason: 'stale-revision',
        error: 'App state revision is stale.',
        currentRevision: revision,
        serializedState,
      }
    }

    try {
      save(activeProfileRootPath, payload.serializedState, {
        userDataPath,
        ...(getSnapshotMode(payload) ? { snapshotMode: getSnapshotMode(payload) } : {}),
      })
      if (save === saveAppState) {
        const persistedLoadResult = load(activeProfileRootPath)
        lastSavedCanonicalState =
          persistedLoadResult.ok && typeof persistedLoadResult.serializedState === 'string'
            ? persistedLoadResult.serializedState
            : null
      } else {
        lastSavedCanonicalState = null
      }
      serializedState = payload.serializedState
      revision += 1
      loadResult = {
        ok: true,
        serializedState,
        source: 'hybrid',
      }
      return {
        ok: true,
        serializedState,
        revision,
      }
    } catch (error) {
      return {
        ok: false,
        reason: 'save-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        currentRevision: revision,
        serializedState,
      }
    }
  }

  const reloadProfileRoot = (nextProfileRootPath = activeProfileRootPath, options = {}) => {
    activeProfileRootPath = nextProfileRootPath
    const nextLoadResult = load(activeProfileRootPath)
    if (!nextLoadResult.ok || (options.requireSerializedState && nextLoadResult.serializedState === null)) {
      loadResult = nextLoadResult.ok
        ? {
            ok: false,
            serializedState: null,
            source: nextLoadResult.source,
            error: 'Existing app state could not be loaded.',
          }
        : nextLoadResult
      return getLoadResult()
    }

    loadResult = nextLoadResult
    if (
      nextLoadResult.serializedState === serializedState ||
      (typeof nextLoadResult.serializedState === 'string' && nextLoadResult.serializedState === lastSavedCanonicalState)
    ) {
      serializedState = nextLoadResult.serializedState
      lastSavedCanonicalState = null
      return {
        ...getLoadResult(),
        unchanged: true,
      }
    }

    serializedState = nextLoadResult.serializedState
    revision = serializedState === null ? 0 : revision + 1
    return getLoadResult()
  }

  return {
    getLoadResult,
    getProfileRootPath: () => activeProfileRootPath,
    getSerializedState: () => serializedState,
    canWriteAppState: () => loadResult.ok,
    reloadProfileRoot,
    saveRevisionedState,
  }
}
