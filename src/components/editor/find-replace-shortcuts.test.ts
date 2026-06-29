import { describe, expect, it } from 'vitest'
import { getSearchShortcutTarget } from './find-replace-shortcuts'

describe('getSearchShortcutTarget', () => {
  it('routes platform find shortcuts to note search', () => {
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, true)).toBe('note')
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, false)).toBe('note')
  })

  it('routes shifted platform find shortcuts to sidebar search', () => {
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    } as KeyboardEvent, true)).toBe('sidebar')
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    } as KeyboardEvent, false)).toBe('sidebar')
  })

  it('ignores alternate modifier combinations', () => {
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    } as KeyboardEvent, true)).toBeNull()
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, true)).toBeNull()
    expect(getSearchShortcutTarget({
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent, false)).toBeNull()
  })
})
