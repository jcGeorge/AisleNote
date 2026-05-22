import { describe, expect, it } from 'vitest'
import { shouldDismissEmptyNoteMentionOnSpace } from './note-mention-keyboard'

describe('note mention keyboard handling', () => {
  it('dismisses an empty @ lookup on Space without requiring a later query refresh', () => {
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ' }, '')).toBe(true)
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: 'Spacebar' }, '')).toBe(true)
  })

  it('keeps multi-word @ searches open when Space follows typed query text', () => {
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ' }, 'my')).toBe(false)
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ' }, 'my house')).toBe(false)
  })

  it('ignores modified Space shortcuts', () => {
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ', metaKey: true }, '')).toBe(false)
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ', ctrlKey: true }, '')).toBe(false)
    expect(shouldDismissEmptyNoteMentionOnSpace({ key: ' ', altKey: true }, '')).toBe(false)
  })
})
