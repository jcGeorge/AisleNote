import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  NEWLINE_MENU_ELIGIBLE_OPERATIONS,
  NEWLINE_OPERATION_LABELS,
  eventMatchesShortcut,
  normalizeHotkeySettings,
} from './shortcuts'

describe('newline shortcut settings', () => {
  it('exposes dash lists as a labeled newline menu operation', () => {
    expect(NEWLINE_OPERATION_LABELS.dashList).toBe('dash list')
    expect(NEWLINE_MENU_ELIGIBLE_OPERATIONS).toContain('dashList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('dashList')
  })

  it('exposes strikethrough as a menu operation and unbound command shortcut', () => {
    expect(NEWLINE_OPERATION_LABELS.strikethrough).toBe('strikethrough')
    expect(NEWLINE_MENU_ELIGIBLE_OPERATIONS).toContain('strikethrough')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('strikethrough')
    expect(DEFAULT_SHORTCUTS.formatStrikethrough).toBe('')
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
