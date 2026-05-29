import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  NEWLINE_OPERATION_LABELS,
  SHORTCUT_MENU_ELIGIBLE_OPERATIONS,
  eventMatchesShortcut,
  formatShortcutLabel,
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
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.controlEnter).toBe('aisleRight')
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

    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('dashList')
    expect(normalized.newlineShortcuts.shortcuts.shiftEnter).toBe('dashList')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['dashList', 'bulletList', 'strikethrough'])
  })

  it('migrates legacy generic aisle shortcut settings to aisle right', () => {
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

    expect(normalized.newlineShortcuts.shortcuts.controlEnter).toBe('aisleRight')
    expect(normalized.newlineShortcuts.shortcuts.shiftEnter).toBe('aisleLeft')
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['task', 'aisleRight', 'aisleLeft', 'strikethrough'])
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

  it('keeps parent-tab cycle shortcuts assignable but unbound by default', () => {
    expect(DEFAULT_SHORTCUTS.cycleParentTabNext).toBe('')
    expect(DEFAULT_SHORTCUTS.cycleParentTabPrev).toBe('')
    expect(
      eventMatchesShortcut(
        { key: 'Tab', code: 'Tab', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent,
        DEFAULT_SHORTCUTS.cycleParentTabNext,
        false,
      ),
    ).toBe(false)
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

  it('normalizes missing parent-tab cycle shortcuts to empty strings', () => {
    const normalized = normalizeHotkeySettings({
      shortcuts: {
        cycleSubTabNext: 'Ctrl+Tab',
      },
    })

    expect(normalized.shortcuts.cycleParentTabNext).toBe('')
    expect(normalized.shortcuts.cycleParentTabPrev).toBe('')
    expect(normalized.shortcuts.cycleAislePrev).toBe('Alt+[')
    expect(normalized.shortcuts.cycleAisleNext).toBe('Alt+]')
    expect(normalized.shortcuts.formatStrikethrough).toBe('')
  })
})
