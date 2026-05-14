import { describe, expect, it } from 'vitest'
import {
  getLogicalEndpointForPosition,
  resolveLogicalEndpointPosition,
  type EditorCursorTextBlock,
} from './editor-cursor-position'

describe('editor cursor logical positions', () => {
  it('clamps trailing horizontal whitespace to the meaningful end of the text block', () => {
    const text = 'CURSOR MAINTAINED RIGHT HERE: ------>   '
    const blocks: EditorCursorTextBlock[] = [
      { blockIndex: 0, start: 1, end: 1 + text.length, text },
    ]

    const endpoint = getLogicalEndpointForPosition(blocks, 1 + text.length, 1 + text.length)

    expect(endpoint).toEqual({
      blockIndex: 0,
      offset: 'CURSOR MAINTAINED RIGHT HERE: ------>'.length,
    })
    expect(resolveLogicalEndpointPosition(blocks, endpoint, 1 + text.length)).toBe(
      1 + 'CURSOR MAINTAINED RIGHT HERE: ------>'.length,
    )
  })

  it('preserves empty text blocks as addressable cursor targets', () => {
    const blocks: EditorCursorTextBlock[] = [
      { blockIndex: 0, start: 1, end: 4, text: 'one' },
      { blockIndex: 1, start: 6, end: 6, text: '' },
      { blockIndex: 2, start: 8, end: 11, text: 'two' },
    ]

    const endpoint = getLogicalEndpointForPosition(blocks, 6, 12)

    expect(endpoint).toEqual({ blockIndex: 1, offset: 0 })
    expect(resolveLogicalEndpointPosition(blocks, endpoint, 12)).toBe(6)
  })
})
