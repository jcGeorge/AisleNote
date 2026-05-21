import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { IMAGE_ASSET_PROTOCOL_SCHEME, registerImageAssetProtocol } from './image-asset-protocol.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { finishCloseAfterFlush } from './quit-flow.mjs'
import { createNoopUpdateService } from './update-service.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gotSingleInstanceLock = app.requestSingleInstanceLock()
let quitRequested = false
let storageSession = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_ASSET_PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

function focusExistingWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window || window.isDestroyed()) return false
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  return true
}

function openAppWindow() {
  if (!storageSession) return focusExistingWindow()
  createWindow(storageSession)
  return true
}

function isExternalWebUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

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

function installApplicationMenu({ onNewWindow }) {
  const isMac = process.platform === 'darwin'
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }

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
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+N',
          click: onNewWindow,
        },
      ],
    },
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

function createWindow(storageSession) {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.on('close', (event) => {
    if (allowImmediateClose || window.isDestroyed()) return

    event.preventDefault()
    if (closeFlushInProgress) return
    closeFlushInProgress = true

    void (async () => {
      try {
        const stateSnapshot = await withTimeout(
          window.webContents.executeJavaScript(
            `(() => {
              const serializedState = window.__tabsGetLatestAppState?.() ?? null
              const baseRevision = window.__tabsGetAppStateRevision?.() ?? null
              return { serializedState, baseRevision }
            })()`,
            true,
          ),
          1500,
        )
        if (
          typeof stateSnapshot?.serializedState === 'string' &&
          Number.isInteger(stateSnapshot.baseRevision) &&
          storageSession.canWriteAppState()
        ) {
          storageSession.saveAppStateSnapshot(stateSnapshot, window.webContents.id)
        }
      } catch {
        // Fall through to close even if the renderer snapshot cannot be collected.
      } finally {
        closeFlushInProgress = false
        allowImmediateClose = true
        finishCloseAfterFlush({ app, window, quitRequested })
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

  return window
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('before-quit', () => {
    quitRequested = true
  })

  app.on('second-instance', () => {
    openAppWindow()
  })

  app.whenReady().then(() => {
    const updateService = createNoopUpdateService(app)
    storageSession = registerStorageIpc({ ipcMain, app, BrowserWindow, dialog, shell })
    registerImageAssetProtocol({ protocol, net, storageSession })
    installApplicationMenu({ onNewWindow: openAppWindow })
    registerFileIpc({ ipcMain, dialog, storageSession })
    registerClipboardIpc({ ipcMain, clipboard, nativeImage })
    registerUpdateIpc({ ipcMain, updateService })
    ipcMain.handle('open-external-url', async (_event, url) => {
      if (typeof url !== 'string' || !isExternalWebUrl(url)) {
        return { ok: false, error: 'invalid-url' }
      }
      try {
        await shell.openExternal(url)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'open-failed' }
      }
    })

    openAppWindow()

    app.on('activate', () => {
      if (!focusExistingWindow()) {
        openAppWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
