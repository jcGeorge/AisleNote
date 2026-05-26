import { describe, expect, it } from 'vitest'
import { getScrollLeftToRevealHorizontalPane } from './aisle-horizontal-scroll'

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
