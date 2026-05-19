import { describe, expect, it } from 'vitest'
import {
  getShortcutMenuKeyboardAction,
  getShortcutMenuNumberIndex,
  isShortcutMenuKeyboardKey,
} from './shortcut-menu-keyboard'

describe('shortcut menu keyboard handling', () => {
  it('wraps arrow navigation and handles Home/End', () => {
    expect(getShortcutMenuKeyboardAction({ key: 'ArrowDown' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getShortcutMenuKeyboardAction({ key: 'ArrowUp' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getShortcutMenuKeyboardAction({ key: 'Home' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getShortcutMenuKeyboardAction({ key: 'End' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
  })

  it('runs the active item on Enter and number shortcuts by index', () => {
    expect(getShortcutMenuKeyboardAction({ key: 'Enter' }, 1, 3)).toEqual({ type: 'run', index: 1 })
    expect(getShortcutMenuKeyboardAction({ key: '3' }, 0, 4)).toEqual({ type: 'run', index: 2 })
    expect(getShortcutMenuKeyboardAction({ key: '0' }, 0, 10)).toEqual({ type: 'run', index: 9 })
    expect(getShortcutMenuNumberIndex('4')).toBe(3)
  })

  it('captures menu keys without capturing modifier variants', () => {
    expect(isShortcutMenuKeyboardKey({ key: 'ArrowDown' })).toBe(true)
    expect(isShortcutMenuKeyboardKey({ key: 'Enter' })).toBe(true)
    expect(isShortcutMenuKeyboardKey({ key: '2' })).toBe(true)
    expect(isShortcutMenuKeyboardKey({ key: 'ArrowDown', metaKey: true })).toBe(false)
    expect(isShortcutMenuKeyboardKey({ key: 'Escape', metaKey: true })).toBe(true)
  })
})
