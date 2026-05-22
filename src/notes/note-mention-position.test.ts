import { describe, expect, it } from 'vitest'
import { getViewportSafeNoteMentionMenuPosition } from './useNoteMentionController'

describe('note mention menu positioning', () => {
  it('opens below the cursor when there is room', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 100, bottom: 120, left: 80 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
    )).toEqual({ top: 128, left: 80 })
  })

  it('flips above the cursor when bottom space is insufficient', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 520, bottom: 540, left: 80 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
    )).toEqual({ top: 352, left: 80 })
  })

  it('clamps to the viewport gap at right and bottom edges', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 540, bottom: 560, left: 760 },
      { width: 240, height: 220 },
      { width: 800, height: 600 },
    )).toEqual({ top: 312, left: 552 })
  })

  it('keeps an oversized menu inside the top viewport gap', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 20, bottom: 40, left: 4 },
      { width: 900, height: 900 },
      { width: 800, height: 600 },
    )).toEqual({ top: 8, left: 8 })
  })
})
