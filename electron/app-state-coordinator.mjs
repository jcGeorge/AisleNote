import { createHash } from 'node:crypto'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'

export const LOAD_FAILED_SAVE_ERROR = 'App state did not load; refusing to overwrite existing data.'
export const RECENT_APP_SAVE_ECHO_TTL_MS = 120_000
const MAX_RECENT_APP_SAVE_FINGERPRINTS = 20
const MAX_RECENT_APP_SAVE_STORAGE_FINGERPRINTS = 20

function normalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeJsonValue(value[key])]),
  )
}

function getFingerprintSource(serializedState) {
  try {
    return JSON.stringify(normalizeJsonValue(JSON.parse(serializedState)))
  } catch {
    return serializedState
  }
}

export function createSerializedStateFingerprint(serializedState) {
  if (typeof serializedState !== 'string') return null
  return createHash('sha256').update(getFingerprintSource(serializedState)).digest('hex')
}

export function createAppStateCoordinator({
  userDataPath,
  profileRootPath = userDataPath,
  load = loadAppStateResult,
  save = saveAppState,
  now = () => Date.now(),
  recentAppSaveEchoTtlMs = RECENT_APP_SAVE_ECHO_TTL_MS,
}) {
  let activeProfileRootPath = profileRootPath
  let loadResult = load(activeProfileRootPath)
  let serializedState = loadResult.ok ? loadResult.serializedState : null
  let revision = loadResult.ok && serializedState !== null ? 1 : 0
  let recentAppSaveFingerprints = []
  let recentAppSaveStorageFingerprints = []

  const pruneRecentAppSaveFingerprints = (timestamp = now()) => {
    recentAppSaveFingerprints = recentAppSaveFingerprints.filter((entry) => entry.expiresAt > timestamp)
    recentAppSaveStorageFingerprints = recentAppSaveStorageFingerprints.filter((entry) => entry.expiresAt > timestamp)
  }

  const rememberRecentAppSave = (nextSerializedState) => {
    const fingerprint = createSerializedStateFingerprint(nextSerializedState)
    if (!fingerprint) return
    const timestamp = now()
    pruneRecentAppSaveFingerprints(timestamp)
    recentAppSaveFingerprints = recentAppSaveFingerprints.filter((entry) => entry.fingerprint !== fingerprint)
    recentAppSaveFingerprints.push({
      fingerprint,
      expiresAt: timestamp + recentAppSaveEchoTtlMs,
    })
    if (recentAppSaveFingerprints.length > MAX_RECENT_APP_SAVE_FINGERPRINTS) {
      recentAppSaveFingerprints = recentAppSaveFingerprints.slice(-MAX_RECENT_APP_SAVE_FINGERPRINTS)
    }
  }

  const isRecentAppSaveEcho = (nextSerializedState) => {
    const fingerprint = createSerializedStateFingerprint(nextSerializedState)
    if (!fingerprint) return false
    pruneRecentAppSaveFingerprints()
    return recentAppSaveFingerprints.some((entry) => entry.fingerprint === fingerprint)
  }

  const getStorageFingerprintValue = (storageSnapshot) => {
    if (typeof storageSnapshot === 'string') return storageSnapshot
    if (storageSnapshot && typeof storageSnapshot === 'object' && typeof storageSnapshot.fingerprint === 'string') {
      return storageSnapshot.fingerprint
    }
    return null
  }

  const rememberRecentAppSaveStorageFingerprint = (storageSnapshot) => {
    const storageFingerprint = getStorageFingerprintValue(storageSnapshot)
    if (typeof storageFingerprint !== 'string' || storageFingerprint.length === 0) return
    const timestamp = now()
    pruneRecentAppSaveFingerprints(timestamp)
    recentAppSaveStorageFingerprints = recentAppSaveStorageFingerprints.filter(
      (entry) => entry.fingerprint !== storageFingerprint,
    )
    recentAppSaveStorageFingerprints.push({
      fingerprint: storageFingerprint,
      expiresAt: timestamp + recentAppSaveEchoTtlMs,
    })
    if (recentAppSaveStorageFingerprints.length > MAX_RECENT_APP_SAVE_STORAGE_FINGERPRINTS) {
      recentAppSaveStorageFingerprints = recentAppSaveStorageFingerprints.slice(
        -MAX_RECENT_APP_SAVE_STORAGE_FINGERPRINTS,
      )
    }
  }

  const isRecentAppSaveStorageEcho = (storageSnapshot) => {
    const storageFingerprint = getStorageFingerprintValue(storageSnapshot)
    if (typeof storageFingerprint !== 'string' || storageFingerprint.length === 0) return false
    pruneRecentAppSaveFingerprints()
    return recentAppSaveStorageFingerprints.some((entry) => entry.fingerprint === storageFingerprint)
  }

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
      const saveResult = save(activeProfileRootPath, payload.serializedState, {
        userDataPath,
      })
      rememberRecentAppSave(payload.serializedState)
      rememberRecentAppSaveStorageFingerprint(
        saveResult?.storageFingerprint
          ? { fingerprint: saveResult.storageFingerprint, files: saveResult.storageFiles }
          : null,
      )
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
        ...(saveResult?.saveMetrics ? { saveMetrics: saveResult.saveMetrics } : {}),
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
    const previousProfileRootPath = activeProfileRootPath
    const isSameProfileRoot = nextProfileRootPath === previousProfileRootPath
    const nextLoadResult = load(nextProfileRootPath)
    if (!nextLoadResult.ok || (options.requireSerializedState && nextLoadResult.serializedState === null)) {
      activeProfileRootPath = nextProfileRootPath
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

    const nextSerializedState = nextLoadResult.serializedState
    const nextFingerprint = createSerializedStateFingerprint(nextSerializedState)
    const currentFingerprint = createSerializedStateFingerprint(serializedState)
    const isSemanticallyUnchanged =
      nextSerializedState === serializedState ||
      (nextFingerprint !== null && currentFingerprint !== null && nextFingerprint === currentFingerprint)

    if (
      isSameProfileRoot &&
      options.detectAppSaveEcho !== false &&
      !isSemanticallyUnchanged &&
      isRecentAppSaveEcho(nextSerializedState)
    ) {
      return {
        ...getLoadResult(),
        unchanged: true,
        externalEchoIgnored: true,
      }
    }

    activeProfileRootPath = nextProfileRootPath
    loadResult = nextLoadResult
    if (isSemanticallyUnchanged) {
      serializedState = nextSerializedState
      return {
        ...getLoadResult(),
        unchanged: true,
      }
    }

    serializedState = nextSerializedState
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
    isRecentAppSaveStorageEcho,
  }
}
