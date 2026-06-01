import { describe, expect, it } from 'vitest'
import { getNextMediaResizeWidth, type MediaResizeStart } from './useMediaTools'

const resizeStart: MediaResizeStart = {
  startX: 100,
  startY: 200,
  startWidth: 320,
  aspectRatio: 16 / 9,
}

describe('media resize sizing', () => {
  it('uses horizontal drag when horizontal movement is dominant', () => {
    expect(getNextMediaResizeWidth(resizeStart, 180, 210)).toBe(400)
  })

  it('uses vertical drag as proportional width when vertical movement is dominant', () => {
    expect(getNextMediaResizeWidth(resizeStart, 110, 260)).toBe(427)
  })

  it('shrinks from upward vertical drag', () => {
    expect(getNextMediaResizeWidth(resizeStart, 100, 155)).toBe(240)
  })

  it('clamps very small resize results', () => {
    expect(getNextMediaResizeWidth(resizeStart, 100, 0)).toBe(160)
  })
})
