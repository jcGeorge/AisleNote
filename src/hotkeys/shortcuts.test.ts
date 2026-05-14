import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  NEWLINE_MENU_ELIGIBLE_OPERATIONS,
  NEWLINE_OPERATION_LABELS,
  normalizeHotkeySettings,
} from './shortcuts'

describe('newline shortcut settings', () => {
  it('exposes dash lists as a labeled newline menu operation', () => {
    expect(NEWLINE_OPERATION_LABELS.dashList).toBe('dash list')
    expect(NEWLINE_MENU_ELIGIBLE_OPERATIONS).toContain('dashList')
    expect(DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations).toContain('dashList')
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
    expect(normalized.newlineShortcuts.menuOperations).toEqual(['dashList', 'bulletList'])
  })
})
