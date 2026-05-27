import { describe, expect, it } from 'vitest'
import {
  getAisleHorizontalScrollbarGeometry,
  getScrollLeftForAisleHorizontalScrollbarPointer,
  getScrollLeftForAisleHorizontalScrollbarThumb,
  getScrollLeftToRevealHorizontalPane,
} from './aisle-horizontal-scroll'

describe('horizontal aisle reveal geometry', () => {
  it('keeps the current scroll when the pane is already fully visible', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 120,
        viewportWidth: 500,
        paneLeft: 180,
        paneRight: 420,
      }),
    ).toBe(120)
  })

  it('scrolls left when the pane starts before the viewport', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 300,
        viewportWidth: 500,
        paneLeft: 100,
        paneRight: 460,
      }),
    ).toBe(100)
  })

  it('scrolls right enough to reveal a pane clipped after the viewport', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 0,
        viewportWidth: 900,
        paneLeft: 860,
        paneRight: 1320,
      }),
    ).toBe(420)
  })

  it('aligns oversized panes to their left edge', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 0,
        viewportWidth: 360,
        paneLeft: 720,
        paneRight: 1200,
      }),
    ).toBe(720)
  })
})

describe('horizontal aisle scrollbar geometry', () => {
  it('hides the custom scrollbar when content fits the viewport', () => {
    expect(
      getAisleHorizontalScrollbarGeometry({
        scrollLeft: 0,
        scrollWidth: 500,
        clientWidth: 500,
        trackWidth: 500,
      }),
    ).toMatchObject({
      visible: false,
      thumbLeft: 0,
      thumbWidth: 0,
    })
  })

  it('sizes the thumb proportionally while respecting the minimum width', () => {
    expect(
      getAisleHorizontalScrollbarGeometry({
        scrollLeft: 0,
        scrollWidth: 2000,
        clientWidth: 500,
        trackWidth: 500,
      }).thumbWidth,
    ).toBe(125)

    expect(
      getAisleHorizontalScrollbarGeometry({
        scrollLeft: 0,
        scrollWidth: 10000,
        clientWidth: 500,
        trackWidth: 500,
      }).thumbWidth,
    ).toBe(48)
  })

  it('maps scrollLeft into the thumb position', () => {
    const geometry = getAisleHorizontalScrollbarGeometry({
      scrollLeft: 750,
      scrollWidth: 2000,
      clientWidth: 500,
      trackWidth: 500,
    })

    expect(geometry.visible).toBe(true)
    expect(geometry.maxScrollLeft).toBe(1500)
    expect(geometry.maxThumbLeft).toBe(375)
    expect(geometry.thumbLeft).toBe(187.5)
  })

  it('maps dragged thumb positions back into scrollLeft', () => {
    expect(
      getScrollLeftForAisleHorizontalScrollbarThumb({
        thumbLeft: 100,
        maxThumbLeft: 400,
        maxScrollLeft: 1600,
      }),
    ).toBe(400)
  })

  it('maps a track click into a centered scrollLeft jump', () => {
    expect(
      getScrollLeftForAisleHorizontalScrollbarPointer({
        pointerX: 310,
        trackLeft: 10,
        trackWidth: 500,
        thumbWidth: 100,
        scrollWidth: 2000,
        clientWidth: 500,
      }),
    ).toBe(937.5)
  })
})
