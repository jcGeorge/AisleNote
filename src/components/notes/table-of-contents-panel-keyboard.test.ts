import { describe, expect, it } from 'vitest'
import {
  getTableOfContentsPanelKeyboardAction,
  isTableOfContentsPanelKeyboardKey,
} from './table-of-contents-panel-keyboard'

describe('table of contents panel keyboard handling', () => {
  it('wraps arrow navigation across panel items', () => {
    expect(getTableOfContentsPanelKeyboardAction({ key: 'ArrowDown' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getTableOfContentsPanelKeyboardAction({ key: 'ArrowRight' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getTableOfContentsPanelKeyboardAction({ key: 'ArrowUp' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getTableOfContentsPanelKeyboardAction({ key: 'ArrowLeft' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
  })

  it('handles Home/End and runs the highlighted item on Enter', () => {
    expect(getTableOfContentsPanelKeyboardAction({ key: 'Home' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getTableOfContentsPanelKeyboardAction({ key: 'End' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getTableOfContentsPanelKeyboardAction({ key: 'Enter' }, 1, 3)).toEqual({ type: 'run', index: 1 })
    expect(getTableOfContentsPanelKeyboardAction({ key: ' ' }, 1, 3)).toEqual({ type: 'run', index: 1 })
  })

  it('captures panel keys without capturing modifier variants', () => {
    expect(isTableOfContentsPanelKeyboardKey({ key: 'ArrowDown' })).toBe(true)
    expect(isTableOfContentsPanelKeyboardKey({ key: 'Enter' })).toBe(true)
    expect(isTableOfContentsPanelKeyboardKey({ key: 'ArrowDown', metaKey: true })).toBe(false)
    expect(isTableOfContentsPanelKeyboardKey({ key: 'Escape', metaKey: true })).toBe(true)
  })
})
