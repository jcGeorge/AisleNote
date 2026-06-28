import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, protocol, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { IMAGE_ASSET_PROTOCOL_SCHEME, registerImageAssetProtocol } from './image-asset-protocol.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { registerDiagnosticIpc } from './ipc-diagnostics.mjs'
import { configureEditorSpellcheckerForWindow, createEditorContextMenuIpc } from './editor-context-menu.mjs'
import { registerPrintIpc } from './print-aisle.mjs'
import { finishCloseAfterFlush } from './quit-flow.mjs'
import { createNoopUpdateService } from './update-service.mjs'
import { loadWindowState, saveWindowState, watchWindowState } from './window-state.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gotSingleInstanceLock = app.requestSingleInstanceLock()
let quitRequested = false
let storageSession = null
let editorContextMenuIpc = null
const APP_ZOOM_LEVEL_STEP = 0.5
const APP_ZOOM_MIN_LEVEL = -6
const APP_ZOOM_MAX_LEVEL = 6

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

function focusWindow(window) {
  if (!window || window.isDestroyed()) return false
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
  return true
}

function sendOpenVaultManagerToWindow(window) {
  if (!window || window.isDestroyed()) return
  const sendNavigationEvent = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('open-vault-manager')
    }
  }
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => setTimeout(sendNavigationEvent, 100))
    return
  }
  sendNavigationEvent()
}

function openVaultManager() {
  const existingWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (existingWindow && !existingWindow.isDestroyed()) {
    focusWindow(existingWindow)
    sendOpenVaultManagerToWindow(existingWindow)
    return
  }
  if (!storageSession) return
  const window = createWindow(storageSession)
  focusWindow(window)
  sendOpenVaultManagerToWindow(window)
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
  void window.webContents.executeJavaScript(`window.__aislenoteHandleMultilineShortcut?.(${JSON.stringify(direction)})`, true)
}

function sendPrintActiveAisleRequestToWindow(window) {
  if (!window || window.isDestroyed()) return
  const sendPrintEvent = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('print-active-aisle-requested')
    }
  }
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => setTimeout(sendPrintEvent, 100))
    return
  }
  sendPrintEvent()
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

function printFocusedAisle() {
  sendPrintActiveAisleRequestToWindow(BrowserWindow.getFocusedWindow())
}

function clampAppZoomLevel(zoomLevel) {
  if (!Number.isFinite(zoomLevel)) return 0
  return Math.min(APP_ZOOM_MAX_LEVEL, Math.max(APP_ZOOM_MIN_LEVEL, zoomLevel))
}

function getAppZoomPayload(webContents) {
  const zoomLevel = webContents.getZoomLevel()
  const zoomFactor = webContents.getZoomFactor()
  return {
    zoomLevel,
    zoomFactor,
    percent: Math.round(zoomFactor * 100),
  }
}

function sendAppZoomChanged(window) {
  if (!window || window.isDestroyed()) return
  window.webContents.send('app-zoom-changed', getAppZoomPayload(window.webContents))
}

function applyAppZoom(window, action) {
  if (!window || window.isDestroyed()) return
  const webContents = window.webContents
  if (action === 'reset') {
    webContents.setZoomLevel(0)
    sendAppZoomChanged(window)
    return
  }
  const direction = action === 'in' ? 1 : -1
  webContents.setZoomLevel(clampAppZoomLevel(webContents.getZoomLevel() + direction * APP_ZOOM_LEVEL_STEP))
  sendAppZoomChanged(window)
}

function zoomFocusedWindow(action) {
  applyAppZoom(BrowserWindow.getFocusedWindow(), action)
}

async function confirmAndResetUserSettings(window = BrowserWindow.getFocusedWindow()) {
  if (!storageSession?.resetUserSettingsToDefaults) return
  const confirmation = await dialog.showMessageBox(window ?? undefined, {
    type: 'warning',
    buttons: ['Reset user settings', 'Cancel'],
    cancelId: 1,
    defaultId: 1,
    message: 'Reset user settings to defaults?',
    detail: 'This resets theme, hotkeys, shortcuts, toolbar layouts, and app preferences. Vault content is not changed.',
  })
  if (confirmation.response !== 0) return
  const result = await storageSession.resetUserSettingsToDefaults()
  if (!result?.ok) {
    dialog.showErrorBox('User settings reset failed', result?.error ?? 'User settings could not be reset.')
  }
}

function installApplicationMenu({ onNewWindow, onOpenVault, onPrintAisle, onResetUserSettings }) {
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
        {
          label: 'Open Vault',
          click: onOpenVault,
        },
        {
          label: 'Print Aisle',
          accelerator: 'CommandOrControl+P',
          click: onPrintAisle,
        },
        { type: 'separator' },
        {
          label: 'Reset User Settings to Defaults',
          accelerator: 'CommandOrControl+Alt+Shift+R',
          click: onResetUserSettings,
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Add Cursor Above',
          accelerator: isMac ? 'Command+Alt+Up' : 'Control+Alt+Up',
          visible: false,
          acceleratorWorksWhenHidden: true,
          registerAccelerator: true,
          click: () => sendMultilineShortcut('up'),
        },
        {
          label: 'Add Cursor Below',
          accelerator: isMac ? 'Command+Alt+Down' : 'Control+Alt+Down',
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
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CommandOrControl+0',
          click: () => zoomFocusedWindow('reset'),
        },
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+Plus',
          click: () => zoomFocusedWindow('in'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: () => zoomFocusedWindow('out'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        {
          label: 'Close Window',
          click: (_menuItem, browserWindow) => {
            const targetWindow = browserWindow ?? BrowserWindow.getFocusedWindow()
            targetWindow?.close()
          },
        },
      ],
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

  if (!input.control || !input.alt || input.meta || input.shift) return null
  return isUp ? 'up' : 'down'
}

function isResetUserSettingsShortcut(input) {
  if (input.type !== 'keyDown') return false
  const key = typeof input.key === 'string' ? input.key.toLowerCase() : ''
  const code = typeof input.code === 'string' ? input.code.toLowerCase() : ''
  const isR = key === 'r' || code === 'keyr'
  if (!isR || !input.alt || !input.shift) return false
  return process.platform === 'darwin' ? Boolean(input.meta && !input.control) : Boolean(input.control && !input.meta)
}

function getZoomShortcutAction(input) {
  if (input.type !== 'keyDown') return null
  const key = typeof input.key === 'string' ? input.key.toLowerCase() : ''
  const code = typeof input.code === 'string' ? input.code.toLowerCase() : ''
  const hasModifier = process.platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (!hasModifier || input.alt) return null
  if (key === '+' || key === '=' || code === 'equal' || code === 'numpadadd') return 'in'
  if (key === '-' || key === '_' || code === 'minus' || code === 'numpadsubtract') return 'out'
  if (key === '0' || key === ')' || code === 'digit0' || code === 'numpad0') return 'reset'
  return null
}

function isPrintShortcut(input) {
  if (input.type !== 'keyDown') return false
  const key = typeof input.key === 'string' ? input.key.toLowerCase() : ''
  const code = typeof input.code === 'string' ? input.code.toLowerCase() : ''
  const isP = key === 'p' || code === 'keyp'
  if (!isP || input.alt || input.shift) return false
  return process.platform === 'darwin' ? Boolean(input.meta && !input.control) : Boolean(input.control && !input.meta)
}

function getAppPngIconPath() {
  return path.join(app.getAppPath(), 'build', 'icon.png')
}

function getWindowIconPath() {
  if (process.platform === 'darwin') return undefined
  return getAppPngIconPath()
}

function applyMacDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return
  const appIcon = nativeImage.createFromPath(getAppPngIconPath())
  if (!appIcon.isEmpty()) {
    app.dock.setIcon(appIcon)
  }
}

function createWindow(storageSession) {
  const userDataPath = app.getPath('userData')
  const defaultWindowBounds = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
  }
  const restoredWindowState = loadWindowState(userDataPath, screen, defaultWindowBounds)
  const windowIconPath = getWindowIconPath()
  const window = new BrowserWindow({
    ...restoredWindowState.bounds,
    minWidth: defaultWindowBounds.minWidth,
    minHeight: defaultWindowBounds.minHeight,
    backgroundColor: '#0b1220',
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  watchWindowState(userDataPath, window)
  if (restoredWindowState.isMaximized) {
    window.maximize()
  }
  let allowImmediateClose = false
  let closeFlushInProgress = false

  window.webContents.on('before-input-event', (event, input) => {
    if (process.platform !== 'darwin') {
      if (isPrintShortcut(input)) {
        event.preventDefault()
        printFocusedAisle()
        return
      }
      const zoomAction = getZoomShortcutAction(input)
      if (zoomAction) {
        event.preventDefault()
        applyAppZoom(window, zoomAction)
        return
      }
    }
    if (isResetUserSettingsShortcut(input)) {
      event.preventDefault()
      void confirmAndResetUserSettings(window)
      return
    }
    if (input.type !== 'keyDown') return
    const direction = getMultilineShortcutDirection(input)
    if (!direction) return
    event.preventDefault()
    sendMultilineShortcutToWindow(window, direction)
  })
  editorContextMenuIpc?.attachToWindow(window)
  configureEditorSpellcheckerForWindow(window, { app })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.on('close', (event) => {
    if (allowImmediateClose || window.isDestroyed()) return

    saveWindowState(userDataPath, window)
    event.preventDefault()
    if (closeFlushInProgress) return
    closeFlushInProgress = true

    void (async () => {
      try {
        const rendererState = await withTimeout(
          window.webContents.executeJavaScript(
            `(() => {
              const serializedState = window.__aislenoteGetLatestAppState?.() ?? null
              const baseRevision = window.__aislenoteGetAppStateRevision?.() ?? null
              return { serializedState, baseRevision }
            })()`,
            true,
          ),
          1500,
        )
        if (
          typeof rendererState?.serializedState === 'string' &&
          Number.isInteger(rendererState.baseRevision) &&
          storageSession.canWriteAppState()
        ) {
          storageSession.saveRendererAppState(rendererState, window.webContents.id)
        }
      } catch {
        // Fall through to close even if the renderer state cannot be collected.
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
    applyMacDockIcon()
    const updateService = createNoopUpdateService(app)
    storageSession = registerStorageIpc({ ipcMain, app, BrowserWindow, dialog, shell })
    editorContextMenuIpc = createEditorContextMenuIpc({ ipcMain, BrowserWindow })
    registerImageAssetProtocol({ protocol, storageSession })
    installApplicationMenu({
      onNewWindow: openAppWindow,
      onOpenVault: openVaultManager,
      onPrintAisle: printFocusedAisle,
      onResetUserSettings: () => confirmAndResetUserSettings(),
    })
    registerPrintIpc({
      ipcMain,
      BrowserWindow,
      dialog,
      preloadPath: path.join(__dirname, 'preload.cjs'),
      appIndexPath: path.join(__dirname, '..', 'dist', 'index.html'),
    })
    registerFileIpc({ ipcMain, dialog, storageSession })
    registerClipboardIpc({ ipcMain, clipboard, nativeImage })
    registerUpdateIpc({ ipcMain, updateService })
    registerDiagnosticIpc({ ipcMain, app, shell })
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
