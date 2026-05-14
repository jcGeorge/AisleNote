import { describe, expect, it } from 'vitest'
import {
  getNewlineMenuKeyboardAction,
  getNewlineMenuNumberIndex,
  isNewlineMenuKeyboardKey,
} from './newline-menu-keyboard'

describe('newline menu keyboard handling', () => {
  it('wraps arrow navigation and handles Home/End', () => {
    expect(getNewlineMenuKeyboardAction({ key: 'ArrowDown' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getNewlineMenuKeyboardAction({ key: 'ArrowUp' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getNewlineMenuKeyboardAction({ key: 'Home' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getNewlineMenuKeyboardAction({ key: 'End' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
  })

  it('runs the active item on Enter and number shortcuts by index', () => {
    expect(getNewlineMenuKeyboardAction({ key: 'Enter' }, 1, 3)).toEqual({ type: 'run', index: 1 })
    expect(getNewlineMenuKeyboardAction({ key: '3' }, 0, 4)).toEqual({ type: 'run', index: 2 })
    expect(getNewlineMenuKeyboardAction({ key: '0' }, 0, 10)).toEqual({ type: 'run', index: 9 })
    expect(getNewlineMenuNumberIndex('4')).toBe(3)
  })

  it('captures menu keys without capturing modifier variants', () => {
    expect(isNewlineMenuKeyboardKey({ key: 'ArrowDown' })).toBe(true)
    expect(isNewlineMenuKeyboardKey({ key: 'Enter' })).toBe(true)
    expect(isNewlineMenuKeyboardKey({ key: '2' })).toBe(true)
    expect(isNewlineMenuKeyboardKey({ key: 'ArrowDown', metaKey: true })).toBe(false)
    expect(isNewlineMenuKeyboardKey({ key: 'Escape', metaKey: true })).toBe(true)
  })
})
