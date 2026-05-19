import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  NEWLINE_OPERATION_LABELS,
  SHORTCUT_MENU_ELIGIBLE_OPERATIONS,
  eventMatchesShortcut,
  normalizeHotkeySettings,
} from './shortcuts'

describe('newline shortcut settings', () => {
  it('exposes dash lists as a labeled shortcut menu operation', () => {
    expect(NEWLINE_OPERATION_LABELS.dashList).toBe('dash list')
    expect(SHORTCUT_MENU_ELIGIBLE_OPERATIONS).toContain('dashList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('dashList')
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
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toHaveLength(10)
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

  it('normalizes missing parent-tab cycle shortcuts to empty strings', () => {
    const normalized = normalizeHotkeySettings({
      shortcuts: {
        cycleSubTabNext: 'Ctrl+Tab',
      },
    })

    expect(normalized.shortcuts.cycleParentTabNext).toBe('')
    expect(normalized.shortcuts.cycleParentTabPrev).toBe('')
    expect(normalized.shortcuts.formatStrikethrough).toBe('')
  })
})
