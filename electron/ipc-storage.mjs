import { existsSync } from 'node:fs'
import path from 'node:path'
import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'
import {
  getHybridStorageRoot,
  listStorageRecoverySnapshots,
  loadAppStateResult,
  restoreStorageRecoverySnapshot,
  saveAppState,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import {
  getStorageProfileNotesPath,
  resolveStorageProfile,
  writeStorageProfileConfig,
} from './storage-profile.mjs'
import { createStorageProfileWatcher } from './storage-watcher.mjs'

function createStorageStatus({ profile, coordinator, event = 'ready', error = null }) {
  const loadResult = coordinator.getLoadResult()
  const hasProfile = existsSync(getHybridStorageRoot(profile.profileRootPath))
  const recoverySnapshots = listStorageRecoverySnapshots(profile.userDataPath ?? profile.profileRootPath)
  return {
    status: loadResult.ok ? 'ready' : 'error',
    health: loadResult.health ?? (loadResult.ok ? 'healthy' : 'error'),
    issues: loadResult.issues ?? [],
    event,
    profileRootPath: profile.profileRootPath,
    notesDataPath: getStorageProfileNotesPath(profile.profileRootPath),
    isDefault: profile.isDefault,
    hasProfile,
    canWrite: coordinator.canWriteAppState(),
    source: loadResult.source,
    schemaVersion: loadResult.schemaVersion,
    conflicts: loadResult.conflicts,
    revision: loadResult.revision,
    recoverySnapshotCount: recoverySnapshots.length,
    latestRecoverySnapshotPath: recoverySnapshots[0]?.path,
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

function getImageExtensionFromImportPayload(payload) {
  if (typeof payload?.extension === 'string' && payload.extension.trim()) {
    return normalizeImageExtension(payload.extension)
  }
  const typeMatch = typeof payload?.type === 'string' ? payload.type.match(/^image\/([a-zA-Z0-9+.-]+)$/) : null
  if (typeMatch) return normalizeImageExtension(typeMatch[1])
  const nameMatch = typeof payload?.name === 'string' ? payload.name.match(/\.([a-zA-Z0-9]+)$/) : null
  return normalizeImageExtension(nameMatch?.[1] ?? 'png')
}

export function registerStorageIpc({ ipcMain, app, BrowserWindow, dialog = null, shell = null }) {
  const userDataPath = app.getPath('userData')
  let profile = { ...resolveStorageProfile(userDataPath), userDataPath }
  const coordinator = createAppStateCoordinator({
    userDataPath,
    profileRootPath: profile.profileRootPath,
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

  const updateStatus = (event = 'ready', error = null) => {
    status = createStorageStatus({ profile, coordinator, event, error })
    broadcastStorageStatus()
    return status
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
            watcher?.reset()
            return
          }
          updateStatus('external-loaded')
          broadcastAppStateUpdate({
            serializedState: result.serializedState,
            revision: result.revision,
          })
          watcher?.reset()
          return
        }
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

  const getCurrentSerializedStateForProfileMove = () => {
    const currentSerializedState = coordinator.getSerializedState()
    if (typeof currentSerializedState === 'string') return currentSerializedState
    const loadResult = coordinator.getLoadResult()
    if (loadResult.ok && typeof loadResult.serializedState === 'string') return loadResult.serializedState
    return null
  }

  const switchToProfileRoot = (profileRootPath, event = 'profile-changed') => {
    const previousProfile = profile
    const result = coordinator.reloadProfileRoot(profileRootPath)
    if (!result.ok) {
      coordinator.reloadProfileRoot(previousProfile.profileRootPath)
      updateStatus('profile-error', result.error)
      return { ok: false, status, error: result.error }
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

  const replaceProfileWithCurrentData = (profileRootPath) => {
    const serializedState = getCurrentSerializedStateForProfileMove()
    if (serializedState === null) {
      return { ok: false, error: 'Current app state is not ready to move.', status }
    }
    try {
      saveAppState(profileRootPath, serializedState, {
        userDataPath,
        replaceExisting: true,
        assetSourceRoot: getHybridStorageRoot(profile.profileRootPath),
      })
      return switchToProfileRoot(profileRootPath, 'profile-moved')
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Storage profile could not be written.',
        status,
      }
    }
  }

  const chooseProfileRoot = async (mode) => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { ok: false, error: 'Folder selection is unavailable.', status }
    }

    const selection = await dialog.showOpenDialog({
      title: mode === 'move' ? 'Move Tabs data to sync folder' : 'Choose Tabs sync folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true, status }

    const profileRootPath = path.resolve(selection.filePaths[0])
    if (profileRootPath === profile.profileRootPath) return { ok: true, status }

    const targetResult = loadAppStateResult(profileRootPath)
    const targetHasProfile = existsSync(getHybridStorageRoot(profileRootPath))

    if (mode === 'move') {
      if (targetHasProfile && dialog?.showMessageBox) {
        const overwrite = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Replace with current data', 'Cancel'],
          cancelId: 1,
          defaultId: 0,
          message: 'This folder already contains Tabs data.',
          detail: 'Replacing it will write your current Tabs profile into this folder. The current source profile is left in place.',
        })
        if (overwrite.response !== 0) return { canceled: true, status }
      }
      return replaceProfileWithCurrentData(profileRootPath)
    }

    if (targetResult.ok && typeof targetResult.serializedState === 'string') {
      if (!dialog?.showMessageBox) return switchToProfileRoot(profileRootPath)
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Use this profile', 'Replace with current data', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        message: 'This folder already contains Tabs data.',
        detail: 'Use the existing profile in this folder, or replace it with your current Tabs data.',
      })
      if (choice.response === 0) return switchToProfileRoot(profileRootPath)
      if (choice.response === 1) return replaceProfileWithCurrentData(profileRootPath)
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
        buttons: ['Move current data', 'Cancel'],
        cancelId: 1,
        defaultId: 0,
        message: 'Use this folder for Tabs data?',
        detail: 'Tabs will create a notes-data folder here and copy your current data into it.',
      })
      if (initialize.response !== 0) return { canceled: true, status }
    }
    return replaceProfileWithCurrentData(profileRootPath)
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
  ipcMain.handle?.('choose-storage-folder', async () => chooseProfileRoot('choose'))
  ipcMain.handle?.('move-storage-profile', async () => chooseProfileRoot('move'))
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
  ipcMain.handle?.('restore-storage-recovery-snapshot', async (_event, payload = {}) => {
    const restoreResult = restoreStorageRecoverySnapshot(
      profile.profileRootPath,
      userDataPath,
      typeof payload?.snapshotPath === 'string' ? payload.snapshotPath : null,
    )
    if (!restoreResult.ok) {
      updateStatus('recovery-error', restoreResult.error)
      return { ok: false, status, error: restoreResult.error }
    }

    const result = coordinator.reloadProfileRoot(profile.profileRootPath)
    updateStatus(result.ok ? 'recovery-restored' : 'recovery-error', result.ok ? null : result.error)
    if (result.ok && typeof result.serializedState === 'string') {
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

  return {
    canWriteAppState: coordinator.canWriteAppState,
    getLoadResult: coordinator.getLoadResult,
    getProfileRootPath: () => profile.profileRootPath,
    getStorageProfileStatus: () => status,
    saveAppStateSnapshot: saveRevisionedState,
    close: () => watcher?.close(),
  }
}
