import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAppStateExportArchive, loadAppState, saveAppState } from './app-state-storage.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sendMultilineShortcutToWindow(window, direction) {
  if (!window || window.isDestroyed()) return
  void window.webContents.executeJavaScript(`window.__tabsHandleMultilineShortcut?.(${JSON.stringify(direction)})`, true)
}

function withTimeout(promise, timeoutMs) {
  let timeoutId
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timed out.')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId)
  })
}

function sendMultilineShortcut(direction) {
  sendMultilineShortcutToWindow(BrowserWindow.getFocusedWindow(), direction)
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Add Cursor Above',
          accelerator: isMac ? 'Command+Alt+Up' : 'Alt+Shift+Up',
          visible: false,
          acceleratorWorksWhenHidden: true,
          registerAccelerator: true,
          click: () => sendMultilineShortcut('up'),
        },
        {
          label: 'Add Cursor Below',
          accelerator: isMac ? 'Command+Alt+Down' : 'Alt+Shift+Down',
          visible: false,
          acceleratorWorksWhenHidden: true,
          registerAccelerator: true,
          click: () => sendMultilineShortcut('down'),
        },
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function getMultilineShortcutDirection(input) {
  const isMac = process.platform === 'darwin'
  const key = typeof input.key === 'string' ? input.key.toLowerCase() : ''
  const code = typeof input.code === 'string' ? input.code.toLowerCase() : ''
  const isUp =
    key === 'up' || key === 'arrowup' || key === 'home' || code === 'arrowup' || code === 'home' || code === 'uparrow'
  const isDown =
    key === 'down' ||
    key === 'arrowdown' ||
    key === 'end' ||
    code === 'arrowdown' ||
    code === 'end' ||
    code === 'downarrow'

  if (!isUp && !isDown) return null

  if (isMac) {
    if (!input.meta || !input.alt || input.control || input.shift) return null
    return isUp ? 'up' : 'down'
  }

  if (!input.alt || !input.shift || input.meta || input.control) return null
  return isUp ? 'up' : 'down'
}

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

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const direction = getMultilineShortcutDirection(input)
    if (!direction) return
    event.preventDefault()
    sendMultilineShortcutToWindow(window, direction)
  })

  window.on('close', (event) => {
    if (allowImmediateClose || window.isDestroyed()) return

    event.preventDefault()
    if (closeFlushInProgress) return
    closeFlushInProgress = true

    void (async () => {
      try {
        const serializedState = await withTimeout(
          window.webContents.executeJavaScript(
            'window.__tabsGetLatestAppState?.() ?? null',
            true,
          ),
          1500,
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
  installApplicationMenu()

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

  ipcMain.handle('copy-image-data-url', async (_event, dataUrl) => {
    try {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return { ok: false, error: 'Invalid image payload' }
      }
      const image = nativeImage.createFromDataURL(dataUrl)
      if (image.isEmpty()) {
        return { ok: false, error: 'Empty image payload' }
      }
      clipboard.writeImage(image)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, error: message }
    }
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
