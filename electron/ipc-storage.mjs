import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'
import {
  getHybridStorageRoot,
  loadAppStateResult,
  measureSlowMainOperation,
  resolveNoteLocationRevealPath,
  resolveNotebookItemLocationRevealPath,
  saveAppState,
  writeAssetToProfile,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import {
  getStorageProfileNotebookName,
  validateNotebookName,
} from './storage-profile.mjs'
import {
  createNotebookRecord,
  createNotebookRecordFromExistingFolder,
  createProfileFromNotebookLibrary,
  getActiveNotebookRecord,
  initializeNotebookLibrary,
  removeNotebookRecord,
  setActiveNotebookId,
  upsertNotebookRecord,
} from './notebook-library.mjs'
import { computeStorageContentSnapshot, createStorageProfileWatcher } from './storage-watcher.mjs'
import {
  createUserSettingsLocation,
  createUserSettingsLocationStatus,
  initializeUserSettingsLocationFromState,
  readUserSettingsFromLocation,
  recreateMissingUserSettingsLocationFile,
  refreshLocalUserSettingsFromLocation,
  resetUserSettingsLocationConfig,
  resetUserSettingsLocationToDefaults,
  resolveUserSettingsLocation,
  validateUserSettingsFolderCandidate,
  writeUserSettingsLocationConfig,
  writeUserSettingsLocationFromState,
} from './user-settings-location.mjs'
import { normalizeImageAssetPath, parseImageAssetUrl } from '../src/markdown/image-asset-refs.js'
import { createDefaultAppState } from '../src/state/default-app-state.js'

const STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE = 'storage-notebook-recovered'

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMetricNumber(value) {
  return Math.round(Number(value ?? 0) * 10) / 10
}

function attachMainProcessSaveMetrics(result, metrics) {
  if (!result?.ok || !result.saveMetrics) return result
  return {
    ...result,
    saveMetrics: {
      ...result.saveMetrics,
      mainProcess: metrics,
    },
  }
}

function createKnownNotebookStatus(userDataPath, activeProfileRootPath, notebookPath) {
  const normalizedNotebookPath = path.resolve(notebookPath)
  const exists = existsSync(normalizedNotebookPath)
  const hasManifest = existsSync(path.join(getHybridStorageRoot(normalizedNotebookPath), 'manifest.json'))
  return {
    notebookPath: normalizedNotebookPath,
    notebookName: getStorageProfileNotebookName(normalizedNotebookPath),
    isActive: path.resolve(activeProfileRootPath) === normalizedNotebookPath,
    exists,
    hasManifest,
    available: exists && hasManifest,
  }
}

function createKnownNotebookStatuses(profile) {
  if (Array.isArray(profile.notebooks)) {
    return profile.notebooks.map((notebook) => {
      const notebookPath = path.resolve(notebook.notebookPath)
      const exists = existsSync(notebookPath)
      const hasManifest = existsSync(path.join(getHybridStorageRoot(notebookPath), 'manifest.json'))
      return {
        notebookId: notebook.id,
        notebookPath,
        notebookName: getStorageProfileNotebookName(notebookPath),
        isActive: profile.notebookId === notebook.id,
        exists,
        hasManifest,
        available: exists && hasManifest,
      }
    })
  }
  const paths = Array.isArray(profile.knownNotebookPaths) ? profile.knownNotebookPaths : [profile.profileRootPath]
  return paths.map((notebookPath) => createKnownNotebookStatus(profile.userDataPath, profile.profileRootPath, notebookPath))
}

function createStorageStatus({ profile, coordinator, event = 'ready', error = null, recovery = null }) {
  const loadResult = coordinator.getLoadResult()
  if (profile.setupRequired) {
    return {
      status: 'setup-required',
      health: 'warning',
      issues: loadResult.issues ?? [{
        code: 'notebook-setup-required',
        severity: 'warning',
        message: 'Create a notebook or open an existing notebook to start saving.',
      }],
      event,
      profileRootPath: '',
      activeNotebookId: null,
      notebookPath: '',
      notebookName: '',
      hasProfile: false,
      canWrite: false,
      source: 'empty',
      schemaVersion: null,
      conflicts: [],
      revision: loadResult.revision ?? 0,
      error: error ?? 'Create a notebook or open an existing notebook to start saving.',
      knownNotebooks: createKnownNotebookStatuses(profile),
      ...(recovery ? { recovery } : {}),
    }
  }
  const hasProfile = !profile.setupRequired && existsSync(getHybridStorageRoot(profile.profileRootPath))
  const notebookPath = profile.notebookPath || getHybridStorageRoot(profile.profileRootPath)
  const health = loadResult.health ?? (loadResult.ok ? 'healthy' : 'error')
  return {
    status: loadResult.ok ? 'ready' : 'error',
    health,
    issues: loadResult.issues ?? [],
    event,
    profileRootPath: profile.profileRootPath,
    activeNotebookId: profile.notebookId ?? null,
    notebookPath,
    notebookName: profile.notebookName || getStorageProfileNotebookName(profile.profileRootPath),
    hasProfile,
    canWrite: coordinator.canWriteAppState(),
    source: loadResult.source,
    schemaVersion: loadResult.schemaVersion,
    conflicts: loadResult.conflicts,
    revision: loadResult.revision,
    error: error ?? (loadResult.ok ? undefined : loadResult.error),
    knownNotebooks: createKnownNotebookStatuses(profile),
    ...(recovery ? { recovery } : {}),
  }
}

function getAllWindows(BrowserWindow) {
  return BrowserWindow && typeof BrowserWindow.getAllWindows === 'function'
    ? BrowserWindow.getAllWindows()
    : []
}

function normalizeImageExtension(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  return normalized || 'png'
}

function normalizeAssetExtension(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  if (normalized === 'quicktime') return 'mov'
  if (normalized === 'mpeg' || normalized === 'xmpeg') return 'mp3'
  return normalized || 'bin'
}

function getImageExtensionFromImportPayload(payload) {
  if (typeof payload?.extension === 'string' && payload.extension.trim()) {
    return normalizeImageExtension(payload.extension)
  }
  const typeMatch = typeof payload?.type === 'string' ? payload.type.match(/^image\/([a-zA-Z0-9+.-]+)$/) : null
  if (typeMatch) return normalizeImageExtension(typeMatch[1])
  const nameMatch = typeof payload?.name === 'string' ? payload.name.match(/\.([a-zA-Z0-9]+)$/) : null
  return normalizeImageExtension(nameMatch?.[1] ?? 'png')
}

function getAssetExtensionFromImportPayload(payload) {
  if (typeof payload?.extension === 'string' && payload.extension.trim()) {
    return normalizeAssetExtension(payload.extension)
  }
  const typeMatch = typeof payload?.type === 'string'
    ? payload.type.match(/^[a-zA-Z0-9+.-]+\/([a-zA-Z0-9+.-]+)$/)
    : null
  if (typeMatch) return normalizeAssetExtension(typeMatch[1])
  const nameMatch = typeof payload?.name === 'string' ? payload.name.match(/\.([a-zA-Z0-9]+)$/) : null
  return normalizeAssetExtension(nameMatch?.[1] ?? 'bin')
}

function resolveProfileAssetPath(profileRootPath, payload) {
  const assetPath = typeof payload?.url === 'string'
    ? parseImageAssetUrl(payload.url)
    : normalizeImageAssetPath(payload?.assetPath)
  if (!assetPath) return { ok: false, error: 'Invalid asset.' }
  const notebookRoot = getHybridStorageRoot(profileRootPath)
  const absoluteAssetPath = path.resolve(notebookRoot, assetPath)
  if (!absoluteAssetPath.startsWith(notebookRoot + path.sep)) {
    return { ok: false, error: 'Invalid asset path.' }
  }
  return { ok: true, assetPath, absoluteAssetPath }
}

export function resolvePreferredNotebookRevealPath({
  profileRootPath,
  payload,
  resolvePath,
}) {
  const roots = []
  const addRoot = (rootPath) => {
    if (typeof rootPath !== 'string' || !rootPath.trim()) return
    const resolvedRootPath = path.resolve(rootPath)
    if (!roots.includes(resolvedRootPath)) roots.push(resolvedRootPath)
  }

  addRoot(profileRootPath)

  let fallback = null
  for (const rootPath of roots) {
    const resolved = resolvePath(rootPath, payload)
    if (resolved.ok && existsSync(resolved.absolutePath)) return resolved
    if (!fallback) {
      fallback = resolved.ok
        ? { ok: false, error: 'Notebook item does not exist.' }
        : resolved
    }
  }

  return fallback ?? { ok: false, error: 'Notebook item could not be resolved.' }
}

export function reconcileNotebookLibraryForStartup(userDataPath, library) {
  return { library, reconciliation: null }
}

function createRecoveryIssueSummary(loadResult, failedNotebookPath = null) {
  if (typeof failedNotebookPath === 'string' && failedNotebookPath.length > 0 && !existsSync(failedNotebookPath)) {
    return ['Unable to locate folder.']
  }
  const issues = Array.isArray(loadResult?.issues) ? loadResult.issues : []
  return issues
    .filter((issue) => issue && typeof issue.message === 'string')
    .slice(0, 5)
    .map((issue) => [
      issue.path ? `${issue.path}: ` : '',
      issue.message,
    ].join(''))
}

function createMissingActiveNotebookResult(profileRootPath, loadResult = {}) {
  const folderExists = typeof profileRootPath === 'string' && existsSync(profileRootPath)
  return {
    ok: false,
    serializedState: null,
    source: loadResult.source ?? 'empty',
    error: 'Existing app state could not be loaded.',
    issues: [{
      code: folderExists ? 'missing-notebook-data' : 'missing-notebook-folder',
      severity: 'error',
      path: profileRootPath,
      message: folderExists ? 'Notebook data could not be found in this folder.' : 'Unable to locate folder.',
    }],
  }
}

function createBlankNotebookState(messages = []) {
  return createDefaultAppState({ messages })
}

function createRecoveryMessage(recovery) {
  const issueSummary = Array.isArray(recovery?.issueSummary) ? recovery.issueSummary : []
  const timestamp = new Date().toISOString()
  const details = [
    'AisleNote could not load this notebook folder, so it reset the notebook in that folder.',
    recovery.failedNotebookPath ? `Failed folder: ${recovery.failedNotebookPath}` : '',
    recovery.backupNotebookPath ? `Backup folder: ${recovery.backupNotebookPath}` : '',
    issueSummary.length > 0 ? `Issue summary: ${issueSummary.join(' ')}` : '',
  ].filter(Boolean)
  return {
    id: `storage-recovered-${timestamp}`,
    type: STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE,
    status: 'unread',
    createdAt: timestamp,
    signature: `storage-notebook-recovered:${timestamp}:${recovery.failedNotebookPath ?? 'notebook'}`,
    title: 'Recovered notebook',
    body: details.join('\n'),
    failedNotebookPath: recovery.failedNotebookPath,
    failedNotebookAvailable: recovery.failedNotebookAvailable,
    activeNotebookPath: recovery.activeNotebookPath,
    activeNotebookName: recovery.activeNotebookName,
    recoveryMode: recovery.mode,
    issueSummary,
  }
}

function appendRecoveryMessage(serializedState, recovery) {
  const parsed = JSON.parse(serializedState)
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.filter((message) => message && typeof message === 'object' && !Array.isArray(message))
    : []
  parsed.messages = [...messages, createRecoveryMessage(recovery)]
  return JSON.stringify(parsed)
}

function createBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function createUniqueBackupPath(sourcePath) {
  const parentPath = path.dirname(sourcePath)
  const baseName = path.basename(sourcePath)
  const timestamp = createBackupTimestamp()
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = path.join(parentPath, `${baseName}.unsupported-${timestamp}${suffix}`)
    if (!existsSync(candidate)) return candidate
  }
  return path.join(parentPath, `${baseName}.unsupported-${timestamp}-${Math.random().toString(36).slice(2, 8)}`)
}

function moveNotebookFolderToBackup(sourcePath) {
  if (!sourcePath || !existsSync(sourcePath)) return null
  const backupPath = createUniqueBackupPath(sourcePath)
  mkdirSync(path.dirname(backupPath), { recursive: true })
  renameSync(sourcePath, backupPath)
  return backupPath
}

function normalizeRecoveryRevealSelector(payload) {
  const candidate = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const messageId = typeof candidate.messageId === 'string' && candidate.messageId.trim()
    ? candidate.messageId.trim()
    : null
  const signature = typeof candidate.signature === 'string' && candidate.signature.trim()
    ? candidate.signature.trim()
    : null
  return {
    messageId,
    signature,
    hasSelector: messageId !== null || signature !== null,
  }
}

function getSerializedStateForRecoveryReveal(coordinator) {
  const currentSerializedState = coordinator.getSerializedState()
  if (typeof currentSerializedState === 'string') return currentSerializedState
  const loadResult = coordinator.getLoadResult()
  return loadResult.ok && typeof loadResult.serializedState === 'string' ? loadResult.serializedState : null
}

function getRecoveredNotebookPathFromSerializedState(serializedState, selector) {
  if (!selector.hasSelector || typeof serializedState !== 'string') return null
  try {
    const parsed = JSON.parse(serializedState)
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : []
    const message = messages.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      if (entry.type !== STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE) return false
      const idMatches = selector.messageId !== null && entry.id === selector.messageId
      const signatureMatches = selector.signature !== null && entry.signature === selector.signature
      return idMatches || signatureMatches
    })
    if (message?.failedNotebookAvailable === false) return null
    return typeof message?.failedNotebookPath === 'string' && message.failedNotebookPath.trim()
      ? message.failedNotebookPath
      : null
  } catch {
    return null
  }
}

export function registerStorageIpc({ ipcMain, app, BrowserWindow, dialog = null, shell = null }) {
  const userDataPath = app.getPath('userData')
  let notebookLibrary = initializeNotebookLibrary(userDataPath)
  const startupReconciliation = reconcileNotebookLibraryForStartup(userDataPath, notebookLibrary)
  notebookLibrary = startupReconciliation.library
  let profile = createProfileFromNotebookLibrary(userDataPath, notebookLibrary)
  let userSettingsLocation = resolveUserSettingsLocation(userDataPath)
  let userSettingsLocationRefresh = refreshLocalUserSettingsFromLocation(userDataPath, userSettingsLocation)
  if (userSettingsLocationRefresh.location) userSettingsLocation = userSettingsLocationRefresh.location
  let userSettingsLocationStatus = userSettingsLocationRefresh.status
  const refreshProfileFromLibrary = () => {
    profile = createProfileFromNotebookLibrary(userDataPath, notebookLibrary)
    return profile
  }
  const createSyncMetadata = (event) => ({
    version: 1,
    event,
    updatedAt: new Date().toISOString(),
  })
  const loadNotebookResult = (profileRootPath) => {
    if (profile?.setupRequired) {
      return {
        ok: false,
        serializedState: null,
        source: 'empty',
        health: 'error',
        error: 'Notebook setup is required before saves can start.',
        issues: [{
          code: 'notebook-setup-required',
          severity: 'error',
          message: 'Create a notebook or open an existing notebook to start saving.',
        }],
      }
    }
    const result = loadAppStateResult(profileRootPath, { userSettingsRoot: userDataPath })
    if (profile?.notebookId && result.ok && result.serializedState === null) {
      return {
        ok: false,
        serializedState: null,
        source: result.source,
        health: 'error',
        error: 'Notebook folder is missing.',
        issues: [{
          code: 'missing-notebook-folder',
          severity: 'error',
          path: profileRootPath,
          message: 'Notebook folder is missing.',
        }],
      }
    }
    return result
  }
  const adoptUserSettingsLocationResult = (result) => {
    if (result?.location) userSettingsLocation = result.location
    return result
  }
  const updateActiveNotebookRecord = (record, options = {}) => {
    notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, record, options)
    refreshProfileFromLibrary()
    return getActiveNotebookRecord(notebookLibrary)
  }
  const saveNotebookState = (profileRootPath, serializedState, options = {}) => {
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    const saveResult = saveAppState(profileRootPath, serializedState, {
      ...options,
      userDataPath,
      userSettingsRoot: userDataPath,
      notebookId: activeRecord?.id,
      syncMetadata: activeRecord ? createSyncMetadata('local-save') : undefined,
    })
    const syncResult = adoptUserSettingsLocationResult(
      writeUserSettingsLocationFromState(userDataPath, userSettingsLocation, serializedState),
    )
    if (syncResult.location || !userSettingsLocation.isDefault || !syncResult.ok) {
      updateUserSettingsLocationStatus(syncResult.status)
    }
    return saveResult
  }
  const coordinator = createAppStateCoordinator({
    userDataPath,
    profileRootPath: profile.profileRootPath,
    load: loadNotebookResult,
    save: saveNotebookState,
  })
  let watcher = null
  let latestRecovery = null
  let status = createStorageStatus({ profile, coordinator, recovery: latestRecovery })

  const broadcastAppStateUpdate = (payload, sourceWebContentsId) => {
    for (const window of getAllWindows(BrowserWindow)) {
      if (!window || window.isDestroyed?.()) continue
      if (window.webContents?.id === sourceWebContentsId) continue
      window.webContents?.send?.('app-state-updated', payload)
    }
  }

  const broadcastStorageStatus = () => {
    for (const window of getAllWindows(BrowserWindow)) {
      if (!window || window.isDestroyed?.()) continue
      window.webContents?.send?.('storage-profile-status-updated', status)
    }
  }

  const broadcastUserSettingsLocationStatus = () => {
    for (const window of getAllWindows(BrowserWindow)) {
      if (!window || window.isDestroyed?.()) continue
      window.webContents?.send?.('user-settings-location-status-updated', userSettingsLocationStatus)
    }
  }

  const updateStatus = (event = 'ready', error = null, options = {}) => {
    if (Object.prototype.hasOwnProperty.call(options, 'recovery')) {
      latestRecovery = options.recovery
    }
    status = createStorageStatus({ profile, coordinator, event, error, recovery: latestRecovery })
    broadcastStorageStatus()
    return status
  }

  const updateUserSettingsLocationStatus = (nextStatus) => {
    userSettingsLocationStatus = nextStatus
    broadcastUserSettingsLocationStatus()
    return userSettingsLocationStatus
  }

  const applyUserSettingsLocationResult = (result) => {
    adoptUserSettingsLocationResult(result)
    if (result?.status) updateUserSettingsLocationStatus(result.status)
    return result
  }

  const logExternalStorageEvent = (event) => {
    console.info?.(`[aislenote:storage] ${event}`)
  }

  const requireActiveNotebook = (actionDescription = 'perform this action') => {
    if (!profile.setupRequired && profile.profileRootPath) return null
    return {
      ok: false,
      error: `Create or open a notebook before you ${actionDescription}.`,
      status,
    }
  }

  const isInsidePath = (parentPath, candidatePath) => {
    const relative = path.relative(parentPath, candidatePath)
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  }

  const validateNotebookLocationPath = (locationPath) => {
    if (typeof locationPath !== 'string' || !locationPath.trim()) {
      return { ok: false, error: 'Notebook location is required.' }
    }
    const resolvedPath = path.resolve(locationPath)
    let stats
    try {
      stats = lstatSync(resolvedPath)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook location could not be opened.',
      }
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      return { ok: false, error: 'Notebook location must be a normal folder.' }
    }
    return { ok: true, locationPath: resolvedPath }
  }

  const buildNotebookTargetPath = (locationPath, name) => {
    const validation = validateNotebookName(name)
    if (!validation.ok) return validation
    const locationValidation = validateNotebookLocationPath(locationPath)
    if (!locationValidation.ok) return locationValidation
    const profileRootPath = path.join(locationValidation.locationPath, validation.name)
    const nesting = validateNotebookFolderNesting(profileRootPath)
    if (!nesting.ok) return nesting
    return {
      ok: true,
      name: validation.name,
      profileRootPath,
    }
  }

  const notebookDirectoryHasEntries = (profileRootPath) => {
    try {
      return existsSync(profileRootPath) && readdirSync(profileRootPath).length > 0
    } catch {
      return true
    }
  }

  const inspectProfileRootCandidate = (profileRootPath) => {
    const normalizedProfileRootPath = path.resolve(profileRootPath)
    return {
      profileRootPath: normalizedProfileRootPath,
      targetResult: loadAppStateResult(normalizedProfileRootPath, { userSettingsRoot: userDataPath }),
      targetHasProfile: existsSync(path.join(getHybridStorageRoot(normalizedProfileRootPath), 'manifest.json')),
      targetHasEntries: notebookDirectoryHasEntries(normalizedProfileRootPath),
    }
  }

  const validateNotebookFolderNesting = (notebookPath, options = {}) => {
    const targetPath = path.resolve(notebookPath)
    const ignoreNotebookId = typeof options.ignoreNotebookId === 'string' ? options.ignoreNotebookId : ''
    for (const record of notebookLibrary.notebooks) {
      if (ignoreNotebookId && record.id === ignoreNotebookId) continue
      const existingPath = path.resolve(record.notebookPath)
      if (targetPath === existingPath) continue
      if (isInsidePath(existingPath, targetPath) || isInsidePath(targetPath, existingPath)) {
        return {
          ok: false,
          error: 'Notebook folders cannot be nested. Links and settings are local to each notebook folder.',
        }
      }
    }
    return { ok: true }
  }

  const resolveMoveProfileRootCandidate = (selectedProfileRootPath) => {
    const selected = inspectProfileRootCandidate(selectedProfileRootPath)
    if (selected.targetHasProfile || !selected.targetHasEntries || selected.targetResult.ok) return selected
    return inspectProfileRootCandidate(
      path.join(selected.profileRootPath, profile.notebookName || getStorageProfileNotebookName(profile.profileRootPath)),
    )
  }

  const markActiveNotebookLoadFailure = (failedResult, trigger = 'startup-error') => {
    logExternalStorageEvent(trigger)
    updateStatus('profile-error', failedResult?.error ?? 'Notebook folder could not be loaded.')
    startWatcher()
    return false
  }

  const retryThenRecoverActiveNotebook = (failedResult, trigger = 'startup-error') => {
    const retryResult = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: coordinator.getSerializedState() !== null,
      detectAppSaveEcho: false,
    })
    if (retryResult.ok) {
      updateStatus('retry-loaded')
      if (typeof retryResult.serializedState === 'string' && !retryResult.unchanged) {
        broadcastAppStateUpdate({
          serializedState: retryResult.serializedState,
          revision: retryResult.revision,
        })
      }
      startWatcher()
      return true
    }
    return markActiveNotebookLoadFailure(retryResult ?? failedResult, trigger)
  }

  const getWatchedNotebookRoots = () => {
    if (profile.setupRequired) return []
    return [profile.profileRootPath]
  }

  const reloadNotebookFolder = (event = 'external-loaded') => {
    if (profile.setupRequired) {
      updateStatus('notebook-setup-required', 'Create a notebook or open an existing notebook to start saving.')
      return false
    }
    const previousSerializedState = coordinator.getSerializedState()
    const result = measureSlowMainOperation('notebook folder reload', () =>
      coordinator.reloadProfileRoot(profile.profileRootPath, {
        requireSerializedState: previousSerializedState !== null,
        detectAppSaveEcho: false,
      }),
    )
    if (result.ok && typeof result.serializedState === 'string') {
      updateStatus(event)
      if (!result.unchanged) {
        broadcastAppStateUpdate({
          serializedState: result.serializedState,
          revision: result.revision,
        })
      }
      watcher?.reset()
      return true
    }
    updateStatus('profile-error', result.error ?? 'Notebook folder could not be loaded.')
    watcher?.reset()
    return false
  }

  const reconcileActiveNotebookFromSyncTarget = () => {
    return false
  }

  const reconcileActiveNotebookAfterLocalWrite = (event = 'saved') => {
    updateStatus(event)
    return undefined
  }

  const startWatcher = () => {
    watcher?.close()
    if (profile.setupRequired) {
      watcher = null
      return
    }
    watcher = createStorageProfileWatcher({
      getProfileRootPath: () => profile.profileRootPath,
      getProfileRootPaths: getWatchedNotebookRoots,
      onExternalChange: () => {
        if (reconcileActiveNotebookFromSyncTarget()) return
        const storageSnapshot = measureSlowMainOperation('storage content fingerprint read', () =>
          computeStorageContentSnapshot(profile.profileRootPath),
        )
        if (coordinator.isRecentAppSaveStorageEcho(storageSnapshot)) {
          logExternalStorageEvent('external-echo-ignored')
          watcher?.reset()
          return
        }
        const previousSerializedState = coordinator.getSerializedState()
        const result = measureSlowMainOperation('external storage reload', () =>
          coordinator.reloadProfileRoot(profile.profileRootPath, {
            requireSerializedState: previousSerializedState !== null,
          }),
        )
        if (result.ok && typeof result.serializedState === 'string') {
          if (result.unchanged) {
            if (result.externalEchoIgnored) {
              logExternalStorageEvent('external-echo-ignored')
              updateStatus('external-echo-ignored')
            }
            watcher?.reset()
            return
          }
          logExternalStorageEvent('external-loaded')
          updateStatus('external-loaded')
          broadcastAppStateUpdate({
            serializedState: result.serializedState,
            revision: result.revision,
          })
          watcher?.reset()
          return
        }
        logExternalStorageEvent('external-error')
        retryThenRecoverActiveNotebook(result, 'external-error')
      },
    })
  }

  const saveRevisionedState = (payload, sourceWebContentsId) => {
    watcher?.markAppWrite()
    const result = coordinator.saveRevisionedState(payload)
    watcher?.markAppWrite()
    if (result.ok) {
      updateStatus('saved')
      broadcastAppStateUpdate(
        {
          serializedState: result.serializedState,
          revision: result.revision,
        },
        sourceWebContentsId,
      )
    }
    return result
  }

  const handleSaveAppState = (payload, sourceWebContentsId) => {
    const handlerStartedAt = nowMs()
    if (!coordinator.canWriteAppState()) {
      return {
        ok: false,
        reason: 'load-failed',
        error: LOAD_FAILED_SAVE_ERROR,
        currentRevision: coordinator.getLoadResult().revision,
        serializedState: coordinator.getLoadResult().serializedState,
      }
    }
    const saveStartedAt = nowMs()
    const result = saveRevisionedState(payload, sourceWebContentsId)
    const handlerEndedAt = nowMs()
    return attachMainProcessSaveMetrics(result, {
      receiveToSaveStartMs: roundMetricNumber(saveStartedAt - handlerStartedAt),
      handlerDurationMs: roundMetricNumber(handlerEndedAt - handlerStartedAt),
    })
  }

  const getRendererSerializedStateForProfileMove = async (event) => {
    const sender = event?.sender
    if (!sender || typeof sender.executeJavaScript !== 'function') return null
    try {
      const serializedState = await sender.executeJavaScript(
        `(() => {
          try {
            const value = window.__aislenoteGetLatestAppState?.()
            return typeof value === 'string' ? value : null
          } catch {
            return null
          }
        })()`,
        true,
      )
      return typeof serializedState === 'string' ? serializedState : null
    } catch {
      return null
    }
  }

  const getCurrentSerializedStateForProfileMove = async (event) => {
    const currentSerializedState = coordinator.getSerializedState()
    if (typeof currentSerializedState === 'string') return currentSerializedState
    const loadResult = coordinator.getLoadResult()
    if (loadResult.ok && typeof loadResult.serializedState === 'string') return loadResult.serializedState
    return getRendererSerializedStateForProfileMove(event)
  }

  const reloadActiveProfileForSettingsChange = (event = 'settings-sync-loaded') => {
    if (profile.setupRequired) {
      updateStatus('notebook-setup-required', 'Create a notebook or open an existing notebook to start saving.')
      return coordinator.getLoadResult()
    }
    const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: coordinator.getSerializedState() !== null,
      detectAppSaveEcho: false,
    })
    updateStatus(result.ok ? event : 'profile-error', result.ok ? null : result.error)
    if (result.ok && typeof result.serializedState === 'string' && !result.unchanged) {
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
      watcher?.reset()
    }
    return result
  }

  const updateUserSettingsLocationFailure = (event, error) =>
    updateUserSettingsLocationStatus(
      createUserSettingsLocationStatus(userDataPath, userSettingsLocation, {
        status: 'error',
        event,
        syncStatus: userSettingsLocation.isDefault ? 'local' : 'fallback',
        source: 'local-cache',
        canWrite: false,
        error,
      }),
    )

  const switchToNotebookRecord = (record, event = 'profile-changed', options = {}) => {
    const previousProfile = profile
    const previousLibrary = notebookLibrary
    notebookLibrary = setActiveNotebookId(userDataPath, notebookLibrary, record.id)
    refreshProfileFromLibrary()
    const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: options.requireSerializedState === true,
    })
    if (!result.ok) {
      notebookLibrary = previousLibrary
      profile = previousProfile
      coordinator.reloadProfileRoot(previousProfile.profileRootPath)
      updateStatus('profile-error', result.error)
      return { ok: false, status, error: result.error ?? 'Notebook folder could not be loaded.' }
    }
    updateStatus(result.ok ? event : 'profile-error', result.ok ? null : result.error)
    startWatcher()
    if (result.ok && typeof result.serializedState === 'string') {
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
    }
    return { ok: true, status }
  }

  const switchToProfileRoot = (profileRootPath, event = 'profile-changed', options = {}) => {
    const normalizedProfileRootPath = path.resolve(profileRootPath)
    const record = notebookLibrary.notebooks.find((candidate) =>
      path.resolve(candidate.notebookPath) === normalizedProfileRootPath
    )
    if (!record) return { ok: false, status, error: 'Notebook is not in the library.' }
    return switchToNotebookRecord(record, event, options)
  }

  const resolveNotebookRecordFromPayload = (payload = {}, options = {}) => {
    const requestedNotebookId = typeof payload?.notebookId === 'string' ? payload.notebookId.trim() : ''
    const requestedNotebookPath = typeof payload?.notebookPath === 'string' ? payload.notebookPath.trim() : ''
    const profileRootPath = requestedNotebookPath ? path.resolve(requestedNotebookPath) : ''
    const record = notebookLibrary.notebooks.find((candidate) =>
      candidate.id === requestedNotebookId ||
      (profileRootPath && path.resolve(candidate.notebookPath) === profileRootPath)
    ) ?? (options.defaultActive === true ? getActiveNotebookRecord(notebookLibrary) : null)
    if (!record) return { ok: false, error: 'Notebook is not in the notebook library.' }
    return { ok: true, record }
  }

  const getCurrentSerializedStateForRecord = (record) => {
    const currentSerializedState = coordinator.getSerializedState()
    if (record.id === profile.notebookId && typeof currentSerializedState === 'string') return currentSerializedState
    const loadResult = loadAppStateResult(record.notebookPath, { userSettingsRoot: userDataPath })
    return loadResult.ok && typeof loadResult.serializedState === 'string' ? loadResult.serializedState : null
  }

  const reloadAfterNotebookLibraryChange = (event = 'notebook-library-changed') => {
    refreshProfileFromLibrary()
    const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: !profile.setupRequired,
      detectAppSaveEcho: false,
    })
    updateStatus(result.ok ? event : 'profile-error', result.ok ? null : result.error)
    startWatcher()
    if (result.ok && typeof result.serializedState === 'string') {
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
    }
    return result
  }

  const renameNotebook = async (_event, payload = {}) => {
    const validation = validateNotebookName(payload?.name)
    if (!validation.ok) return { ok: false, error: validation.error, status }
    try {
      const activeRecord = getActiveNotebookRecord(notebookLibrary)
      if (!activeRecord) return { ok: false, error: 'No active notebook is available.', status }
      const currentPath = path.resolve(activeRecord.notebookPath)
      const nextPath = path.join(path.dirname(currentPath), validation.name)
      if (currentPath === nextPath) return { ok: true, status }
      if (existsSync(nextPath)) {
        return { ok: false, error: 'A folder with that notebook name already exists.', status }
      }
      const nesting = validateNotebookFolderNesting(nextPath, { ignoreNotebookId: activeRecord.id })
      if (!nesting.ok) return { ok: false, error: nesting.error, status }
      watcher?.close()
      renameSync(currentPath, nextPath)
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        notebookPath: nextPath,
      }, { activate: true })
      refreshProfileFromLibrary()
      const result = coordinator.reloadProfileRoot(nextPath, {
        requireSerializedState: true,
        detectAppSaveEcho: false,
      })
      updateStatus(result.ok ? 'notebook-renamed' : 'profile-error', result.ok ? null : result.error)
      startWatcher()
      if (result.ok && typeof result.serializedState === 'string') {
        broadcastAppStateUpdate({
          serializedState: result.serializedState,
          revision: result.revision,
        })
      }
      return { ok: result.ok, status, error: result.ok ? undefined : result.error }
    } catch (error) {
      updateStatus('notebook-rename-error', error instanceof Error ? error.message : 'Notebook folder could not be renamed.')
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be renamed.',
        status,
      }
    }
  }

  const maybeTrashSourceProfileRoot = async (sourceProfileRootPath) => {
    if (!existsSync(sourceProfileRootPath)) return null
    if (!shell || typeof shell.trashItem !== 'function') {
      return 'Old notebook folder was kept because moving it to Trash is unavailable.'
    }
    try {
      await shell.trashItem(sourceProfileRootPath)
      return null
    } catch (error) {
      return error instanceof Error && error.message
        ? `Old notebook folder was kept because it could not be moved to Trash: ${error.message}`
        : 'Old notebook folder was kept because it could not be moved to Trash.'
    }
  }

  const replaceProfileWithCurrentData = async (profileRootPath, event = null, options = {}) => {
    const normalizedProfileRootPath = path.resolve(profileRootPath)
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    const nesting = validateNotebookFolderNesting(normalizedProfileRootPath, {
      ignoreNotebookId: activeRecord?.id,
    })
    if (!nesting.ok) return { ok: false, error: nesting.error, status }
    const serializedState = await getCurrentSerializedStateForProfileMove(event)
    if (serializedState === null) {
      return { ok: false, error: 'Current app state is not ready to move.', status }
    }
    if (!activeRecord) {
      try {
        const record = createNotebookRecord(userDataPath, {
          notebookPath: normalizedProfileRootPath,
          serializedState,
        })
        notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, record, { activate: true })
        refreshProfileFromLibrary()
        return switchToNotebookRecord(record, 'notebook-created', { requireSerializedState: true })
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Notebook folder could not be written.',
          status,
        }
      }
    }
    const previousNotebookPath = activeRecord.notebookPath
    try {
      saveAppState(normalizedProfileRootPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        notebookId: activeRecord.id,
        replaceExisting: true,
        assetSourceRoot: getHybridStorageRoot(activeRecord.notebookPath),
        syncMetadata: createSyncMetadata('notebook-moved'),
      })
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        notebookPath: normalizedProfileRootPath,
      }, { activate: true })
      refreshProfileFromLibrary()
      const result = coordinator.reloadProfileRoot(normalizedProfileRootPath, {
        requireSerializedState: true,
        detectAppSaveEcho: false,
      })
      updateStatus(result.ok ? 'profile-moved' : 'profile-error', result.ok ? null : result.error)
      startWatcher()
      if (result.ok && typeof result.serializedState === 'string') {
        broadcastAppStateUpdate({
          serializedState: result.serializedState,
          revision: result.revision,
        })
      }
      if (!result.ok) return { ok: false, error: result.error ?? 'Notebook folder could not be loaded.', status }
      if (options.trashSource !== true || !previousNotebookPath || previousNotebookPath === normalizedProfileRootPath) {
        return { ok: true, status }
      }
      const warning = await maybeTrashSourceProfileRoot(previousNotebookPath)
      if (warning) return { ok: true, status, warning }
      return { ok: true, status: updateStatus('profile-moved') }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be written.',
        status,
      }
    }
  }

  const chooseProfileRoot = async (mode, event = null) => {
    if (profile.setupRequired) {
      return { ok: false, error: 'Create or open a notebook before moving its folder.', status }
    }
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: mode === 'move' ? 'Move notebook folder' : 'Choose notebook folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }

    const selectedProfileRootPath = path.resolve(selection.filePaths[0])
    const target = mode === 'move'
      ? resolveMoveProfileRootCandidate(selectedProfileRootPath)
      : inspectProfileRootCandidate(selectedProfileRootPath)
    const {
      profileRootPath,
      targetResult,
      targetHasProfile,
      targetHasEntries,
    } = target
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }

    if (!targetHasProfile && targetHasEntries && !targetResult.ok) {
      return {
        ok: false,
        error: 'Notebook folder must be empty or contain manifest.json.',
        status,
      }
    }

    if (mode === 'move') {
      let trashSource = false
      if (dialog?.showMessageBox) {
        const moveChoice = await dialog.showMessageBox({
          type: targetHasProfile ? 'warning' : 'question',
          buttons: targetHasProfile
            ? ['Replace and keep old copy', 'Replace and move old copy to Trash', 'Cancel']
            : ['Keep old copy', 'Move old copy to Trash', 'Cancel'],
          cancelId: 2,
          defaultId: 0,
          message: targetHasProfile ? 'This folder already contains AisleNote data.' : 'Move notebook folder?',
          detail: targetHasProfile
            ? 'Replacing it will write your current notebook into this folder. Current user settings stay in app support.'
            : 'AisleNote will write your current notebook into this folder. Current user settings stay in app support.',
        })
        if (moveChoice.response === 2) return { canceled: true, status }
        trashSource = moveChoice.response === 1
      }
      return replaceProfileWithCurrentData(profileRootPath, event, { trashSource })
    }

    if (targetResult.ok && typeof targetResult.serializedState === 'string') {
      const useExistingNotebookFolder = () => {
        const openResult = createNotebookRecordFromExistingFolder(userDataPath, profileRootPath)
        if (!openResult.ok) return { ok: false, error: openResult.error ?? 'Notebook folder could not be loaded.', status }
        notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, openResult.record, { activate: true })
        refreshProfileFromLibrary()
        return switchToNotebookRecord(openResult.record, 'profile-changed', { requireSerializedState: true })
      }
      if (!dialog?.showMessageBox) return useExistingNotebookFolder()
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Use this notebook folder', 'Replace with current data', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        message: 'This folder already contains AisleNote data.',
        detail: 'Use the existing notebook in this folder, or replace it with your current notebook. Current user settings stay in app support.',
      })
      if (choice.response === 0) return useExistingNotebookFolder()
      if (choice.response === 1) return replaceProfileWithCurrentData(profileRootPath, event)
      return { canceled: true, status }
    }

    if (targetHasProfile && !targetResult.ok) {
      return {
        ok: false,
        error: 'This folder contains AisleNote data that could not be loaded.',
        status,
      }
    }

    if (dialog?.showMessageBox) {
      const initialize = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Save current data here', 'Cancel'],
        cancelId: 1,
        defaultId: 0,
        message: 'Use this notebook folder?',
        detail: 'AisleNote will save your current notebook into this folder. Current user settings stay in app support.',
      })
      if (initialize.response !== 0) return { canceled: true, status }
    }
    return replaceProfileWithCurrentData(profileRootPath, event)
  }

  const openNotebook = async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Open notebook',
      properties: ['openDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }

    const profileRootPath = path.resolve(selection.filePaths[0])
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }
    const nesting = validateNotebookFolderNesting(profileRootPath)
    if (!nesting.ok) return { ok: false, error: nesting.error, status }
    if (!existsSync(path.join(getHybridStorageRoot(profileRootPath), 'manifest.json'))) {
      return {
        ok: false,
        error: 'This folder is not an AisleNote notebook. To use Markdown import, create a new notebook, then in settings > data > transfer, select "Import Markdown folders".',
        status,
      }
    }

    const openResult = createNotebookRecordFromExistingFolder(userDataPath, profileRootPath)
    if (!openResult.ok) {
      return {
        ok: false,
        error: openResult.error ?? 'Notebook folder could not be loaded.',
        status,
      }
    }
    notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, openResult.record, { activate: true })
    refreshProfileFromLibrary()
    return switchToNotebookRecord(openResult.record, 'notebook-opened', { requireSerializedState: true })
  }

  const switchNotebook = async (_event, payload = {}) => {
    const requestedNotebookId = typeof payload?.notebookId === 'string' ? payload.notebookId : ''
    const requestedNotebookPath = typeof payload?.notebookPath === 'string' ? payload.notebookPath : ''
    if (!requestedNotebookId && !requestedNotebookPath.trim()) {
      return { ok: false, error: 'Notebook is required.', status }
    }
    const profileRootPath = requestedNotebookPath ? path.resolve(requestedNotebookPath) : ''
    const record = notebookLibrary.notebooks.find((candidate) =>
      candidate.id === requestedNotebookId ||
      (profileRootPath && path.resolve(candidate.notebookPath) === profileRootPath)
    )
    if (!record) return { ok: false, error: 'Notebook is not in the notebook library.', status }
    if (record.id === profile.notebookId) return { ok: true, status }
    return switchToNotebookRecord(record, 'notebook-switched', { requireSerializedState: true })
  }

  const forgetNotebook = async (_event, payload = {}) => {
    const requestedNotebookId = typeof payload?.notebookId === 'string' ? payload.notebookId : ''
    const requestedNotebookPath = typeof payload?.notebookPath === 'string' ? payload.notebookPath : ''
    const profileRootPath = requestedNotebookPath ? path.resolve(requestedNotebookPath) : ''
    const record = notebookLibrary.notebooks.find((candidate) =>
      candidate.id === requestedNotebookId ||
      (profileRootPath && path.resolve(candidate.notebookPath) === profileRootPath)
    )
    if (!record) return { ok: false, error: 'Notebook is not in the notebook library.', status }
    if (record.id === notebookLibrary.activeNotebookId) {
      return { ok: false, error: 'The active notebook cannot be removed from the list.', status }
    }
    notebookLibrary = removeNotebookRecord(userDataPath, notebookLibrary, record.id)
    refreshProfileFromLibrary()
    updateStatus('notebook-forgotten')
    return { ok: true, status }
  }

  const chooseNotebookLocation = async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.' }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Choose notebook location',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true }
    const validation = validateNotebookLocationPath(selection.filePaths[0])
    if (!validation.ok) return { ok: false, error: validation.error }
    return { ok: true, locationPath: validation.locationPath }
  }

  const createNotebook = async (_event, payload = {}) => {
    const target = buildNotebookTargetPath(payload?.locationPath, payload?.name)
    if (!target.ok) return { ok: false, error: target.error, status }
    if (existsSync(target.profileRootPath)) {
      return {
        ok: false,
        error: 'This folder already exists. Choose a different notebook name.',
        status,
      }
    }

    try {
      const record = createNotebookRecord(userDataPath, {
        notebookPath: target.profileRootPath,
        serializedState: JSON.stringify(createBlankNotebookState()),
      })
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, record, { activate: true })
      refreshProfileFromLibrary()
      return switchToNotebookRecord(record, 'notebook-created', { requireSerializedState: true })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be created.',
        status,
      }
    }
  }

  const deleteNotebook = async (_event, payload = {}) => {
    const resolution = resolveNotebookRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const record = resolution.record
    if (!shell || typeof shell.trashItem !== 'function') {
      return { ok: false, error: 'Moving notebooks to Trash is unavailable.', status }
    }

    if (dialog?.showMessageBox && payload?.skipConfirmation !== true) {
      const buttons = ['Trash notebook', 'Cancel']
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons,
        cancelId: 1,
        defaultId: 0,
        message: 'Delete notebook?',
        detail: 'AisleNote will remove this notebook from the list and move its folder to Trash.',
      })
      if (choice.response === 1) return { canceled: true, status }
    }

    try {
      if (existsSync(record.notebookPath)) {
        await shell.trashItem(record.notebookPath)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be moved to Trash.',
        status,
      }
    }

    notebookLibrary = removeNotebookRecord(userDataPath, notebookLibrary, record.id)
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (activeRecord) {
      reloadAfterNotebookLibraryChange('notebook-deleted')
    } else {
      refreshProfileFromLibrary()
      coordinator.reloadProfileRoot(profile.profileRootPath, {
        requireSerializedState: false,
        detectAppSaveEcho: false,
      })
      updateStatus('notebook-setup-required', 'Create a notebook or open an existing notebook to start saving.')
      startWatcher()
    }
    return { ok: true, status }
  }

  const chooseUserSettingsFolder = async (event = null) => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status: userSettingsLocationStatus }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Choose settings folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) {
      return { canceled: true, status: userSettingsLocationStatus }
    }

    const settingsRootPath = path.resolve(selection.filePaths[0])
    const candidateLocation = createUserSettingsLocation(userDataPath, settingsRootPath)
    const validation = validateUserSettingsFolderCandidate(settingsRootPath, profile.profileRootPath)
    if (!validation.ok) {
      updateUserSettingsLocationFailure('settings-folder-rejected', validation.error)
      return { ok: false, error: validation.error, status: userSettingsLocationStatus }
    }

    const existingSettings = readUserSettingsFromLocation(candidateLocation)
    if (existingSettings.ok) {
      if (dialog?.showMessageBox) {
        const choice = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Apply settings', 'Cancel'],
          cancelId: 1,
          defaultId: 0,
          message: 'Apply settings from this folder?',
          detail:
            'AisleNote will use this folder for live user settings and overwrite the current local app settings cache with settings/app-settings.json from that folder.',
        })
        if (choice.response !== 0) return { canceled: true, status: userSettingsLocationStatus }
      }

      try {
        userSettingsLocation = writeUserSettingsLocationConfig(userDataPath, settingsRootPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Settings folder could not be saved.'
        updateUserSettingsLocationFailure('settings-folder-error', message)
        return { ok: false, error: message, status: userSettingsLocationStatus }
      }

      const refresh = applyUserSettingsLocationResult(
        refreshLocalUserSettingsFromLocation(userDataPath, userSettingsLocation),
      )
      if (!refresh.ok) return { ok: false, error: refresh.status.error, status: userSettingsLocationStatus }
      const reload = reloadActiveProfileForSettingsChange('settings-folder-loaded')
      return { ok: reload.ok, status: userSettingsLocationStatus, error: reload.ok ? undefined : reload.error }
    }

    if (!existingSettings.missing) {
      const error = "The folder selected doesn't contain an app-settings.json file that matches this project's structure."
      updateUserSettingsLocationFailure('settings-folder-invalid', error)
      return { ok: false, error, status: userSettingsLocationStatus }
    }

    const serializedState = await getCurrentSerializedStateForProfileMove(event)
    if (serializedState === null) {
      const error = 'Current app settings are not ready to copy.'
      updateUserSettingsLocationFailure('settings-folder-error', error)
      return { ok: false, error, status: userSettingsLocationStatus }
    }

    const initializeResult = initializeUserSettingsLocationFromState(userDataPath, candidateLocation, serializedState)
    if (!initializeResult.ok) {
      updateUserSettingsLocationStatus(initializeResult.status)
      return { ok: false, error: initializeResult.status.error, status: userSettingsLocationStatus }
    }

    try {
      userSettingsLocation = writeUserSettingsLocationConfig(userDataPath, settingsRootPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Settings folder could not be saved.'
      updateUserSettingsLocationFailure('settings-folder-error', message)
      return { ok: false, error: message, status: userSettingsLocationStatus }
    }

    updateUserSettingsLocationStatus(
      createUserSettingsLocationStatus(userDataPath, userSettingsLocation, {
        event: 'settings-folder-initialized',
        syncStatus: 'synced',
        source: 'settings-folder',
      }),
    )
    return { ok: true, status: userSettingsLocationStatus }
  }

  const retryUserSettingsSync = async (event = null) => {
    if (userSettingsLocation.isDefault) {
      updateUserSettingsLocationStatus(
        createUserSettingsLocationStatus(userDataPath, userSettingsLocation, {
          event: 'local-settings-ready',
          syncStatus: 'local',
          source: 'local-cache',
        }),
      )
      return { ok: true, status: userSettingsLocationStatus }
    }

    const cloudSettings = readUserSettingsFromLocation(userSettingsLocation)
    if (cloudSettings.ok) {
      const refresh = applyUserSettingsLocationResult(
        refreshLocalUserSettingsFromLocation(userDataPath, userSettingsLocation),
      )
      if (!refresh.ok) return { ok: false, error: refresh.status.error, status: userSettingsLocationStatus }
      const reload = reloadActiveProfileForSettingsChange('settings-sync-loaded')
      return { ok: reload.ok, status: userSettingsLocationStatus, error: reload.ok ? undefined : reload.error }
    }

    if (cloudSettings.missing) {
      const serializedState = await getCurrentSerializedStateForProfileMove(event)
      const recreateResult = recreateMissingUserSettingsLocationFile(
        userDataPath,
        userSettingsLocation,
        serializedState,
      )
      applyUserSettingsLocationResult(recreateResult)
      return {
        ok: recreateResult.ok,
        status: userSettingsLocationStatus,
        error: recreateResult.ok ? undefined : recreateResult.status.error,
      }
    }

    const error = "The folder selected doesn't contain an app-settings.json file that matches this project's structure."
    updateUserSettingsLocationFailure('settings-sync-invalid', error)
    return { ok: false, error, status: userSettingsLocationStatus }
  }

  const resetUserSettingsFolder = async () => {
    try {
      userSettingsLocation = resetUserSettingsLocationConfig(userDataPath)
      updateUserSettingsLocationStatus(
        createUserSettingsLocationStatus(userDataPath, userSettingsLocation, {
          event: 'settings-folder-reset',
          syncStatus: 'local',
          source: 'local-cache',
        }),
      )
      return { ok: true, status: userSettingsLocationStatus }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Settings folder could not be reset.'
      updateUserSettingsLocationFailure('settings-folder-reset-error', message)
      return { ok: false, error: message, status: userSettingsLocationStatus }
    }
  }

  const resetUserSettingsToDefaults = async () => {
    const resetResult = resetUserSettingsLocationToDefaults(userDataPath, userSettingsLocation)
    applyUserSettingsLocationResult(resetResult)
    if (!resetResult.ok) {
      return { ok: false, error: resetResult.status.error, status: userSettingsLocationStatus }
    }
    const reload = reloadActiveProfileForSettingsChange('settings-reset-defaults')
    return {
      ok: reload.ok,
      status: userSettingsLocationStatus,
      error: reload.ok ? undefined : reload.error,
    }
  }

  const initialLoadResult = coordinator.getLoadResult()
  if (profile.setupRequired) {
    updateStatus('notebook-setup-required', 'Create a notebook or open an existing notebook to start saving.')
    startWatcher()
  } else if (!initialLoadResult.ok) {
    markActiveNotebookLoadFailure(initialLoadResult, 'startup-error')
  } else {
    startWatcher()
  }

  ipcMain.on('load-app-state', (event) => {
    const result = coordinator.getLoadResult()
    event.returnValue = result.ok ? result.serializedState : null
  })

  ipcMain.on('load-app-state-result', (event) => {
    event.returnValue = coordinator.getLoadResult()
  })

  ipcMain.on('save-app-state', (event, payload) => {
    try {
      event.returnValue = handleSaveAppState(payload, event.sender?.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      event.returnValue = { ok: false, reason: 'save-failed', error: message }
    }
  })

  ipcMain.handle?.('save-app-state-async', async (event, payload) => {
    try {
      return handleSaveAppState(payload, event.sender?.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, reason: 'save-failed', error: message }
    }
  })

  ipcMain.handle?.('get-storage-profile-status', async () => status)
  ipcMain.handle?.('get-user-settings-location-status', async () => userSettingsLocationStatus)
  ipcMain.handle?.('choose-notebook-location', chooseNotebookLocation)
  ipcMain.handle?.('create-notebook', createNotebook)
  ipcMain.handle?.('rename-notebook', renameNotebook)
  ipcMain.handle?.('open-notebook', openNotebook)
  ipcMain.handle?.('switch-notebook', switchNotebook)
  ipcMain.handle?.('forget-notebook', forgetNotebook)
  ipcMain.handle?.('delete-notebook', deleteNotebook)
  ipcMain.handle?.('move-storage-profile', async (event) => chooseProfileRoot('move', event))
  ipcMain.handle?.('choose-user-settings-folder', chooseUserSettingsFolder)
  ipcMain.handle?.('reset-user-settings-folder', resetUserSettingsFolder)
  ipcMain.handle?.('reset-user-settings-to-defaults', resetUserSettingsToDefaults)
  ipcMain.handle?.('retry-user-settings-sync', retryUserSettingsSync)
  ipcMain.handle?.('reveal-user-settings-folder', async () => {
    if (!shell || typeof shell.openPath !== 'function') {
      return { ok: false, error: 'Reveal is unavailable.' }
    }
    const error = await shell.openPath(userSettingsLocation.settingsRootPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('reveal-storage-profile', async () => {
    const setupBlocked = requireActiveNotebook('reveal its folder')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.openPath !== 'function') {
      return { ok: false, error: 'Reveal is unavailable.' }
    }
    const error = await shell.openPath(profile.notebookPath || profile.profileRootPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('reveal-recovered-notebook-location', async (_event, payload = {}) => {
    if (!shell || typeof shell.openPath !== 'function') {
      return { ok: false, error: 'Reveal is unavailable.' }
    }
    const selector = normalizeRecoveryRevealSelector(payload)
    const failedNotebookPath = selector.hasSelector
      ? getRecoveredNotebookPathFromSerializedState(getSerializedStateForRecoveryReveal(coordinator), selector)
      : typeof latestRecovery?.backupNotebookPath === 'string'
        ? latestRecovery.backupNotebookPath
        : latestRecovery?.failedNotebookAvailable === false
        ? null
        : latestRecovery?.failedNotebookPath
    if (typeof failedNotebookPath !== 'string' || failedNotebookPath.length === 0) {
      return { ok: false, error: 'No recovered notebook folder is available.' }
    }
    if (!existsSync(failedNotebookPath)) {
      return { ok: false, error: 'Recovered notebook folder could not be found.' }
    }
    const error = await shell.openPath(failedNotebookPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('retry-storage-profile', async () => {
    const setupBlocked = requireActiveNotebook('reload it')
    if (setupBlocked) return setupBlocked
    const storageSnapshot = measureSlowMainOperation('storage content fingerprint read', () =>
      computeStorageContentSnapshot(profile.profileRootPath),
    )
    if (coordinator.isRecentAppSaveStorageEcho(storageSnapshot)) {
      updateStatus('retry-loaded')
      watcher?.reset()
      return { ok: true, status }
    }
    const result = measureSlowMainOperation('external storage reload', () =>
      coordinator.reloadProfileRoot(profile.profileRootPath, {
        requireSerializedState: coordinator.getSerializedState() !== null,
        detectAppSaveEcho: false,
      }),
    )
    updateStatus(result.ok ? 'retry-loaded' : 'retry-error', result.ok ? null : result.error)
    if (result.ok && typeof result.serializedState === 'string' && !result.unchanged) {
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
      watcher?.reset()
    }
    return { ok: result.ok, status, error: result.ok ? undefined : result.error }
  })
  ipcMain.handle?.('import-image-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('import assets')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    try {
      const rawBytes = payload?.bytes
      if (!(rawBytes instanceof ArrayBuffer) && !ArrayBuffer.isView(rawBytes)) {
        return { ok: false, error: 'Invalid image asset payload.' }
      }
      const bytes = rawBytes instanceof ArrayBuffer
        ? Buffer.from(rawBytes)
        : Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
      if (bytes.byteLength <= 0) return { ok: false, error: 'Image asset is empty.' }
      watcher?.markAppWrite()
      const result = writeImageAssetToProfile(profile.profileRootPath, bytes, getImageExtensionFromImportPayload(payload))
      watcher?.markAppWrite()
      reconcileActiveNotebookAfterLocalWrite('asset-imported')
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Image asset could not be imported.' }
    }
  })

  ipcMain.handle?.('import-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('import assets')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    try {
      const rawBytes = payload?.bytes
      if (!(rawBytes instanceof ArrayBuffer) && !ArrayBuffer.isView(rawBytes)) {
        return { ok: false, error: 'Invalid asset payload.' }
      }
      const bytes = rawBytes instanceof ArrayBuffer
        ? Buffer.from(rawBytes)
        : Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
      if (bytes.byteLength <= 0) return { ok: false, error: 'Asset is empty.' }
      watcher?.markAppWrite()
      const result = writeAssetToProfile(profile.profileRootPath, bytes, getAssetExtensionFromImportPayload(payload))
      watcher?.markAppWrite()
      reconcileActiveNotebookAfterLocalWrite('asset-imported')
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be imported.' }
    }
  })

  ipcMain.handle?.('open-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('open assets')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.openPath !== 'function') return { ok: false, error: 'Asset opening is unavailable.' }
    try {
      const resolved = resolveProfileAssetPath(profile.profileRootPath, payload)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      const error = await shell.openPath(resolved.absoluteAssetPath)
      return error ? { ok: false, error } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be opened.' }
    }
  })

  ipcMain.handle?.('reveal-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('reveal assets')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Asset reveal is unavailable.' }
    }
    try {
      const resolved = resolveProfileAssetPath(profile.profileRootPath, payload)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      if (!existsSync(resolved.absoluteAssetPath)) return { ok: false, error: 'Asset does not exist.' }
      shell.showItemInFolder(resolved.absoluteAssetPath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be revealed.' }
    }
  })

  ipcMain.handle?.('reveal-note-location', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('reveal note files')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Note reveal is unavailable.' }
    }
    try {
      const resolved = resolvePreferredNotebookRevealPath({
        profileRootPath: profile.profileRootPath,
        payload,
        resolvePath: resolveNoteLocationRevealPath,
      })
      if (!resolved.ok) return { ok: false, error: resolved.error }
      shell.showItemInFolder(resolved.absolutePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Note file could not be revealed.' }
    }
  })

  ipcMain.handle?.('reveal-notebook-item-location', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('reveal notebook items')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Notebook item reveal is unavailable.' }
    }
    try {
      const resolved = resolvePreferredNotebookRevealPath({
        profileRootPath: profile.profileRootPath,
        payload,
        resolvePath: resolveNotebookItemLocationRevealPath,
      })
      if (!resolved.ok) return { ok: false, error: resolved.error }
      shell.showItemInFolder(resolved.absolutePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Notebook item could not be revealed.' }
    }
  })

  ipcMain.handle?.('read-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveNotebook('read assets')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    try {
      const resolved = resolveProfileAssetPath(profile.profileRootPath, payload)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      if (!existsSync(resolved.absoluteAssetPath)) return { ok: false, error: 'Asset does not exist.' }
      const bytes = readFileSync(resolved.absoluteAssetPath)
      return {
        ok: true,
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be read.' }
    }
  })

  return {
    canWriteAppState: coordinator.canWriteAppState,
    getLoadResult: coordinator.getLoadResult,
    getProfileRootPath: () => profile.profileRootPath,
    getStorageProfileStatus: () => status,
    getUserSettingsLocationStatus: () => userSettingsLocationStatus,
    resetUserSettingsToDefaults,
    saveRendererAppState: saveRevisionedState,
    scanStorageProfile: () => watcher?.scan(),
    close: () => watcher?.close(),
  }
}
