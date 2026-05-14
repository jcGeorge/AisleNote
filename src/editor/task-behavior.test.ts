import { describe, expect, it } from 'vitest'
import { EMPTY_LIST_ITEM_PLACEHOLDER, reorderListMarkdownLines } from './list-reorder-markdown'
import {
  getListReorderPointerDecision,
  shouldUseManualListCaretPlacement,
} from './task-behavior'

describe('list markdown reordering', () => {
  it('reorders task lines within one contiguous cluster', () => {
    const markdown = '- [ ] one\n- [x] two\n- [ ] three'

    expect(reorderListMarkdownLines(markdown, ['one', 'two', 'three'], 'task', 1, 0)).toBe(
      '- [x] two\n- [ ] one\n- [ ] three',
    )
  })

  it('reorders bullet and dash lists without crossing blank separators', () => {
    expect(reorderListMarkdownLines('* one\n* two\n* three', ['one', 'two', 'three'], 'bullet', 0, 3)).toBe(
      '* two\n* three\n* one',
    )
    expect(reorderListMarkdownLines('- one\n\n- two', ['one', 'two'], 'dash', 0, 2)).toBeNull()
  })

  it('keeps empty bullet and dash items parseable after moving them to the top', () => {
    expect(reorderListMarkdownLines('* one\n* two\n*', ['one', 'two', ''], 'bullet', 2, 0)).toBe(
      `* ${EMPTY_LIST_ITEM_PLACEHOLDER}\n* one\n* two`,
    )
    expect(reorderListMarkdownLines('- one\n- two\n-', ['one', 'two', ''], 'dash', 2, 0)).toBe(
      `- ${EMPTY_LIST_ITEM_PLACEHOLDER}\n- one\n- two`,
    )
  })

  it('renumbers ordered list prefixes after reorder', () => {
    const markdown = '3. alpha\n4. beta\n5. gamma'

    expect(reorderListMarkdownLines(markdown, ['alpha', 'beta', 'gamma'], 'numbered', 2, 0)).toBe(
      '3. gamma\n4. alpha\n5. beta',
    )
  })
})

describe('list reorder pointer handling', () => {
  it('does not suppress normal text clicks before drag movement', () => {
    expect(getListReorderPointerDecision(0)).toEqual({
      shouldSuppressSelection: false,
      shouldStartDrag: false,
    })
    expect(getListReorderPointerDecision(7.9)).toEqual({
      shouldSuppressSelection: false,
      shouldStartDrag: false,
    })
  })

  it('suppresses native selection only once drag starts', () => {
    expect(getListReorderPointerDecision(8)).toEqual({
      shouldSuppressSelection: true,
      shouldStartDrag: true,
    })
  })

  it('uses manual caret placement only for trailing whitespace clicks inside the item', () => {
    expect(shouldUseManualListCaretPlacement(true, true)).toBe(true)
    expect(shouldUseManualListCaretPlacement(false, true)).toBe(false)
    expect(shouldUseManualListCaretPlacement(true, false)).toBe(false)
  })
})
