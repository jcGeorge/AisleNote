import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync(path.resolve(process.cwd(), 'electron/main.mjs'), 'utf8')

describe('electron application menu', () => {
  it('removes the visible menu bar outside macOS', () => {
    expect(mainSource).toMatch(/if \(!isMac\) \{[\s\S]*?Menu\.setApplicationMenu\(null\)[\s\S]*?return[\s\S]*?\}/)
  })

  it('keeps multi-cursor accelerators wired outside the visible menu', () => {
    expect(mainSource).toContain("before-input-event")
    expect(mainSource).toContain('getMultilineShortcutDirection(input)')
    expect(mainSource).toContain('sendMultilineShortcutToWindow(window, direction)')
    expect(mainSource).toContain("'Command+Alt+Up'")
    expect(mainSource).toContain("'Command+Alt+Down'")
    expect(mainSource).toContain("'Control+Alt+Up'")
    expect(mainSource).toContain("'Control+Alt+Down'")
    expect(mainSource).not.toContain("'Alt+Shift+Up'")
    expect(mainSource).not.toContain("'Alt+Shift+Down'")
  })

  it('enables the native Electron spellchecker for editor context menu suggestions', () => {
    expect(mainSource).toContain('spellcheck: true')
    expect(mainSource).toContain('configureEditorSpellcheckerForWindow(window, { app })')
  })

  it('keeps a native user-settings reset escape path outside rendered settings UI', () => {
    expect(mainSource).toContain('Reset User Settings to Defaults')
    expect(mainSource).toContain('CommandOrControl+Alt+Shift+R')
    expect(mainSource).toContain('isResetUserSettingsShortcut(input)')
    expect(mainSource).toContain('confirmAndResetUserSettings(window)')
  })

  it('routes native zoom commands through the app zoom notifier', () => {
    expect(mainSource).toContain('APP_ZOOM_LEVEL_STEP = 0.5')
    expect(mainSource).toContain("window.webContents.send('app-zoom-changed'")
    expect(mainSource).toContain('getAppZoomPayload(window.webContents)')
    expect(mainSource).toContain('getZoomShortcutAction(input)')
    expect(mainSource).toContain('applyAppZoom(window, zoomAction)')
    expect(mainSource).toContain("label: 'Actual Size'")
    expect(mainSource).toContain("accelerator: 'CommandOrControl+0'")
    expect(mainSource).toContain("label: 'Zoom In'")
    expect(mainSource).toContain("accelerator: 'CommandOrControl+Plus'")
    expect(mainSource).toContain("label: 'Zoom Out'")
    expect(mainSource).toContain("accelerator: 'CommandOrControl+-'")
    expect(mainSource).not.toContain("{ role: 'resetZoom' }")
    expect(mainSource).not.toContain("{ role: 'zoomIn' }")
    expect(mainSource).not.toContain("{ role: 'zoomOut' }")
  })

  it('does not expose the old native default-vault reset path', () => {
    expect(mainSource).not.toContain('Reset Vault to Blank')
    expect(mainSource).not.toContain('confirmAndResetLocalVault')
    expect(mainSource).not.toContain('resetLocalVaultToBlank')
  })

  it('routes Open Vault to the renderer vault manager instead of a folder picker', () => {
    expect(mainSource).toContain("label: 'Open Vault'")
    expect(mainSource).toContain('openVaultManager')
    expect(mainSource).toContain("window.webContents.send('open-vault-manager')")
    expect(mainSource).not.toContain("label: 'Open Vault',\n          click: () => dialog.showOpenDialog")
  })

  it('wires persisted window bounds into native window creation', () => {
    expect(mainSource).toContain("import { loadWindowState, saveWindowState, watchWindowState } from './window-state.mjs'")
    expect(mainSource).toContain('const restoredWindowState = loadWindowState(userDataPath, screen, defaultWindowBounds)')
    expect(mainSource).toContain('...restoredWindowState.bounds')
    expect(mainSource).toContain('watchWindowState(userDataPath, window)')
    expect(mainSource).toContain('saveWindowState(userDataPath, window)')
    expect(mainSource).toContain('window.maximize()')
  })

  it('leaves Command+W available to the renderer tab/aisle delete shortcut', () => {
    expect(mainSource).not.toContain("{ role: 'close' }")
    expect(mainSource).not.toContain('CommandOrControl+W')
    expect(mainSource).not.toContain('Command+W')
    expect(mainSource).toContain("label: 'Close Window'")
    expect(mainSource).toContain('targetWindow?.close()')
  })
})
