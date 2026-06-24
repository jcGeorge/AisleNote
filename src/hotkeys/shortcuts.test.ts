import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  NEWLINE_OPERATION_LABELS,
  SHORTCUT_MENU_ELIGIBLE_OPERATIONS,
  eventMatchesShortcut,
  formatShortcutLabel,
  getNewlineShortcutIdForEvent,
  normalizeHotkeySettings,
} from './shortcuts'

describe('newline shortcut settings', () => {
  it('keeps list operations available without selecting them by default', () => {
    expect(NEWLINE_OPERATION_LABELS.dashList).toBe('dash list')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('dashList')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('bulletList')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('numberedList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('dashList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('bulletList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('numberedList')
  })

  it('exposes explicit left and right aisle operations by default', () => {
    expect(NEWLINE_OPERATION_LABELS.aisleLeft).toBe('aisle to the left')
    expect(NEWLINE_OPERATION_LABELS.aisleRight).toBe('aisle to the right')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('aisleLeft')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('aisleRight')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.commandEnter).toBe('aisleRight')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toEqual([
      'task',
      'aisleLeft',
      'aisleRight',
      'horizontalLine',
      'codeBlock',
      'inlineCode',
      'blockQuote',
      'strikethrough',
    ])
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('aisle' as never)
  })

  it('swaps the default shortcut menu and right-aisle enter actions without changing physical key detection', () => {
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.controlEnter).toBe('operationsMenu')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.commandEnter).toBe('aisleRight')
    expect(
      getNewlineShortcutIdForEvent(
        { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        true,
      ),
    ).toBe('controlEnter')
    expect(
      getNewlineShortcutIdForEvent(
        { key: 'Enter', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false } as KeyboardEvent,
        true,
      ),
    ).toBe('commandEnter')
    expect(
      getNewlineShortcutIdForEvent(
        { key: 'Enter', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false } as KeyboardEvent,
        false,
      ),
    ).toBe('controlEnter')
    expect(
      getNewlineShortcutIdForEvent(
        { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        false,
      ),
    ).toBe('commandEnter')
  })

  it('exposes strikethrough as a menu operation and unbound command shortcut', () => {
    expect(NEWLINE_OPERATION_LABELS.strikethrough).toBe('strikethrough')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('strikethrough')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('strikethrough')
    expect(DEFAULT_SHORTCUTS.formatStrikethrough).toBe('')
  })

  it('keeps block quote and block indent as separate newline operations', () => {
    expect(NEWLINE_OPERATION_LABELS.blockQuote).toBe('block quote')
    expect(NEWLINE_OPERATION_LABELS.blockIndent).toBe('block indent')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('blockQuote')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('blockIndent')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('blockQuote')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('blockIndent')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toHaveLength(8)
  })

  it('labels the operations menu shortcut as shortcut menu', () => {
    expect(NEWLINE_OPERATION_LABELS.operationsMenu).toBe('shortcut menu')
  })

  it('makes table of contents available for shortcut menu configuration without selecting it by default', () => {
    expect(NEWLINE_OPERATION_LABELS.tableOfContents).toBe('table of contents')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('tableOfContents')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).not.toContain('tableOfContents')
  })

  it('normalizes persisted dash-list shortcuts and dedupes menu entries', () => {
    const normalized = normalizeHotkeySettings({
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'dashList',
          shiftEnter: 'dashList',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['dashList', 'dashList', 'bulletList', 'not-real'],
      },
    })

    expect(normalized.shortcuts.toggleNotesTrash).toBe(DEFAULT_SHORTCUTS.toggleNotesTrash)
    expect(normalized.shortcuts.toggleNotesScratchpad).toBe(DEFAULT_SHORTCUTS.toggleNotesScratchpad)
    expect(normalized.shortcuts.toggleNotesFilter).toBe(DEFAULT_SHORTCUTS.toggleNotesFilter)
    expect(normalized.shortcuts.openSettings).toBe(DEFAULT_SHORTCUTS.openSettings)
    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('dashList')
    expect(normalized.newlineShortcuts.shortcuts.shiftEnter).toBe('dashList')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['dashList', 'bulletList', 'strikethrough'])
  })

  it('falls back for invalid aisle shortcut aliases', () => {
    const normalized = normalizeHotkeySettings({
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'aisle',
          shiftEnter: 'aisleLeft',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['task', 'aisle', 'aisleRight', 'aisleLeft'],
      },
    })

    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('operationsMenu')
    expect(normalized.newlineShortcuts.shortcuts.shiftEnter).toBe('aisleLeft')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['task', 'aisleRight', 'aisleLeft', 'strikethrough'])
  })

  it('defaults notes/scratchpad to mod s and matches s key events', () => {
    expect(DEFAULT_SHORTCUTS.toggleNotesScratchpad).toBe('Mod+S')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.toggleNotesScratchpad, true)).toBe('cmd+s')
    expect(
      eventMatchesShortcut(
        { key: 's', code: 'KeyS', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.toggleNotesScratchpad,
        true,
      ),
    ).toBe(true)
    expect(
      eventMatchesShortcut(
        { key: 's', code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.toggleNotesScratchpad,
        false,
      ),
    ).toBe(true)
  })

  it('defaults open settings to mod comma and matches comma key events', () => {
    expect(DEFAULT_SHORTCUTS.openSettings).toBe('Mod+,')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.openSettings, true)).toBe('cmd+,')
    expect(
      eventMatchesShortcut(
        { key: ',', code: 'Comma', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.openSettings,
        true,
      ),
    ).toBe(true)
    expect(
      eventMatchesShortcut(
        { key: ',', code: 'Comma', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.openSettings,
        false,
      ),
    ).toBe(true)
  })

  it('defaults close current note to mod w and matches platform key events', () => {
    expect(DEFAULT_SHORTCUTS.closeCurrentNote).toBe('Mod+W')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.closeCurrentNote, true)).toBe('cmd+w')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.closeCurrentNote, false)).toBe('ctrl+w')
    expect(
      eventMatchesShortcut(
        { key: 'w', code: 'KeyW', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.closeCurrentNote,
        true,
      ),
    ).toBe(true)
    expect(
      eventMatchesShortcut(
        { key: 'w', code: 'KeyW', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.closeCurrentNote,
        false,
      ),
    ).toBe(true)
  })

  it('keeps notes/filter assignable but unbound by default', () => {
    expect(DEFAULT_SHORTCUTS.toggleNotesFilter).toBe('')
    expect(
      eventMatchesShortcut(
        { key: 'f', code: 'KeyF', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.toggleNotesFilter,
        false,
      ),
    ).toBe(false)
  })

  it('normalizes persisted block indent menu entries and shortcuts', () => {
    const normalized = normalizeHotkeySettings({
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'blockIndent',
          shiftEnter: 'blockQuote',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['blockQuote', 'blockIndent', 'blockIndent'],
      },
    })

    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('blockIndent')
    expect(normalized.newlineShortcuts.shortcuts.shiftEnter).toBe('blockQuote')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['blockQuote', 'blockIndent', 'strikethrough'])
  })

  it('normalizes persisted table of contents menu entries and shortcuts', () => {
    const normalized = normalizeHotkeySettings({
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'tableOfContents',
          shiftEnter: 'task',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['tableOfContents', 'tableOfContents', 'blockQuote'],
      },
    })

    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('tableOfContents')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['tableOfContents', 'blockQuote', 'strikethrough'])
  })

  it('defaults aisle cycle shortcuts to alt brackets and recognizes physical bracket keys', () => {
    expect(DEFAULT_SHORTCUTS.cycleAislePrev).toBe('Alt+[')
    expect(DEFAULT_SHORTCUTS.cycleAisleNext).toBe('Alt+]')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.cycleAislePrev, true)).toBe('option+[')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.cycleAisleNext, true)).toBe('option+]')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.cycleAislePrev, false)).toBe('alt+[')
    expect(formatShortcutLabel(DEFAULT_SHORTCUTS.cycleAisleNext, false)).toBe('alt+]')
    expect(
      eventMatchesShortcut(
        { key: '“', code: 'BracketLeft', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.cycleAislePrev,
        true,
      ),
    ).toBe(true)
    expect(
      eventMatchesShortcut(
        { key: ']', code: 'BracketRight', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.cycleAisleNext,
        false,
      ),
    ).toBe(true)
  })

  it('normalizes aisle cycle shortcuts and removed shortcut payloads', () => {
    const normalized = normalizeHotkeySettings({
      shortcuts: {
        removedShortcut: 'Ctrl+Tab',
      },
    })

    expect(normalized.shortcuts).not.toHaveProperty('removedShortcut')
    expect(normalized.shortcuts.cycleAislePrev).toBe('Alt+[')
    expect(normalized.shortcuts.cycleAisleNext).toBe('Alt+]')
    expect(normalized.shortcuts.formatStrikethrough).toBe('')
    expect(normalized.shortcuts.toggleNotesFilter).toBe('')
    expect(normalized.shortcuts.closeCurrentNote).toBe('Mod+W')
  })
})
