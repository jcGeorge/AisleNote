import { describe, expect, it } from 'vitest'
import { getFindReplaceShortcutMode } from './find-replace-shortcuts'

describe('getFindReplaceShortcutMode', () => {
  it('recognizes platform find shortcuts', () => {
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, true)).toBe('find')
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, false)).toBe('find')
  })

  it('ignores alternate modifier combinations', () => {
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    } as KeyboardEvent, true)).toBeNull()
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, true)).toBeNull()
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, false)).toBeNull()
  })
})
