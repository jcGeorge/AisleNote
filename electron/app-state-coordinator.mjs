import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'

export const LOAD_FAILED_SAVE_ERROR = 'App state did not load; refusing to overwrite existing data.'

export function createAppStateCoordinator({
  userDataPath,
  load = loadAppStateResult,
  save = saveAppState,
}) {
  let loadResult = load(userDataPath)
  let serializedState = loadResult.ok ? loadResult.serializedState : null
  let revision = loadResult.ok && serializedState !== null ? 1 : 0

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
      save(userDataPath, payload.serializedState)
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

  return {
    getLoadResult,
    canWriteAppState: () => loadResult.ok,
    saveRevisionedState,
  }
}
