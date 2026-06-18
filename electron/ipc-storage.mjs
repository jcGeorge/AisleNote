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
  getDefaultStorageProfileRoot,
  getStorageProfileNotebookName,
  validateNotebookName,
} from './storage-profile.mjs'
import {
  createNotebookRecord,
  createNotebookRecordFromExistingFolder,
  createProfileFromNotebookLibrary,
  getActiveNotebookRecord,
  initializeNotebookLibrary,
  reconcileNotebookMirrorWithTarget,
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
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const exists = existsSync(normalizedNotebookPath)
  const hasManifest = existsSync(path.join(getHybridStorageRoot(normalizedNotebookPath), 'manifest.json'))
  return {
    notebookPath: normalizedNotebookPath,
    notebookName: getStorageProfileNotebookName(normalizedNotebookPath),
    isActive: path.resolve(activeProfileRootPath) === normalizedNotebookPath,
    isDefault: normalizedNotebookPath === defaultProfileRootPath,
    exists,
    hasManifest,
    available: exists && hasManifest,
  }
}

function createKnownNotebookStatuses(profile) {
  if (Array.isArray(profile.notebooks)) {
    return profile.notebooks.map((notebook) => {
      const localMirrorPath = path.resolve(notebook.localMirrorPath)
      const notebookPath = path.resolve(notebook.syncTargetPath ?? notebook.localMirrorPath)
      const exists = existsSync(localMirrorPath)
      const hasManifest = existsSync(path.join(getHybridStorageRoot(localMirrorPath), 'manifest.json'))
      const syncTargetExists = notebook.syncTargetPath ? existsSync(notebook.syncTargetPath) : false
      return {
        notebookId: notebook.id,
        notebookPath,
        notebookName: notebook.name,
        localMirrorPath,
        syncTargetPath: notebook.syncTargetPath,
        syncStatus: notebook.syncStatus,
        syncPending: Boolean(notebook.syncPending),
        syncTargetExists,
        isActive: profile.notebookId === notebook.id,
        isDefault: false,
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
  const hasProfile = !profile.setupRequired && existsSync(getHybridStorageRoot(profile.profileRootPath))
  const notebookPath = profile.notebookPath || getHybridStorageRoot(profile.profileRootPath)
  const syncStatus = profile.syncStatus ?? (profile.syncTargetPath ? 'synced' : 'local-only')
  const syncIssue =
    syncStatus === 'offline'
      ? [{
          code: 'sync-target-offline',
          severity: 'warning',
          path: profile.syncTargetPath,
          message: 'Sync folder is unavailable. Local changes will be kept in the local mirror.',
        }]
      : syncStatus === 'pending'
        ? [{
            code: 'sync-pending',
            severity: 'warning',
            path: profile.syncTargetPath,
            message: 'Sync is pending. Local changes are saved in the local mirror.',
          }]
        : syncStatus === 'warning'
          ? [{
              code: 'sync-warning',
              severity: 'warning',
              path: profile.syncTargetPath,
              message: 'Sync completed with warnings. Local changes were kept where needed.',
            }]
          : syncStatus === 'error'
            ? [{
                code: 'sync-error',
                severity: 'warning',
                path: profile.syncTargetPath,
                message: profile.lastSyncError ?? 'Sync failed. Local changes are saved in the local mirror.',
              }]
            : []
  const health =
    loadResult.ok && syncIssue.length > 0
      ? 'warning'
      : loadResult.health ?? (loadResult.ok ? 'healthy' : 'error')
  return {
    status: loadResult.ok ? 'ready' : 'error',
    health,
    issues: [...(loadResult.issues ?? []), ...syncIssue],
    event,
    profileRootPath: profile.profileRootPath,
    activeNotebookId: profile.notebookId ?? null,
    notebookPath,
    notebookName: profile.notebookName || getStorageProfileNotebookName(profile.profileRootPath),
    localMirrorPath: profile.localMirrorPath || profile.profileRootPath,
    syncTargetPath: profile.syncTargetPath,
    syncStatus,
    syncPending: Boolean(profile.syncPending),
    isDefault: profile.isDefault,
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
  const failedLocalNotebook =
    typeof recovery?.failedNotebookPath === 'string' &&
    typeof recovery?.activeNotebookPath === 'string' &&
    path.resolve(recovery.failedNotebookPath) === path.resolve(recovery.activeNotebookPath)
  const body = failedLocalNotebook
    ? 'Tabs could not load the local notebook, so it reset the local notebook on this device.'
    : 'Tabs could not load the connected notebook, so it stopped using that folder and returned to the local notebook on this device. The original folder was left untouched.'
  const details = [
    body,
    recovery.failedNotebookPath ? `Failed folder: ${recovery.failedNotebookPath}` : '',
    recovery.backupNotebookPath ? `Backup folder: ${recovery.backupNotebookPath}` : '',
    issueSummary.length > 0 ? `Issue summary: ${issueSummary.join(' ')}` : '',
  ].filter(Boolean)
  return {
    id: `storage-recovered-${timestamp}`,
    type: STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE,
    status: 'unread',
    createdAt: timestamp,
    signature: `storage-notebook-recovered:${timestamp}:${recovery.failedNotebookPath ?? 'local'}`,
    title: 'Started local notebook',
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
        error: 'Notebook local mirror is missing.',
        issues: [{
          code: 'missing-local-mirror',
          severity: 'error',
          path: profileRootPath,
          message: 'Notebook local mirror is missing.',
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
  const syncActiveNotebookTarget = (record, serializedState, localMirrorPath) => {
    if (!record) return null
    if (!record.syncTargetPath) {
      return updateActiveNotebookRecord({
        ...record,
        syncStatus: 'local-only',
        syncPending: false,
        lastSyncError: undefined,
      })
    }
    if (!existsSync(record.syncTargetPath)) {
      return updateActiveNotebookRecord({
        ...record,
        syncStatus: 'offline',
        syncPending: true,
        lastSyncError: 'Sync target is unavailable.',
      })
    }
    try {
      const syncSaveResult = saveAppState(record.syncTargetPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        notebookId: record.id,
        assetSourceRoot: localMirrorPath,
        syncMetadata: createSyncMetadata('local-save-synced'),
      })
      return updateActiveNotebookRecord({
        ...record,
        syncStatus: 'synced',
        syncPending: false,
        syncFiles: syncSaveResult?.storageFiles ?? record.syncFiles,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      })
    } catch (error) {
      return updateActiveNotebookRecord({
        ...record,
        syncStatus: 'error',
        syncPending: true,
        lastSyncError: error instanceof Error ? error.message : 'Sync target could not be written.',
      })
    }
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
    if (activeRecord) syncActiveNotebookTarget(activeRecord, serializedState, profileRootPath)
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
    console.info?.(`[tabs:storage] ${event}`)
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
    if (isInsidePath(profile.profileRootPath, resolvedPath)) {
      return { ok: false, error: 'Choose a location outside the active notebook folder.' }
    }
    return { ok: true, locationPath: resolvedPath }
  }

  const buildNotebookTargetPath = (locationPath, name) => {
    const validation = validateNotebookName(name)
    if (!validation.ok) return validation
    const locationValidation = validateNotebookLocationPath(locationPath)
    if (!locationValidation.ok) return locationValidation
    return {
      ok: true,
      name: validation.name,
      profileRootPath: path.join(locationValidation.locationPath, validation.name),
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

  const resolveMoveProfileRootCandidate = (selectedProfileRootPath) => {
    const selected = inspectProfileRootCandidate(selectedProfileRootPath)
    if (selected.targetHasProfile || !selected.targetHasEntries || selected.targetResult.ok) return selected
    return inspectProfileRootCandidate(
      path.join(selected.profileRootPath, profile.notebookName || getStorageProfileNotebookName(profile.profileRootPath)),
    )
  }

  const createRecoveryMetadata = (failedProfile, failedResult, mode) => {
    const activeNotebookPath = getDefaultStorageProfileRoot(userDataPath)
    const failedNotebookAvailable = existsSync(failedProfile.profileRootPath)
    return {
      event: 'notebook-auto-recovered',
      mode,
      failedNotebookPath: failedProfile.profileRootPath,
      failedNotebookName: getStorageProfileNotebookName(failedProfile.profileRootPath),
      failedNotebookAvailable,
      activeNotebookPath,
      activeNotebookName: getStorageProfileNotebookName(activeNotebookPath),
      originalError: failedResult?.error ?? 'Existing app state could not be loaded.',
      issueSummary: createRecoveryIssueSummary(failedResult, failedProfile.profileRootPath),
      issues: Array.isArray(failedResult?.issues) ? failedResult.issues : [],
      createdAt: new Date().toISOString(),
    }
  }

  const persistRecoveredDefaultNotebook = (serializedState, replaceExisting) => {
    watcher?.markAppWrite()
    saveNotebookState(getDefaultStorageProfileRoot(userDataPath), serializedState, {
      userDataPath,
      userSettingsRoot: userDataPath,
      replaceExisting,
    })
    watcher?.markAppWrite()
  }

  const loadRecoveredDefaultNotebook = (recovery) => {
    updateStatus('notebook-recovery-error', 'Automatic local notebook recovery is disabled.', { recovery })
    return { ok: false, result: coordinator.getLoadResult() }
  }

  const recoverActiveNotebookLoadFailure = (failedResult, trigger = 'startup-error') => {
    logExternalStorageEvent(trigger)
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (!activeRecord) {
      updateStatus('profile-error', failedResult?.error ?? 'Notebook local mirror could not be loaded.')
      startWatcher()
      return false
    }

    const failedProfile = { ...profile }
    try {
      const recoveryBase = createRecoveryMetadata(failedProfile, failedResult, 'reset-default')
      const backupNotebookPath = moveNotebookFolderToBackup(activeRecord.localMirrorPath)
      const recovery = {
        ...recoveryBase,
        failedNotebookAvailable: backupNotebookPath ? true : recoveryBase.failedNotebookAvailable,
        ...(backupNotebookPath ? { backupNotebookPath } : {}),
      }
      const serializedState = appendRecoveryMessage(JSON.stringify(createBlankNotebookState()), recovery)

      watcher?.markAppWrite()
      saveAppState(activeRecord.localMirrorPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        notebookId: activeRecord.id,
        replaceExisting: true,
        syncMetadata: createSyncMetadata('local-recovered'),
      })
      watcher?.markAppWrite()

      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        syncStatus: activeRecord.syncTargetPath ? 'pending' : 'local-only',
        syncPending: Boolean(activeRecord.syncTargetPath),
        lastSyncError: activeRecord.syncTargetPath ? 'Local mirror was reset and needs to sync.' : undefined,
      }, { activate: true })
      refreshProfileFromLibrary()

      const result = coordinator.reloadProfileRoot(activeRecord.localMirrorPath, {
        requireSerializedState: true,
        detectAppSaveEcho: false,
      })
      if (!result.ok) {
        updateStatus('notebook-recovery-error', result.error ?? 'Local notebook could not be recovered.', { recovery })
        startWatcher()
        return false
      }

      updateStatus('notebook-auto-recovered', null, { recovery })
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
      startWatcher()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local notebook could not be recovered.'
      updateStatus('notebook-recovery-error', message)
      startWatcher()
      return false
    }
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
    return recoverActiveNotebookLoadFailure(retryResult ?? failedResult, trigger)
  }

  const getWatchedNotebookRoot = () => {
    return profile.syncTargetPath && existsSync(profile.syncTargetPath)
      ? profile.syncTargetPath
      : profile.profileRootPath
  }

  const reloadLocalMirrorAfterSync = (event = 'external-loaded') => {
    const previousSerializedState = coordinator.getSerializedState()
    const result = measureSlowMainOperation('local mirror reload', () =>
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
    updateStatus('profile-error', result.error ?? 'Notebook local mirror could not be loaded.')
    watcher?.reset()
    return false
  }

  const reconcileActiveNotebookFromSyncTarget = () => {
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (!activeRecord?.syncTargetPath) return false
    const reconciliation = reconcileNotebookMirrorWithTarget(activeRecord)
    notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, reconciliation.record, { activate: true })
    refreshProfileFromLibrary()
    if (!reconciliation.ok) {
      updateStatus('external-error', reconciliation.error ?? 'Notebook sync failed.')
      watcher?.reset()
      return true
    }
    if (reconciliation.record?.syncStatus === 'offline') {
      updateStatus('sync-target-offline')
      watcher?.reset()
      return true
    }
    logExternalStorageEvent(reconciliation.changed ? 'external-loaded' : 'external-echo-ignored')
    reloadLocalMirrorAfterSync(reconciliation.warning ? 'external-conflict' : 'external-loaded')
    return true
  }

  const reconcileActiveNotebookAfterLocalWrite = (event = 'saved') => {
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (!activeRecord?.syncTargetPath) return undefined
    const reconciliation = reconcileNotebookMirrorWithTarget(activeRecord)
    notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, reconciliation.record, { activate: true })
    refreshProfileFromLibrary()
    updateStatus(reconciliation.ok ? event : 'notebook-sync-error', reconciliation.ok ? null : reconciliation.error)
    return reconciliation.warning
  }

  const startWatcher = () => {
    watcher?.close()
    watcher = createStorageProfileWatcher({
      getProfileRootPath: getWatchedNotebookRoot,
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
            const value = window.__tabsGetLatestAppState?.()
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
      path.resolve(candidate.localMirrorPath) === normalizedProfileRootPath ||
      (candidate.syncTargetPath && path.resolve(candidate.syncTargetPath) === normalizedProfileRootPath)
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
      (profileRootPath && path.resolve(candidate.localMirrorPath) === profileRootPath) ||
      (profileRootPath && candidate.syncTargetPath && path.resolve(candidate.syncTargetPath) === profileRootPath)
    ) ?? (options.defaultActive === true ? getActiveNotebookRecord(notebookLibrary) : null)
    if (!record) return { ok: false, error: 'Notebook is not in the notebook library.' }
    return { ok: true, record }
  }

  const getNotebookSyncTargetPathFromPayload = async (payload = {}, title = 'Choose sync folder') => {
    const candidate =
      typeof payload?.syncTargetPath === 'string' ? payload.syncTargetPath :
        typeof payload?.notebookPath === 'string' ? payload.notebookPath :
          typeof payload?.locationPath === 'string' ? payload.locationPath :
            ''
    if (candidate.trim()) return { ok: true, profileRootPath: path.resolve(candidate) }
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.' }
    }
    const selection = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }
    return { ok: true, profileRootPath: path.resolve(selection.filePaths[0]) }
  }

  const getCurrentSerializedStateForRecord = (record) => {
    const currentSerializedState = coordinator.getSerializedState()
    if (record.id === profile.notebookId && typeof currentSerializedState === 'string') return currentSerializedState
    const loadResult = loadAppStateResult(record.localMirrorPath, { userSettingsRoot: userDataPath })
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

  const ensureNotebookSyncTargetWritable = (record, profileRootPath) => {
    const target = inspectProfileRootCandidate(profileRootPath)
    if (isInsidePath(record.localMirrorPath, target.profileRootPath) || isInsidePath(target.profileRootPath, record.localMirrorPath)) {
      return { ok: false, error: 'Sync folder must be outside the local mirror.' }
    }
    if (!target.targetHasProfile && target.targetHasEntries && !target.targetResult.ok) {
      return { ok: false, error: 'Notebook folder must be empty or contain manifest.json.' }
    }
    if (target.targetHasProfile && !target.targetResult.ok) {
      return { ok: false, error: 'This folder contains Tabs data that could not be loaded.' }
    }
    const targetNotebookId = typeof target.targetResult?.notebookId === 'string' ? target.targetResult.notebookId : ''
    if (targetNotebookId && targetNotebookId !== record.id) {
      return { ok: false, error: 'This folder belongs to a different notebook.' }
    }
    return { ok: true, target }
  }

  const attachRecordToSyncTarget = async (record, profileRootPath, event = 'notebook-sync-target-attached') => {
    const validation = ensureNotebookSyncTargetWritable(record, profileRootPath)
    if (!validation.ok) return { ok: false, error: validation.error, status }
    const serializedState = getCurrentSerializedStateForRecord(record)
    if (serializedState === null) return { ok: false, error: 'Notebook local mirror could not be loaded.', status }

    try {
      let syncFiles = record.syncFiles
      if (!validation.target.targetHasProfile || validation.target.targetResult.serializedState === null) {
        const saveResult = saveAppState(profileRootPath, serializedState, {
          userDataPath,
          userSettingsRoot: userDataPath,
          notebookId: record.id,
          assetSourceRoot: getHybridStorageRoot(record.localMirrorPath),
          syncMetadata: createSyncMetadata('sync-target-attached'),
        })
        syncFiles = saveResult?.storageFiles ?? syncFiles
      } else if (!validation.target.targetResult.notebookId) {
        const saveResult = saveAppState(profileRootPath, validation.target.targetResult.serializedState, {
          userDataPath,
          userSettingsRoot: userDataPath,
          notebookId: record.id,
          assetSourceRoot: getHybridStorageRoot(profileRootPath),
          syncMetadata: createSyncMetadata('schema-upgraded'),
        })
        syncFiles = saveResult?.storageFiles ?? syncFiles
      }

      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...record,
        syncTargetPath: path.resolve(profileRootPath),
        syncStatus: 'synced',
        syncPending: false,
        syncFiles,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      }, { activate: record.id === notebookLibrary.activeNotebookId })

      const updatedRecord = notebookLibrary.notebooks.find((candidate) => candidate.id === record.id)
      if (updatedRecord?.syncTargetPath && validation.target.targetHasProfile) {
        const reconciliation = reconcileNotebookMirrorWithTarget(updatedRecord)
        notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, reconciliation.record, {
          activate: record.id === notebookLibrary.activeNotebookId,
        })
        if (!reconciliation.ok) {
          refreshProfileFromLibrary()
          updateStatus('notebook-sync-error', reconciliation.error ?? 'Notebook sync failed.')
          return { ok: false, error: reconciliation.error ?? 'Notebook sync failed.', status }
        }
        if (record.id === notebookLibrary.activeNotebookId) reloadAfterNotebookLibraryChange(event)
        else {
          refreshProfileFromLibrary()
          updateStatus(event)
        }
        return { ok: true, status, warning: reconciliation.warning }
      }

      if (record.id === notebookLibrary.activeNotebookId) reloadAfterNotebookLibraryChange(event)
      else {
        refreshProfileFromLibrary()
        updateStatus(event)
      }
      return { ok: true, status }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync folder could not be attached.'
      updateStatus('notebook-sync-error', message)
      return { ok: false, error: message, status }
    }
  }

  const renameNotebook = async (_event, payload = {}) => {
    const validation = validateNotebookName(payload?.name)
    if (!validation.ok) return { ok: false, error: validation.error, status }
    try {
      const activeRecord = getActiveNotebookRecord(notebookLibrary)
      if (!activeRecord) return { ok: false, error: 'No active notebook is available.', status }
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        name: validation.name,
      }, { activate: true })
      refreshProfileFromLibrary()
      updateStatus('notebook-renamed')
      startWatcher()
      return { ok: true, status }
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
    const serializedState = await getCurrentSerializedStateForProfileMove(event)
    if (serializedState === null) {
      return { ok: false, error: 'Current app state is not ready to move.', status }
    }
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (!activeRecord) {
      try {
        const record = createNotebookRecord(userDataPath, {
          name: getStorageProfileNotebookName(profileRootPath),
          syncTargetPath: profileRootPath,
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
    const previousSyncTargetPath = activeRecord.syncTargetPath
    try {
      const syncSaveResult = saveAppState(profileRootPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        notebookId: activeRecord.id,
        replaceExisting: true,
        assetSourceRoot: getHybridStorageRoot(activeRecord.localMirrorPath),
        syncMetadata: createSyncMetadata('sync-target-moved'),
      })
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        syncTargetPath: path.resolve(profileRootPath),
        syncStatus: 'synced',
        syncPending: false,
        syncFiles: syncSaveResult?.storageFiles ?? activeRecord.syncFiles,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
      }, { activate: true })
      refreshProfileFromLibrary()
      updateStatus('profile-moved')
      startWatcher()
      if (options.trashSource !== true || !previousSyncTargetPath || previousSyncTargetPath === profileRootPath) {
        return { ok: true, status }
      }
      const warning = await maybeTrashSourceProfileRoot(previousSyncTargetPath)
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
          message: targetHasProfile ? 'This folder already contains Tabs data.' : 'Move notebook folder?',
          detail: targetHasProfile
            ? 'Replacing it will write your current notebook into this folder. Current user settings stay in app support.'
            : 'Tabs will write your current notebook into this folder. Current user settings stay in app support.',
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
        message: 'This folder already contains Tabs data.',
        detail: 'Use the existing notebook in this folder, or replace it with your current notebook. Current user settings stay in app support.',
      })
      if (choice.response === 0) return useExistingNotebookFolder()
      if (choice.response === 1) return replaceProfileWithCurrentData(profileRootPath, event)
      return { canceled: true, status }
    }

    if (targetHasProfile && !targetResult.ok) {
      return {
        ok: false,
        error: 'This folder contains Tabs data that could not be loaded.',
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
        detail: 'Tabs will save your current notebook into this folder. Current user settings stay in app support.',
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
    if (profileRootPath === profile.syncTargetPath || profileRootPath === profile.profileRootPath) return { ok: true, status }

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
      (profileRootPath && path.resolve(candidate.localMirrorPath) === profileRootPath) ||
      (profileRootPath && candidate.syncTargetPath && path.resolve(candidate.syncTargetPath) === profileRootPath)
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
      (profileRootPath && path.resolve(candidate.localMirrorPath) === profileRootPath) ||
      (profileRootPath && candidate.syncTargetPath && path.resolve(candidate.syncTargetPath) === profileRootPath)
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
    if (typeof payload?.serializedState !== 'string' || payload.serializedState.trim().length === 0) {
      return { ok: false, error: 'Blank notebook state is invalid.', status }
    }
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
        name: target.name,
        syncTargetPath: target.profileRootPath,
        serializedState: payload.serializedState,
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

  const resetLocalNotebookToBlank = async () => {
    const serializedState = JSON.stringify(createBlankNotebookState())
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (!activeRecord) return { ok: false, error: 'No active notebook is available.', status }

    try {
      watcher?.markAppWrite()
      saveAppState(activeRecord.localMirrorPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        notebookId: activeRecord.id,
        replaceExisting: true,
        syncMetadata: createSyncMetadata('local-reset'),
      })
      watcher?.markAppWrite()

      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
        ...activeRecord,
        syncStatus: activeRecord.syncTargetPath ? 'pending' : 'local-only',
        syncPending: Boolean(activeRecord.syncTargetPath),
      }, { activate: true })
      refreshProfileFromLibrary()

      const result = coordinator.reloadProfileRoot(activeRecord.localMirrorPath, {
        requireSerializedState: true,
        detectAppSaveEcho: false,
      })
      if (!result.ok) {
        updateStatus('notebook-reset-error', result.error ?? 'Local notebook could not be reset.')
        return { ok: false, error: result.error ?? 'Local notebook could not be reset.', status }
      }

      updateStatus('notebook-reset-local')
      startWatcher()
      broadcastAppStateUpdate({
        serializedState: result.serializedState,
        revision: result.revision,
      })
      return { ok: true, status }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local notebook could not be reset.'
      updateStatus('notebook-reset-error', message)
      return { ok: false, error: message, status }
    }
  }

  const deleteNotebook = async (_event, payload = {}) => {
    const resolution = resolveNotebookRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const record = resolution.record
    if (!shell || typeof shell.trashItem !== 'function') {
      return { ok: false, error: 'Moving notebooks to Trash is unavailable.', status }
    }

    let trashSyncTarget = payload?.trashSyncTarget === true
    if (dialog?.showMessageBox && payload?.skipConfirmation !== true) {
      const buttons = record.syncTargetPath
        ? ['Trash local mirror only', 'Trash local mirror and sync folder', 'Cancel']
        : ['Trash notebook', 'Cancel']
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons,
        cancelId: buttons.length - 1,
        defaultId: 0,
        message: 'Delete notebook?',
        detail: record.syncTargetPath
          ? 'Tabs will remove this notebook from the library and move its local mirror to Trash. The attached sync folder is kept unless you choose to Trash it too.'
          : 'Tabs will remove this notebook from the library and move its local mirror to Trash.',
      })
      if (choice.response === buttons.length - 1) return { canceled: true, status }
      trashSyncTarget = record.syncTargetPath ? choice.response === 1 : false
    }

    try {
      if (existsSync(record.localMirrorPath)) {
        await shell.trashItem(record.localMirrorPath)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook local mirror could not be moved to Trash.',
        status,
      }
    }

    let warning
    if (trashSyncTarget && record.syncTargetPath && existsSync(record.syncTargetPath)) {
      try {
        await shell.trashItem(record.syncTargetPath)
      } catch (error) {
        warning = error instanceof Error && error.message
          ? `Sync folder was kept because it could not be moved to Trash: ${error.message}`
          : 'Sync folder was kept because it could not be moved to Trash.'
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
    return { ok: true, status, warning }
  }

  const attachNotebookSyncTarget = async (_event, payload = {}) => {
    const resolution = resolveNotebookRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const selection = await getNotebookSyncTargetPathFromPayload(payload, 'Attach sync folder')
    if (selection.canceled) return selection
    if (!selection.ok) return { ok: false, error: selection.error, status }
    return attachRecordToSyncTarget(resolution.record, selection.profileRootPath, 'notebook-sync-target-attached')
  }

  const detachNotebookSyncTarget = async (_event, payload = {}) => {
    const resolution = resolveNotebookRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const record = resolution.record
    notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, {
      ...record,
      syncTargetPath: undefined,
      syncStatus: 'local-only',
      syncPending: false,
      lastSyncError: undefined,
    }, { activate: record.id === notebookLibrary.activeNotebookId })
    refreshProfileFromLibrary()
    updateStatus('notebook-sync-target-detached')
    startWatcher()
    return { ok: true, status }
  }

  const reconnectNotebookSyncTarget = async (_event, payload = {}) => {
    const resolution = resolveNotebookRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const record = resolution.record
    const explicitPath =
      typeof payload?.syncTargetPath === 'string' && payload.syncTargetPath.trim()
        ? payload.syncTargetPath
        : typeof payload?.notebookPath === 'string' && payload.notebookPath.trim()
          ? payload.notebookPath
          : ''
    if (!explicitPath && record.syncTargetPath && existsSync(record.syncTargetPath)) {
      const target = inspectProfileRootCandidate(record.syncTargetPath)
      if (!target.targetHasProfile || target.targetResult.serializedState === null) {
        return attachRecordToSyncTarget(record, record.syncTargetPath, 'notebook-sync-target-reconnected')
      }
      const reconciliation = reconcileNotebookMirrorWithTarget(record)
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, reconciliation.record, {
        activate: record.id === notebookLibrary.activeNotebookId,
      })
      if (!reconciliation.ok) {
        refreshProfileFromLibrary()
        updateStatus('notebook-sync-error', reconciliation.error ?? 'Notebook sync failed.')
        return { ok: false, error: reconciliation.error ?? 'Notebook sync failed.', status }
      }
      if (record.id === notebookLibrary.activeNotebookId) reloadAfterNotebookLibraryChange('notebook-sync-target-reconnected')
      else {
        refreshProfileFromLibrary()
        updateStatus('notebook-sync-target-reconnected')
      }
      return { ok: true, status, warning: reconciliation.warning }
    }

    const selection = await getNotebookSyncTargetPathFromPayload(
      { ...payload, syncTargetPath: explicitPath },
      'Reconnect sync folder',
    )
    if (selection.canceled) return selection
    if (!selection.ok) return { ok: false, error: selection.error, status }
    return attachRecordToSyncTarget(record, selection.profileRootPath, 'notebook-sync-target-reconnected')
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
            'Tabs will use this folder for live user settings and overwrite the current local app settings cache with settings/app-settings.json from that folder.',
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
    recoverActiveNotebookLoadFailure(initialLoadResult, 'startup-error')
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
  ipcMain.handle?.('reset-local-notebook-to-blank', resetLocalNotebookToBlank)
  ipcMain.handle?.('rename-notebook', renameNotebook)
  ipcMain.handle?.('open-notebook', openNotebook)
  ipcMain.handle?.('switch-notebook', switchNotebook)
  ipcMain.handle?.('forget-notebook', forgetNotebook)
  ipcMain.handle?.('delete-notebook', deleteNotebook)
  ipcMain.handle?.('attach-notebook-sync-target', attachNotebookSyncTarget)
  ipcMain.handle?.('detach-notebook-sync-target', detachNotebookSyncTarget)
  ipcMain.handle?.('reconnect-notebook-sync-target', reconnectNotebookSyncTarget)
  ipcMain.handle?.('choose-storage-folder', async (event) => chooseProfileRoot('choose', event))
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
    const activeRecord = getActiveNotebookRecord(notebookLibrary)
    if (activeRecord?.syncTargetPath) {
      const reconciliation = reconcileNotebookMirrorWithTarget(activeRecord)
      notebookLibrary = upsertNotebookRecord(userDataPath, notebookLibrary, reconciliation.record, { activate: true })
      refreshProfileFromLibrary()
      if (!reconciliation.ok) {
        updateStatus('retry-error', reconciliation.error ?? 'Notebook sync failed.')
        return { ok: false, status, error: reconciliation.error ?? 'Notebook sync failed.' }
      }
      const reload = reloadLocalMirrorAfterSync(reconciliation.warning ? 'external-conflict' : 'retry-loaded')
      return {
        ok: reload,
        status,
        warning: reconciliation.warning,
        error: reload ? undefined : status.error,
      }
    }
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
      const warning = reconcileActiveNotebookAfterLocalWrite('asset-imported')
      return { ok: true, ...result, ...(warning ? { warning } : {}) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Image asset could not be imported.' }
    }
  })

  ipcMain.handle?.('import-asset', async (_event, payload = {}) => {
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
      const warning = reconcileActiveNotebookAfterLocalWrite('asset-imported')
      return { ok: true, ...result, ...(warning ? { warning } : {}) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be imported.' }
    }
  })

  ipcMain.handle?.('open-asset', async (_event, payload = {}) => {
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
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Note reveal is unavailable.' }
    }
    try {
      const resolved = resolveNoteLocationRevealPath(profile.profileRootPath, payload)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      if (!existsSync(resolved.absolutePath)) return { ok: false, error: 'Note file does not exist.' }
      shell.showItemInFolder(resolved.absolutePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Note file could not be revealed.' }
    }
  })

  ipcMain.handle?.('reveal-notebook-item-location', async (_event, payload = {}) => {
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Notebook item reveal is unavailable.' }
    }
    try {
      const resolved = resolveNotebookItemLocationRevealPath(profile.profileRootPath, payload)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      if (!existsSync(resolved.absolutePath)) return { ok: false, error: 'Notebook item does not exist.' }
      shell.showItemInFolder(resolved.absolutePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Notebook item could not be revealed.' }
    }
  })

  ipcMain.handle?.('read-asset', async (_event, payload = {}) => {
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
    resetLocalNotebookToBlank,
    resetUserSettingsToDefaults,
    saveRendererAppState: saveRevisionedState,
    scanStorageProfile: () => watcher?.scan(),
    close: () => watcher?.close(),
  }
}
