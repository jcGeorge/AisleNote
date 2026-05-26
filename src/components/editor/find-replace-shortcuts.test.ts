import { describe, expect, it } from 'vitest'
import { getFindReplaceShortcutMode } from './find-replace-shortcuts'

describe('getFindReplaceShortcutMode', () => {
  it('maps platform find shortcuts to find and replace panel modes', () => {
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, true)).toBe('find')
    expect(getFindReplaceShortcutMode({
      key: 'F',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    } as KeyboardEvent, true)).toBe('replace')
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, false)).toBe('find')
    expect(getFindReplaceShortcutMode({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    } as KeyboardEvent, false)).toBe('replace')
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
