import { describe, expect, it } from 'vitest'
import {
  getImageToolPlacement,
  getVideoViewportResizeToolPlacement,
  isUsableImageToolPlacementRect,
} from './image-tool-placement'

describe('image tool placement', () => {
  it('places the toolbar inside the image top-left when there is room', () => {
    const placement = getImageToolPlacement({ top: 120, left: 40, right: 240, bottom: 260, width: 200 })

    expect(placement.toolbarTop).toBe(126)
    expect(placement.toolbarLeft).toBe(46)
  })

  it('clamps the toolbar near the viewport top', () => {
    const placement = getImageToolPlacement({ top: -20, left: -12, right: 188, bottom: 260, width: 200 })

    expect(placement.toolbarTop).toBe(8)
    expect(placement.toolbarLeft).toBe(8)
  })

  it('places the video resize handle inside the viewport bottom-right', () => {
    const placement = getVideoViewportResizeToolPlacement({ top: 120, left: 40, right: 240, bottom: 260, width: 200 })

    expect(placement.resizeTop).toBe(258)
    expect(placement.resizeLeft).toBe(238)
  })

  it('keeps video resize fallback placement on the player bottom-right', () => {
    const placement = getVideoViewportResizeToolPlacement({ top: 20, left: 12, right: 312, bottom: 90, width: 300 })

    expect(placement.resizeTop).toBe(88)
    expect(placement.resizeLeft).toBe(310)
  })

  it('rejects zero-sized image rects before placement can jump to the viewport corner', () => {
    expect(isUsableImageToolPlacementRect({ top: 0, left: 0, right: 0, bottom: 0, width: 0 })).toBe(false)
    expect(isUsableImageToolPlacementRect({ top: 80, left: 120, right: 320, bottom: 240, width: 200 })).toBe(true)
  })
})
