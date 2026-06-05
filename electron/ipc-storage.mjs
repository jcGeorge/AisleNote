import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'
import {
  getHybridStorageRoot,
  loadAppStateResult,
  saveAppState,
  writeAssetToProfile,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import {
  getStorageProfileNotebookName,
  resolveStorageProfile,
  validateNotebookName,
  writeStorageProfileConfig,
} from './storage-profile.mjs'
import { createStorageProfileWatcher } from './storage-watcher.mjs'
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

function createStorageStatus({ profile, coordinator, event = 'ready', error = null }) {
  const loadResult = coordinator.getLoadResult()
  const hasProfile = existsSync(getHybridStorageRoot(profile.profileRootPath))
  const notebookPath = getHybridStorageRoot(profile.profileRootPath)
  return {
    status: loadResult.ok ? 'ready' : 'error',
    health: loadResult.health ?? (loadResult.ok ? 'healthy' : 'error'),
    issues: loadResult.issues ?? [],
    event,
    profileRootPath: profile.profileRootPath,
    notebookPath,
    notebookName: getStorageProfileNotebookName(profile.profileRootPath),
    isDefault: profile.isDefault,
    hasProfile,
    canWrite: coordinator.canWriteAppState(),
    source: loadResult.source,
    schemaVersion: loadResult.schemaVersion,
    conflicts: loadResult.conflicts,
    revision: loadResult.revision,
    error: error ?? (loadResult.ok ? undefined : loadResult.error),
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

export function registerStorageIpc({ ipcMain, app, BrowserWindow, dialog = null, shell = null }) {
  const userDataPath = app.getPath('userData')
  let profile = { ...resolveStorageProfile(userDataPath), userDataPath }
  let userSettingsLocation = resolveUserSettingsLocation(userDataPath)
  let userSettingsLocationRefresh = refreshLocalUserSettingsFromLocation(userDataPath, userSettingsLocation)
  if (userSettingsLocationRefresh.location) userSettingsLocation = userSettingsLocationRefresh.location
  let userSettingsLocationStatus = userSettingsLocationRefresh.status
  const loadNotebookResult = (profileRootPath) => loadAppStateResult(profileRootPath, { userSettingsRoot: userDataPath })
  const adoptUserSettingsLocationResult = (result) => {
    if (result?.location) userSettingsLocation = result.location
    return result
  }
  const saveNotebookState = (profileRootPath, serializedState, options = {}) => {
    saveAppState(profileRootPath, serializedState, {
      ...options,
      userDataPath,
      userSettingsRoot: userDataPath,
    })
    const syncResult = adoptUserSettingsLocationResult(
      writeUserSettingsLocationFromState(userDataPath, userSettingsLocation, serializedState),
    )
    if (syncResult.location || !userSettingsLocation.isDefault || !syncResult.ok) {
      updateUserSettingsLocationStatus(syncResult.status)
    }
  }
  const coordinator = createAppStateCoordinator({
    userDataPath,
    profileRootPath: profile.profileRootPath,
    load: loadNotebookResult,
    save: saveNotebookState,
    canonicalizeAfterSave: true,
  })
  let watcher = null
  let status = createStorageStatus({ profile, coordinator })

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

  const updateStatus = (event = 'ready', error = null) => {
    status = createStorageStatus({ profile, coordinator, event, error })
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

  const startWatcher = () => {
    watcher?.close()
    watcher = createStorageProfileWatcher({
      getProfileRootPath: () => profile.profileRootPath,
      onExternalChange: () => {
        const previousSerializedState = coordinator.getSerializedState()
        const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
          requireSerializedState: previousSerializedState !== null,
        })
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
        updateStatus('external-error', result.error ?? 'Existing app state could not be loaded.')
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
    if (!coordinator.canWriteAppState()) {
      return {
        ok: false,
        reason: 'load-failed',
        error: LOAD_FAILED_SAVE_ERROR,
        currentRevision: coordinator.getLoadResult().revision,
        serializedState: coordinator.getLoadResult().serializedState,
      }
    }
    return saveRevisionedState(payload, sourceWebContentsId)
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

  const switchToProfileRoot = (profileRootPath, event = 'profile-changed', options = {}) => {
    const previousProfile = profile
    const result = coordinator.reloadProfileRoot(profileRootPath, {
      requireSerializedState: options.requireSerializedState === true,
    })
    if (!result.ok) {
      coordinator.reloadProfileRoot(previousProfile.profileRootPath)
      updateStatus('profile-error', result.error)
      return { ok: false, status, error: result.error ?? 'Notebook folder could not be loaded.' }
    }
    profile = { ...writeStorageProfileConfig(userDataPath, profileRootPath), userDataPath }
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

  const renameNotebook = async (_event, payload = {}) => {
    const validation = validateNotebookName(payload?.name)
    if (!validation.ok) return { ok: false, error: validation.error, status }
    const nextProfileRootPath = path.join(path.dirname(profile.profileRootPath), validation.name)
    if (nextProfileRootPath === profile.profileRootPath) return { ok: true, status }
    if (existsSync(nextProfileRootPath)) {
      return { ok: false, error: 'A folder with that notebook name already exists.', status }
    }
    try {
      mkdirSync(path.dirname(nextProfileRootPath), { recursive: true })
      watcher?.markAppWrite()
      renameSync(profile.profileRootPath, nextProfileRootPath)
      profile = { ...writeStorageProfileConfig(userDataPath, nextProfileRootPath), userDataPath }
      const result = coordinator.reloadProfileRoot(nextProfileRootPath, { requireSerializedState: true })
      updateStatus(result.ok ? 'notebook-renamed' : 'profile-error', result.ok ? null : result.error)
      startWatcher()
      return result.ok
        ? { ok: true, status }
        : { ok: false, error: result.error ?? 'Renamed notebook could not be loaded.', status }
    } catch (error) {
      updateStatus('notebook-rename-error', error instanceof Error ? error.message : 'Notebook folder could not be renamed.')
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be renamed.',
        status,
      }
    }
  }

  const replaceProfileWithCurrentData = async (profileRootPath, event = null) => {
    const serializedState = await getCurrentSerializedStateForProfileMove(event)
    if (serializedState === null) {
      return { ok: false, error: 'Current app state is not ready to move.', status }
    }
    try {
      saveNotebookState(profileRootPath, serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        replaceExisting: true,
        assetSourceRoot: getHybridStorageRoot(profile.profileRootPath),
      })
      return switchToProfileRoot(profileRootPath, 'profile-moved')
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

    const profileRootPath = path.resolve(selection.filePaths[0])
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }

    const targetResult = loadNotebookResult(profileRootPath)
    const targetHasProfile = existsSync(path.join(getHybridStorageRoot(profileRootPath), 'manifest.json'))
    const targetHasEntries = notebookDirectoryHasEntries(profileRootPath)

    if (!targetHasProfile && targetHasEntries && !targetResult.ok) {
      return {
        ok: false,
        error: 'Notebook folder must be empty or contain manifest.json.',
        status,
      }
    }

    if (mode === 'move') {
      if (targetHasProfile && dialog?.showMessageBox) {
        const overwrite = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Replace with current data', 'Cancel'],
          cancelId: 1,
          defaultId: 0,
          message: 'This folder already contains Tabs data.',
          detail: 'Replacing it will write your current notebook into this folder. Current user settings stay in app support.',
        })
        if (overwrite.response !== 0) return { canceled: true, status }
      }
      return replaceProfileWithCurrentData(profileRootPath, event)
    }

    if (targetResult.ok && typeof targetResult.serializedState === 'string') {
      if (!dialog?.showMessageBox) return switchToProfileRoot(profileRootPath)
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Use this notebook folder', 'Replace with current data', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        message: 'This folder already contains Tabs data.',
        detail: 'Use the existing notebook in this folder, or replace it with your current notebook. Current user settings stay in app support.',
      })
      if (choice.response === 0) return switchToProfileRoot(profileRootPath)
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

  const switchNotebook = async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Switch notebook',
      properties: ['openDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }

    const profileRootPath = path.resolve(selection.filePaths[0])
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }

    const targetResult = loadNotebookResult(profileRootPath)
    if (targetResult.ok && typeof targetResult.serializedState === 'string') {
      return switchToProfileRoot(profileRootPath, 'notebook-switched', { requireSerializedState: true })
    }
    if (targetResult.ok && targetResult.serializedState === null) {
      return {
        ok: false,
        error: 'This folder does not contain a notebook. Use new notebook to create one.',
        status,
      }
    }
    return {
      ok: false,
      error: targetResult.error ?? 'Notebook folder could not be loaded.',
      status,
    }
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
      saveNotebookState(target.profileRootPath, payload.serializedState, {
        userDataPath,
        userSettingsRoot: userDataPath,
        assetSourceRoot: getHybridStorageRoot(profile.profileRootPath),
      })
      return switchToProfileRoot(target.profileRootPath, 'notebook-created', { requireSerializedState: true })
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be created.',
        status,
      }
    }
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

  startWatcher()

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
  ipcMain.handle?.('switch-notebook', switchNotebook)
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
    const error = await shell.openPath(profile.profileRootPath)
    return error ? { ok: false, error } : { ok: true }
  })
  ipcMain.handle?.('retry-storage-profile', async () => {
    const result = coordinator.reloadProfileRoot(profile.profileRootPath, {
      requireSerializedState: coordinator.getSerializedState() !== null,
      detectAppSaveEcho: false,
    })
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
      return { ok: true, ...result }
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
      return { ok: true, ...result }
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
    resetUserSettingsToDefaults,
    saveRendererAppState: saveRevisionedState,
    scanStorageProfile: () => watcher?.scan(),
    close: () => watcher?.close(),
  }
}
