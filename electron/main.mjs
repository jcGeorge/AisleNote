import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAppStateExportArchive, loadAppState, saveAppState } from './app-state-storage.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  let allowImmediateClose = false
  let closeFlushInProgress = false

  window.on('close', (event) => {
    if (allowImmediateClose || window.isDestroyed()) return

    event.preventDefault()
    if (closeFlushInProgress) return
    closeFlushInProgress = true

    void (async () => {
      try {
        const serializedState = await window.webContents.executeJavaScript(
          'window.__tabsGetLatestAppState?.() ?? null',
          true,
        )
        if (typeof serializedState === 'string') {
          saveAppState(app.getPath('userData'), serializedState)
        }
      } catch {
        // Fall through to close even if the renderer snapshot cannot be collected.
      } finally {
        closeFlushInProgress = false
        allowImmediateClose = true
        if (!window.isDestroyed()) {
          window.close()
        }
      }
    })()
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.on('load-app-state', (event) => {
    event.returnValue = loadAppState(app.getPath('userData'))
  })

  ipcMain.on('save-app-state', (event, serializedState) => {
    try {
      if (typeof serializedState !== 'string') {
        event.returnValue = { ok: false, error: 'Invalid payload' }
        return
      }
      saveAppState(app.getPath('userData'), serializedState)
      event.returnValue = { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      event.returnValue = { ok: false, error: message }
    }
  })

  ipcMain.handle('save-file', async (_event, payload) => {
    const { defaultPath, data } = payload ?? {}
    if (!(data instanceof ArrayBuffer)) return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'notes-export.zip',
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    const bytes = Buffer.from(new Uint8Array(data))
    writeFileSync(saveResult.filePath, bytes)
    return { canceled: false, filePath: saveResult.filePath }
  })

  ipcMain.handle('export-app-state', async (_event, payload) => {
    const { defaultPath, serializedState } = payload ?? {}
    if (typeof serializedState !== 'string') return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'notes-export.zip',
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    try {
      const bytes = await buildAppStateExportArchive(serializedState)
      writeFileSync(saveResult.filePath, bytes)
      return { canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { canceled: false, error: message }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
