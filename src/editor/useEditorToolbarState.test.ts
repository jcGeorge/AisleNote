import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { getToolbarFormatShortcutForEvent } from './useEditorToolbarState'

const hotkeysWithShortcuts = (
  shortcuts: Partial<AppState['hotkeys']['shortcuts']> = {},
): AppState['hotkeys'] => ({
  shortcuts: {
    ...DEFAULT_SHORTCUTS,
    ...shortcuts,
  },
  newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
})

const keyboardEvent = (
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {},
): KeyboardEvent =>
  ({
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }) as KeyboardEvent

describe('toolbar format shortcut resolution', () => {
  it('does not treat primary-modifier s as strikethrough when strikethrough is unbound', () => {
    const hotkeys = hotkeysWithShortcuts({ formatStrikethrough: '' })

    expect(getToolbarFormatShortcutForEvent(keyboardEvent('s', { metaKey: true }), hotkeys, true)).toBeNull()
    expect(getToolbarFormatShortcutForEvent(keyboardEvent('s', { ctrlKey: true }), hotkeys, false)).toBeNull()
  })

  it('runs strikethrough only through the configured strikethrough shortcut', () => {
    const hotkeys = hotkeysWithShortcuts({ formatStrikethrough: 'Mod+Shift+S' })

    expect(
      getToolbarFormatShortcutForEvent(
        keyboardEvent('s', { metaKey: true, shiftKey: true }),
        hotkeys,
        true,
      ),
    ).toBe('strike')
    expect(getToolbarFormatShortcutForEvent(keyboardEvent('s', { metaKey: true }), hotkeys, true)).toBeNull()
  })

  it('runs highlight through the configured highlight shortcut', () => {
    const hotkeys = hotkeysWithShortcuts()

    expect(
      getToolbarFormatShortcutForEvent(
        keyboardEvent('h', { metaKey: true, shiftKey: true }),
        hotkeys,
        true,
      ),
    ).toBe('highlight')
    expect(
      getToolbarFormatShortcutForEvent(
        keyboardEvent('h', { ctrlKey: true, shiftKey: true }),
        hotkeys,
        false,
      ),
    ).toBe('highlight')
    expect(getToolbarFormatShortcutForEvent(keyboardEvent('h', { metaKey: true }), hotkeys, true)).toBeNull()
  })

  it('keeps built-in bold and italic toolbar shortcuts', () => {
    const hotkeys = hotkeysWithShortcuts()

    expect(getToolbarFormatShortcutForEvent(keyboardEvent('b', { metaKey: true }), hotkeys, true)).toBe('bold')
    expect(getToolbarFormatShortcutForEvent(keyboardEvent('i', { ctrlKey: true }), hotkeys, false)).toBe('italic')
  })
})
