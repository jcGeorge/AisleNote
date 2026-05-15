import { describe, expect, it } from 'vitest'
import { getImageToolPlacement } from './image-tool-placement'

describe('image tool placement', () => {
  it('places the toolbar above the image when there is room', () => {
    const placement = getImageToolPlacement({ top: 120, left: 40, right: 240, bottom: 260, width: 200 })

    expect(placement.toolbarTop).toBeLessThan(120)
    expect(placement.toolbarLeft).toBe(40)
  })

  it('clamps the toolbar near the viewport top', () => {
    const placement = getImageToolPlacement({ top: 20, left: 40, right: 240, bottom: 260, width: 200 })

    expect(placement.toolbarTop).toBe(8)
  })

  it('uses the selected image width as the toolbar hit-zone minimum width', () => {
    const placement = getImageToolPlacement({ top: 120, left: 40, right: 240, bottom: 260, width: 200.4 })

    expect(placement.toolbarMinWidth).toBe(200)
  })
})
