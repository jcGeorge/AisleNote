import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'
import {
  getHybridStorageRoot,
  loadAppStateResult,
  measureSlowMainOperation,
  resolveNoteLocationRevealPath,
  resolveVaultItemLocationRevealPath,
  saveAppState,
  writeAssetToProfile,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import {
  getStorageProfileVaultName,
  validateVaultName,
} from './storage-profile.mjs'
import {
  createVaultRecord,
  createVaultRecordFromExistingFolder,
  createProfileFromVaultLibrary,
  getActiveVaultRecord,
  initializeVaultLibrary,
  removeVaultRecord,
  setActiveVaultId,
  upsertVaultRecord,
} from './vault-library.mjs'
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

const STORAGE_VAULT_RECOVERED_MESSAGE_TYPE = 'storage-vault-recovered'

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

function createKnownVaultStatus(userDataPath, activeProfileRootPath, vaultPath) {
  const normalizedVaultPath = path.resolve(vaultPath)
  const exists = existsSync(normalizedVaultPath)
  const hasManifest = existsSync(path.join(getHybridStorageRoot(normalizedVaultPath), 'manifest.json'))
  return {
    vaultPath: normalizedVaultPath,
    vaultName: getStorageProfileVaultName(normalizedVaultPath),
    isActive: path.resolve(activeProfileRootPath) === normalizedVaultPath,
    exists,
    hasManifest,
    available: exists && hasManifest,
  }
}

function createKnownVaultStatuses(profile) {
  if (Array.isArray(profile.vaults)) {
    return profile.vaults.map((vault) => {
      const vaultPath = path.resolve(vault.vaultPath)
      const exists = existsSync(vaultPath)
      const hasManifest = existsSync(path.join(getHybridStorageRoot(vaultPath), 'manifest.json'))
      return {
        vaultId: vault.id,
        vaultPath,
        vaultName: getStorageProfileVaultName(vaultPath),
        isActive: profile.vaultId === vault.id,
        exists,
        hasManifest,
        available: exists && hasManifest,
      }
    })
  }
  const paths = Array.isArray(profile.knownVaultPaths) ? profile.knownVaultPaths : [profile.profileRootPath]
  return paths.map((vaultPath) => createKnownVaultStatus(profile.userDataPath, profile.profileRootPath, vaultPath))
}

function createStorageStatus({ profile, coordinator, event = 'ready', error = null, recovery = null }) {
  const loadResult = coordinator.getLoadResult()
  if (profile.setupRequired) {
    return {
      status: 'setup-required',
      health: 'warning',
      issues: loadResult.issues ?? [{
        code: 'vault-setup-required',
        severity: 'warning',
        message: 'Create a vault or open an existing vault to start saving.',
      }],
      event,
      profileRootPath: '',
      activeVaultId: null,
      vaultPath: '',
      vaultName: '',
      hasProfile: false,
      canWrite: false,
      source: 'empty',
      schemaVersion: null,
      conflicts: [],
      revision: loadResult.revision ?? 0,
      error: error ?? 'Create a vault or open an existing vault to start saving.',
      knownVaults: createKnownVaultStatuses(profile),
      ...(recovery ? { recovery } : {}),
    }
  }
  const hasProfile = !profile.setupRequired && existsSync(getHybridStorageRoot(profile.profileRootPath))
  const vaultPath = profile.vaultPath || getHybridStorageRoot(profile.profileRootPath)
  const health = loadResult.health ?? (loadResult.ok ? 'healthy' : 'error')
  return {
    status: loadResult.ok ? 'ready' : 'error',
    health,
    issues: loadResult.issues ?? [],
    event,
    profileRootPath: profile.profileRootPath,
    activeVaultId: profile.vaultId ?? null,
    vaultPath,
    vaultName: profile.vaultName || getStorageProfileVaultName(profile.profileRootPath),
    hasProfile,
    canWrite: coordinator.canWriteAppState(),
    source: loadResult.source,
    schemaVersion: loadResult.schemaVersion,
    conflicts: loadResult.conflicts,
    revision: loadResult.revision,
    error: error ?? (loadResult.ok ? undefined : loadResult.error),
    knownVaults: createKnownVaultStatuses(profile),
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
  const vaultRoot = getHybridStorageRoot(profileRootPath)
  const absoluteAssetPath = path.resolve(vaultRoot, assetPath)
  if (!absoluteAssetPath.startsWith(vaultRoot + path.sep)) {
    return { ok: false, error: 'Invalid asset path.' }
  }
  return { ok: true, assetPath, absoluteAssetPath }
}

export function resolvePreferredVaultRevealPath({
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
        ? { ok: false, error: 'Vault item does not exist.' }
        : resolved
    }
  }

  return fallback ?? { ok: false, error: 'Vault item could not be resolved.' }
}

export function reconcileVaultLibraryForStartup(userDataPath, library) {
  return { library, reconciliation: null }
}

function createRecoveryIssueSummary(loadResult, failedVaultPath = null) {
  if (typeof failedVaultPath === 'string' && failedVaultPath.length > 0 && !existsSync(failedVaultPath)) {
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

function createMissingActiveVaultResult(profileRootPath, loadResult = {}) {
  const folderExists = typeof profileRootPath === 'string' && existsSync(profileRootPath)
  return {
    ok: false,
    serializedState: null,
    source: loadResult.source ?? 'empty',
    error: 'Existing app state could not be loaded.',
    issues: [{
      code: folderExists ? 'missing-vault-data' : 'missing-vault-folder',
      severity: 'error',
      path: profileRootPath,
      message: folderExists ? 'Vault data could not be found in this folder.' : 'Unable to locate folder.',
    }],
  }
}

function createBlankVaultState(messages = []) {
  return createDefaultAppState({ messages })
}

function createRecoveryMessage(recovery) {
  const issueSummary = Array.isArray(recovery?.issueSummary) ? recovery.issueSummary : []
  const timestamp = new Date().toISOString()
  const details = [
    'AisleNote could not load this vault folder, so it reset the vault in that folder.',
    recovery.failedVaultPath ? `Failed folder: ${recovery.failedVaultPath}` : '',
    recovery.backupVaultPath ? `Backup folder: ${recovery.backupVaultPath}` : '',
    issueSummary.length > 0 ? `Issue summary: ${issueSummary.join(' ')}` : '',
  ].filter(Boolean)
  return {
    id: `storage-recovered-${timestamp}`,
    type: STORAGE_VAULT_RECOVERED_MESSAGE_TYPE,
    status: 'unread',
    createdAt: timestamp,
    signature: `storage-vault-recovered:${timestamp}:${recovery.failedVaultPath ?? 'vault'}`,
    title: 'Recovered vault',
    body: details.join('\n'),
    failedVaultPath: recovery.failedVaultPath,
    failedVaultAvailable: recovery.failedVaultAvailable,
    activeVaultPath: recovery.activeVaultPath,
    activeVaultName: recovery.activeVaultName,
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

function moveVaultFolderToBackup(sourcePath) {
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

function getRecoveredVaultPathFromSerializedState(serializedState, selector) {
  if (!selector.hasSelector || typeof serializedState !== 'string') return null
  try {
    const parsed = JSON.parse(serializedState)
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : []
    const message = messages.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      if (entry.type !== STORAGE_VAULT_RECOVERED_MESSAGE_TYPE) return false
      const idMatches = selector.messageId !== null && entry.id === selector.messageId
      const signatureMatches = selector.signature !== null && entry.signature === selector.signature
      return idMatches || signatureMatches
    })
    if (message?.failedVaultAvailable === false) return null
    return typeof message?.failedVaultPath === 'string' && message.failedVaultPath.trim()
      ? message.failedVaultPath
      : null
  } catch {
    return null
  }
}

export function registerStorageIpc({ ipcMain, app, BrowserWindow, dialog = null, shell = null }) {
  const userDataPath = app.getPath('userData')
  let vaultLibrary = initializeVaultLibrary(userDataPath)
  const startupReconciliation = reconcileVaultLibraryForStartup(userDataPath, vaultLibrary)
  vaultLibrary = startupReconciliation.library
  let profile = createProfileFromVaultLibrary(userDataPath, vaultLibrary)
  let userSettingsLocation = resolveUserSettingsLocation(userDataPath)
  const getStartupUserSettingsSeed = () => {
    if (profile?.setupRequired || !profile?.profileRootPath) return null
    const result = loadAppStateResult(profile.profileRootPath, { includeUserSettings: false })
    return result.ok && typeof result.serializedState === 'string' ? result.serializedState : null
  }
  let userSettingsLocationRefresh = refreshLocalUserSettingsFromLocation(userDataPath, userSettingsLocation, {
    seedSerializedState: getStartupUserSettingsSeed(),
  })
  if (userSettingsLocationRefresh.location) userSettingsLocation = userSettingsLocationRefresh.location
  let userSettingsLocationStatus = userSettingsLocationRefresh.status
  const refreshProfileFromLibrary = () => {
    profile = createProfileFromVaultLibrary(userDataPath, vaultLibrary)
    return profile
  }
  const createSyncMetadata = (event) => ({
    version: 1,
    event,
    updatedAt: new Date().toISOString(),
  })
  const loadVaultResult = (profileRootPath) => {
    if (profile?.setupRequired) {
      return {
        ok: false,
        serializedState: null,
        source: 'empty',
        health: 'error',
        error: 'Vault setup is required before saves can start.',
        issues: [{
          code: 'vault-setup-required',
          severity: 'error',
          message: 'Create a vault or open an existing vault to start saving.',
        }],
      }
    }
    const result = loadAppStateResult(profileRootPath, { userSettingsRoot: userDataPath })
    if (profile?.vaultId && result.ok && result.serializedState === null) {
      return {
        ok: false,
        serializedState: null,
        source: result.source,
        health: 'error',
        error: 'Vault folder is missing.',
        issues: [{
          code: 'missing-vault-folder',
          severity: 'error',
          path: profileRootPath,
          message: 'Vault folder is missing.',
        }],
      }
    }
    return result
  }
  const adoptUserSettingsLocationResult = (result) => {
    if (result?.location) userSettingsLocation = result.location
    return result
  }
  const updateActiveVaultRecord = (record, options = {}) => {
    vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, record, options)
    refreshProfileFromLibrary()
    return getActiveVaultRecord(vaultLibrary)
  }
  const saveVaultState = (profileRootPath, serializedState, options = {}) => {
    const activeRecord = getActiveVaultRecord(vaultLibrary)
    const saveResult = saveAppState(profileRootPath, serializedState, {
      ...options,
      userDataPath,
      userSettingsRoot: userDataPath,
      vaultId: activeRecord?.id,
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
    load: loadVaultResult,
    save: saveVaultState,
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

  const requireActiveVault = (actionDescription = 'perform this action') => {
    if (!profile.setupRequired && profile.profileRootPath) return null
    return {
      ok: false,
      error: `Create or open a vault before you ${actionDescription}.`,
      status,
    }
  }

  const isInsidePath = (parentPath, candidatePath) => {
    const relative = path.relative(parentPath, candidatePath)
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  }

  const validateVaultLocationPath = (locationPath) => {
    if (typeof locationPath !== 'string' || !locationPath.trim()) {
      return { ok: false, error: 'Vault location is required.' }
    }
    const resolvedPath = path.resolve(locationPath)
    let stats
    try {
      stats = lstatSync(resolvedPath)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Vault location could not be opened.',
      }
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      return { ok: false, error: 'Vault location must be a normal folder.' }
    }
    return { ok: true, locationPath: resolvedPath }
  }

  const buildVaultTargetPath = (locationPath, name) => {
    const validation = validateVaultName(name)
    if (!validation.ok) return validation
    const locationValidation = validateVaultLocationPath(locationPath)
    if (!locationValidation.ok) return locationValidation
    const profileRootPath = path.join(locationValidation.locationPath, validation.name)
    const nesting = validateVaultFolderNesting(profileRootPath)
    if (!nesting.ok) return nesting
    return {
      ok: true,
      name: validation.name,
      profileRootPath,
    }
  }

  const vaultDirectoryHasEntries = (profileRootPath) => {
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
      targetHasEntries: vaultDirectoryHasEntries(normalizedProfileRootPath),
    }
  }

  const validateVaultFolderNesting = (vaultPath, options = {}) => {
    const targetPath = path.resolve(vaultPath)
    const ignoreVaultId = typeof options.ignoreVaultId === 'string' ? options.ignoreVaultId : ''
    for (const record of vaultLibrary.vaults) {
      if (ignoreVaultId && record.id === ignoreVaultId) continue
      const existingPath = path.resolve(record.vaultPath)
      if (targetPath === existingPath) continue
      if (isInsidePath(existingPath, targetPath) || isInsidePath(targetPath, existingPath)) {
        return {
          ok: false,
          error: 'Vault folders cannot be nested. Links and settings are local to each vault folder.',
        }
      }
    }
    return { ok: true }
  }

  const resolveMoveProfileRootCandidate = (selectedProfileRootPath) => {
    const selected = inspectProfileRootCandidate(selectedProfileRootPath)
    if (selected.targetHasProfile || !selected.targetHasEntries || selected.targetResult.ok) return selected
    return inspectProfileRootCandidate(
      path.join(selected.profileRootPath, profile.vaultName || getStorageProfileVaultName(profile.profileRootPath)),
    )
  }

  const markActiveVaultLoadFailure = (failedResult, trigger = 'startup-error') => {
    logExternalStorageEvent(trigger)
    updateStatus('profile-error', failedResult?.error ?? 'Vault folder could not be loaded.')
    startWatcher()
    return false
  }

  const retryThenRecoverActiveVault = (failedResult, trigger = 'startup-error') => {
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
    return markActiveVaultLoadFailure(retryResult ?? failedResult, trigger)
  }

  const getWatchedVaultRoots = () => {
    if (profile.setupRequired) return []
    return [profile.profileRootPath]
  }

  const reloadVaultFolder = (event = 'external-loaded') => {
    if (profile.setupRequired) {
      updateStatus('vault-setup-required', 'Create a vault or open an existing vault to start saving.')
      return false
    }
    const previousSerializedState = coordinator.getSerializedState()
    const result = measureSlowMainOperation('vault folder reload', () =>
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
    updateStatus('profile-error', result.error ?? 'Vault folder could not be loaded.')
    watcher?.reset()
    return false
  }

  const reconcileActiveVaultFromSyncTarget = () => {
    return false
  }

  const reconcileActiveVaultAfterLocalWrite = (event = 'saved') => {
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
      getProfileRootPaths: getWatchedVaultRoots,
      onExternalChange: () => {
        if (reconcileActiveVaultFromSyncTarget()) return
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
        retryThenRecoverActiveVault(result, 'external-error')
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
      updateStatus('vault-setup-required', 'Create a vault or open an existing vault to start saving.')
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

  const switchToVaultRecord = (record, event = 'profile-changed', options = {}) => {
    const previousProfile = profile
    const previousLibrary = vaultLibrary
    vaultLibrary = setActiveVaultId(userDataPath, vaultLibrary, record.id)
    refreshProfileFromLibrary()
    const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: options.requireSerializedState === true,
    })
    if (!result.ok) {
      vaultLibrary = previousLibrary
      profile = previousProfile
      coordinator.reloadProfileRoot(previousProfile.profileRootPath)
      updateStatus('profile-error', result.error)
      return { ok: false, status, error: result.error ?? 'Vault folder could not be loaded.' }
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
    const record = vaultLibrary.vaults.find((candidate) =>
      path.resolve(candidate.vaultPath) === normalizedProfileRootPath
    )
    if (!record) return { ok: false, status, error: 'Vault is not in the library.' }
    return switchToVaultRecord(record, event, options)
  }

  const resolveVaultRecordFromPayload = (payload = {}, options = {}) => {
    const requestedVaultId = typeof payload?.vaultId === 'string' ? payload.vaultId.trim() : ''
    const requestedVaultPath = typeof payload?.vaultPath === 'string' ? payload.vaultPath.trim() : ''
    const profileRootPath = requestedVaultPath ? path.resolve(requestedVaultPath) : ''
    const record = vaultLibrary.vaults.find((candidate) =>
      candidate.id === requestedVaultId ||
      (profileRootPath && path.resolve(candidate.vaultPath) === profileRootPath)
    ) ?? (options.defaultActive === true ? getActiveVaultRecord(vaultLibrary) : null)
    if (!record) return { ok: false, error: 'Vault is not in the vault library.' }
    return { ok: true, record }
  }

  const getCurrentSerializedStateForRecord = (record) => {
    const currentSerializedState = coordinator.getSerializedState()
    if (record.id === profile.vaultId && typeof currentSerializedState === 'string') return currentSerializedState
    const loadResult = loadAppStateResult(record.vaultPath, { userSettingsRoot: userDataPath })
    return loadResult.ok && typeof loadResult.serializedState === 'string' ? loadResult.serializedState : null
  }

  const reloadAfterVaultLibraryChange = (event = 'vault-library-changed') => {
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

  const renameVault = async (_event, payload = {}) => {
    const validation = validateVaultName(payload?.name)
    if (!validation.ok) return { ok: false, error: validation.error, status }
    try {
      const hasVaultSelector =
        (typeof payload?.vaultId === 'string' && payload.vaultId.trim()) ||
        (typeof payload?.vaultPath === 'string' && payload.vaultPath.trim())
      if (!hasVaultSelector) return { ok: false, error: 'Vault is required.', status }
      const resolution = resolveVaultRecordFromPayload(payload)
      if (!resolution.ok) return { ok: false, error: resolution.error, status }
      const record = resolution.record
      const currentPath = path.resolve(record.vaultPath)
      const nextPath = path.join(path.dirname(currentPath), validation.name)
      if (currentPath === nextPath) return { ok: true, status }
      if (!existsSync(currentPath)) {
        return { ok: false, error: 'Vault folder could not be found.', status }
      }
      const renamingActiveVault = record.id === vaultLibrary.activeVaultId
      if (!renamingActiveVault && !existsSync(path.join(getHybridStorageRoot(currentPath), 'manifest.json'))) {
        return { ok: false, error: 'Vault folder could not be loaded.', status }
      }
      if (existsSync(nextPath)) {
        return { ok: false, error: 'A folder with that vault name already exists.', status }
      }
      const nesting = validateVaultFolderNesting(nextPath, { ignoreVaultId: record.id })
      if (!nesting.ok) return { ok: false, error: nesting.error, status }

      if (renamingActiveVault) watcher?.close()
      renameSync(currentPath, nextPath)
      vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, {
        ...record,
        vaultPath: nextPath,
      }, { activate: renamingActiveVault })
      refreshProfileFromLibrary()
      if (!renamingActiveVault) {
        updateStatus('vault-renamed')
        return { ok: true, status }
      }

      const result = coordinator.reloadProfileRoot(nextPath, {
        requireSerializedState: true,
        detectAppSaveEcho: false,
      })
      updateStatus(result.ok ? 'vault-renamed' : 'profile-error', result.ok ? null : result.error)
      startWatcher()
      if (result.ok && typeof result.serializedState === 'string') {
        broadcastAppStateUpdate({
          serializedState: result.serializedState,
          revision: result.revision,
        })
      }
      return { ok: result.ok, status, error: result.ok ? undefined : result.error }
    } catch (error) {
      updateStatus('vault-rename-error', error instanceof Error ? error.message : 'Vault folder could not be renamed.')
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Vault folder could not be renamed.',
        status,
      }
    }
  }

  const maybeTrashSourceProfileRoot = async (sourceProfileRootPath) => {
    if (!existsSync(sourceProfileRootPath)) return null
    if (!shell || typeof shell.trashItem !== 'function') {
      return 'Old vault folder was kept because moving it to Trash is unavailable.'
    }
    try {
      await shell.trashItem(sourceProfileRootPath)
      return null
    } catch (error) {
      return error instanceof Error && error.message
        ? `Old vault folder was kept because it could not be moved to Trash: ${error.message}`
        : 'Old vault folder was kept because it could not be moved to Trash.'
    }
  }

  const replaceProfileWithCurrentData = async (profileRootPath, event = null, options = {}) => {
    const normalizedProfileRootPath = path.resolve(profileRootPath)
    const activeRecord = getActiveVaultRecord(vaultLibrary)
    const nesting = validateVaultFolderNesting(normalizedProfileRootPath, {
      ignoreVaultId: activeRecord?.id,
    })
    if (!nesting.ok) return { ok: false, error: nesting.error, status }
    const serializedState = await getCurrentSerializedStateForProfileMove(event)
    if (serializedState === null) {
      return { ok: false, error: 'Current app state is not ready to move.', status }
    }
    if (!activeRecord) {
      try {
        const record = createVaultRecord(userDataPath, {
          vaultPath: normalizedProfileRootPath,
          serializedState,
        })
        vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, record, { activate: true })
        refreshProfileFromLibrary()
        return switchToVaultRecord(record, 'vault-created', { requireSerializedState: true })
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Vault folder could not be written.',
          status,
        }
      }
    }
    const previousVaultPath = activeRecord.vaultPath
    try {
      saveAppState(normalizedProfileRootPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        vaultId: activeRecord.id,
        replaceExisting: true,
        assetSourceRoot: getHybridStorageRoot(activeRecord.vaultPath),
        syncMetadata: createSyncMetadata('vault-moved'),
      })
      vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, {
        ...activeRecord,
        vaultPath: normalizedProfileRootPath,
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
      if (!result.ok) return { ok: false, error: result.error ?? 'Vault folder could not be loaded.', status }
      if (options.trashSource !== true || !previousVaultPath || previousVaultPath === normalizedProfileRootPath) {
        return { ok: true, status }
      }
      const warning = await maybeTrashSourceProfileRoot(previousVaultPath)
      if (warning) return { ok: true, status, warning }
      return { ok: true, status: updateStatus('profile-moved') }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Vault folder could not be written.',
        status,
      }
    }
  }

  const chooseProfileRoot = async (mode, event = null) => {
    if (profile.setupRequired) {
      return { ok: false, error: 'Create or open a vault before moving its folder.', status }
    }
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: mode === 'move' ? 'Move vault' : 'Choose vault location',
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
        error: 'Vault folder must be empty or contain manifest.json.',
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
      message: targetHasProfile ? 'This folder already contains AisleNote data.' : 'Move vault?',
          detail: targetHasProfile
            ? 'Replacing it will write your current vault into this folder. Current user settings stay in app support.'
            : 'AisleNote will write your current vault into this folder. Current user settings stay in app support.',
        })
        if (moveChoice.response === 2) return { canceled: true, status }
        trashSource = moveChoice.response === 1
      }
      return replaceProfileWithCurrentData(profileRootPath, event, { trashSource })
    }

    if (targetResult.ok && typeof targetResult.serializedState === 'string') {
      const useExistingVaultFolder = () => {
        const openResult = createVaultRecordFromExistingFolder(userDataPath, profileRootPath)
        if (!openResult.ok) return { ok: false, error: openResult.error ?? 'Vault folder could not be loaded.', status }
        vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, openResult.record, { activate: true })
        refreshProfileFromLibrary()
        return switchToVaultRecord(openResult.record, 'profile-changed', { requireSerializedState: true })
      }
      if (!dialog?.showMessageBox) return useExistingVaultFolder()
      const choice = await dialog.showMessageBox({
        type: 'question',
          buttons: ['Use this vault', 'Replace with current data', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        message: 'This folder already contains AisleNote data.',
        detail: 'Use the existing vault in this folder, or replace it with your current vault. Current user settings stay in app support.',
      })
      if (choice.response === 0) return useExistingVaultFolder()
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
        message: 'Use this vault location?',
        detail: 'AisleNote will save your current vault into this folder. Current user settings stay in app support.',
      })
      if (initialize.response !== 0) return { canceled: true, status }
    }
    return replaceProfileWithCurrentData(profileRootPath, event)
  }

  const openVault = async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Open AisleNote vault',
      properties: ['openDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }

    const profileRootPath = path.resolve(selection.filePaths[0])
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }
    const nesting = validateVaultFolderNesting(profileRootPath)
    if (!nesting.ok) return { ok: false, error: nesting.error, status }
    if (!existsSync(path.join(getHybridStorageRoot(profileRootPath), 'manifest.json'))) {
      return {
        ok: false,
        error: 'This folder is not an AisleNote vault. To use Markdown import, create a new vault, then in settings > data > transfer, select "Import Markdown folders".',
        status,
      }
    }

    const openResult = createVaultRecordFromExistingFolder(userDataPath, profileRootPath)
    if (!openResult.ok) {
      return {
        ok: false,
        error: openResult.error ?? 'Vault folder could not be loaded.',
        status,
      }
    }
    vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, openResult.record, { activate: true })
    refreshProfileFromLibrary()
    return switchToVaultRecord(openResult.record, 'vault-opened', { requireSerializedState: true })
  }

  const switchVault = async (_event, payload = {}) => {
    const requestedVaultId = typeof payload?.vaultId === 'string' ? payload.vaultId : ''
    const requestedVaultPath = typeof payload?.vaultPath === 'string' ? payload.vaultPath : ''
    if (!requestedVaultId && !requestedVaultPath.trim()) {
      return { ok: false, error: 'Vault is required.', status }
    }
    const profileRootPath = requestedVaultPath ? path.resolve(requestedVaultPath) : ''
    const record = vaultLibrary.vaults.find((candidate) =>
      candidate.id === requestedVaultId ||
      (profileRootPath && path.resolve(candidate.vaultPath) === profileRootPath)
    )
    if (!record) return { ok: false, error: 'Vault is not in the vault library.', status }
    if (record.id === profile.vaultId) return { ok: true, status }
    return switchToVaultRecord(record, 'vault-switched', { requireSerializedState: true })
  }

  const forgetVault = async (_event, payload = {}) => {
    const requestedVaultId = typeof payload?.vaultId === 'string' ? payload.vaultId : ''
    const requestedVaultPath = typeof payload?.vaultPath === 'string' ? payload.vaultPath : ''
    const profileRootPath = requestedVaultPath ? path.resolve(requestedVaultPath) : ''
    const record = vaultLibrary.vaults.find((candidate) =>
      candidate.id === requestedVaultId ||
      (profileRootPath && path.resolve(candidate.vaultPath) === profileRootPath)
    )
    if (!record) return { ok: false, error: 'Vault is not in the vault library.', status }
    if (record.id === vaultLibrary.activeVaultId) {
      return { ok: false, error: 'The active vault cannot be removed from the list.', status }
    }
    vaultLibrary = removeVaultRecord(userDataPath, vaultLibrary, record.id)
    refreshProfileFromLibrary()
    updateStatus('vault-forgotten')
    return { ok: true, status }
  }

  const chooseVaultLocation = async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.' }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Choose where to save vault',
      buttonLabel: 'Choose Location',
      message: 'Choose where the new vault will be created.',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true }
    const validation = validateVaultLocationPath(selection.filePaths[0])
    if (!validation.ok) return { ok: false, error: validation.error }
    return { ok: true, locationPath: validation.locationPath }
  }

  const createVault = async (_event, payload = {}) => {
    const target = buildVaultTargetPath(payload?.locationPath, payload?.name)
    if (!target.ok) return { ok: false, error: target.error, status }
    if (existsSync(target.profileRootPath)) {
      return {
        ok: false,
        error: 'This folder already exists. Choose a different vault name.',
        status,
      }
    }

    try {
      const record = createVaultRecord(userDataPath, {
        vaultPath: target.profileRootPath,
        serializedState: JSON.stringify(createBlankVaultState()),
      })
      vaultLibrary = upsertVaultRecord(userDataPath, vaultLibrary, record, { activate: true })
      refreshProfileFromLibrary()
      return switchToVaultRecord(record, 'vault-created', { requireSerializedState: true })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Vault folder could not be created.',
        status,
      }
    }
  }

  const deleteVault = async (_event, payload = {}) => {
    const resolution = resolveVaultRecordFromPayload(payload, { defaultActive: true })
    if (!resolution.ok) return { ok: false, error: resolution.error, status }
    const record = resolution.record
    if (!shell || typeof shell.trashItem !== 'function') {
      return { ok: false, error: 'Moving vaults to Trash is unavailable.', status }
    }

    if (dialog?.showMessageBox && payload?.skipConfirmation !== true) {
      const buttons = ['Trash vault', 'Cancel']
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons,
        cancelId: 1,
        defaultId: 0,
        message: 'Delete vault?',
        detail: 'AisleNote will remove this vault from the list and move its folder to Trash.',
      })
      if (choice.response === 1) return { canceled: true, status }
    }

    try {
      if (existsSync(record.vaultPath)) {
        await shell.trashItem(record.vaultPath)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Vault folder could not be moved to Trash.',
        status,
      }
    }

    vaultLibrary = removeVaultRecord(userDataPath, vaultLibrary, record.id)
    const activeRecord = getActiveVaultRecord(vaultLibrary)
    if (activeRecord) {
      reloadAfterVaultLibraryChange('vault-deleted')
    } else {
      refreshProfileFromLibrary()
      coordinator.reloadProfileRoot(profile.profileRootPath, {
        requireSerializedState: false,
        detectAppSaveEcho: false,
      })
      updateStatus('vault-setup-required', 'Create a vault or open an existing vault to start saving.')
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
    updateStatus('vault-setup-required', 'Create a vault or open an existing vault to start saving.')
    startWatcher()
  } else if (!initialLoadResult.ok) {
    markActiveVaultLoadFailure(initialLoadResult, 'startup-error')
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
  ipcMain.handle?.('choose-vault-location', chooseVaultLocation)
  ipcMain.handle?.('create-vault', createVault)
  ipcMain.handle?.('rename-vault', renameVault)
  ipcMain.handle?.('open-vault', openVault)
  ipcMain.handle?.('switch-vault', switchVault)
  ipcMain.handle?.('forget-vault', forgetVault)
  ipcMain.handle?.('delete-vault', deleteVault)
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
    const setupBlocked = requireActiveVault('reveal its folder')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.openPath !== 'function') {
      return { ok: false, error: 'Reveal is unavailable.' }
    }
    const error = await shell.openPath(profile.vaultPath || profile.profileRootPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('reveal-recovered-vault-location', async (_event, payload = {}) => {
    if (!shell || typeof shell.openPath !== 'function') {
      return { ok: false, error: 'Reveal is unavailable.' }
    }
    const selector = normalizeRecoveryRevealSelector(payload)
    const failedVaultPath = selector.hasSelector
      ? getRecoveredVaultPathFromSerializedState(getSerializedStateForRecoveryReveal(coordinator), selector)
      : typeof latestRecovery?.backupVaultPath === 'string'
        ? latestRecovery.backupVaultPath
        : latestRecovery?.failedVaultAvailable === false
        ? null
        : latestRecovery?.failedVaultPath
    if (typeof failedVaultPath !== 'string' || failedVaultPath.length === 0) {
      return { ok: false, error: 'No recovered vault folder is available.' }
    }
    if (!existsSync(failedVaultPath)) {
      return { ok: false, error: 'Recovered vault folder could not be found.' }
    }
    const error = await shell.openPath(failedVaultPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('retry-storage-profile', async () => {
    const setupBlocked = requireActiveVault('reload it')
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
    const setupBlocked = requireActiveVault('import assets')
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
      reconcileActiveVaultAfterLocalWrite('asset-imported')
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Image asset could not be imported.' }
    }
  })

  ipcMain.handle?.('import-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveVault('import assets')
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
      reconcileActiveVaultAfterLocalWrite('asset-imported')
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Asset could not be imported.' }
    }
  })

  ipcMain.handle?.('open-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveVault('open assets')
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
    const setupBlocked = requireActiveVault('reveal assets')
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
    const setupBlocked = requireActiveVault('reveal note files')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Note reveal is unavailable.' }
    }
    try {
      const resolved = resolvePreferredVaultRevealPath({
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

  ipcMain.handle?.('reveal-vault-item-location', async (_event, payload = {}) => {
    const setupBlocked = requireActiveVault('reveal vault items')
    if (setupBlocked) return { ok: false, error: setupBlocked.error }
    if (!shell || typeof shell.showItemInFolder !== 'function') {
      return { ok: false, error: 'Vault item reveal is unavailable.' }
    }
    try {
      const resolved = resolvePreferredVaultRevealPath({
        profileRootPath: profile.profileRootPath,
        payload,
        resolvePath: resolveVaultItemLocationRevealPath,
      })
      if (!resolved.ok) return { ok: false, error: resolved.error }
      shell.showItemInFolder(resolved.absolutePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Vault item could not be revealed.' }
    }
  })

  ipcMain.handle?.('read-asset', async (_event, payload = {}) => {
    const setupBlocked = requireActiveVault('read assets')
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
