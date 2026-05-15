import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'

export function registerStorageIpc({ ipcMain, app, BrowserWindow }) {
  const coordinator = createAppStateCoordinator({ userDataPath: app.getPath('userData') })

  const broadcastAppStateUpdate = (payload, sourceWebContentsId) => {
    if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window || window.isDestroyed?.()) continue
      if (window.webContents?.id === sourceWebContentsId) continue
      window.webContents?.send?.('app-state-updated', payload)
    }
  }

  const saveRevisionedState = (payload, sourceWebContentsId) => {
    const result = coordinator.saveRevisionedState(payload)
    if (result.ok) {
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

  ipcMain.on('load-app-state', (event) => {
    const result = coordinator.getLoadResult()
    event.returnValue = result.ok ? result.serializedState : null
  })

  ipcMain.on('load-app-state-result', (event) => {
    event.returnValue = coordinator.getLoadResult()
  })

  ipcMain.on('save-app-state', (event, payload) => {
    try {
      if (!coordinator.canWriteAppState()) {
        event.returnValue = {
          ok: false,
          reason: 'load-failed',
          error: LOAD_FAILED_SAVE_ERROR,
          currentRevision: coordinator.getLoadResult().revision,
          serializedState: coordinator.getLoadResult().serializedState,
        }
        return
      }
      event.returnValue = saveRevisionedState(payload, event.sender?.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      event.returnValue = { ok: false, reason: 'save-failed', error: message }
    }
  })

  return {
    canWriteAppState: coordinator.canWriteAppState,
    getLoadResult: coordinator.getLoadResult,
    saveAppStateSnapshot: saveRevisionedState,
  }
}
