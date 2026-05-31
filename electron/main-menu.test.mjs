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

  it('keeps a native user-settings reset escape path outside rendered settings UI', () => {
    expect(mainSource).toContain('Reset User Settings to Defaults')
    expect(mainSource).toContain('CommandOrControl+Alt+Shift+R')
    expect(mainSource).toContain('isResetUserSettingsShortcut(input)')
    expect(mainSource).toContain('confirmAndResetUserSettings(window)')
  })
})
