import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'

export function saveAppStateSnapshot(userDataPath, serializedState) {
  if (typeof serializedState !== 'string') return false
  saveAppState(userDataPath, serializedState)
  return true
}

export function registerStorageIpc({ ipcMain, app }) {
  let writesBlockedByLoadFailure = false
  const userDataPath = () => app.getPath('userData')

  const readAppStateResult = () => {
    const result = loadAppStateResult(userDataPath())
    writesBlockedByLoadFailure = !result.ok
    return result
  }

  ipcMain.on('load-app-state', (event) => {
    const result = readAppStateResult()
    event.returnValue = result.ok ? result.serializedState : null
  })

  ipcMain.on('load-app-state-result', (event) => {
    event.returnValue = readAppStateResult()
  })

  ipcMain.on('save-app-state', (event, serializedState) => {
    try {
      if (writesBlockedByLoadFailure) {
        event.returnValue = { ok: false, error: 'App state did not load; refusing to overwrite existing data.' }
        return
      }
      if (typeof serializedState !== 'string') {
        event.returnValue = { ok: false, error: 'Invalid payload' }
        return
      }
      saveAppStateSnapshot(userDataPath(), serializedState)
      event.returnValue = { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      event.returnValue = { ok: false, error: message }
    }
  })

  return {
    canWriteAppState: () => !writesBlockedByLoadFailure,
  }
}
