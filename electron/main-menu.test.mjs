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

  it('keeps a native local-notebook reset escape path outside rendered settings UI', () => {
    expect(mainSource).toContain('Reset Local Notebook to Blank')
    expect(mainSource).toContain('confirmAndResetLocalNotebook')
    expect(mainSource).toContain('resetLocalNotebookToBlank')
  })

  it('leaves Command+W available to the renderer tab/aisle delete shortcut', () => {
    expect(mainSource).not.toContain("{ role: 'close' }")
    expect(mainSource).not.toContain('CommandOrControl+W')
    expect(mainSource).not.toContain('Command+W')
    expect(mainSource).toContain("label: 'Close Window'")
    expect(mainSource).toContain('targetWindow?.close()')
  })
})
