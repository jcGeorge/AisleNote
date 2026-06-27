import { describe, expect, it } from 'vitest'
import {
  getAisleHorizontalScrollbarGeometry,
  getHorizontalDragAutoScrollDelta,
  getScrollLeftForAisleHorizontalScrollbarPointer,
  getScrollLeftForAisleHorizontalScrollbarThumb,
  getScrollLeftToRevealHorizontalPane,
  scrollAislePaneIntoHorizontalView,
} from './aisle-horizontal-scroll'

function createRect(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    width,
    height: 0,
    top: 0,
    right: left + width,
    bottom: 0,
    left,
    toJSON: () => ({}),
  } as DOMRect
}

function createHorizontalScrollFixture({
  scrollLeft,
  viewportWidth,
  paneLeftInViewport,
  paneWidth,
  computedStyle = {},
}: {
  scrollLeft: number
  viewportWidth: number
  paneLeftInViewport: number
  paneWidth: number
  computedStyle?: Record<string, string>
}) {
  const pane = {
    dataset: { aisleId: 'target' },
    offsetWidth: paneWidth,
    getBoundingClientRect: () => createRect(paneLeftInViewport, paneWidth),
    scrollIntoView: () => undefined,
  } as unknown as HTMLElement
  return {
    scrollLeft,
    clientWidth: viewportWidth,
    scrollWidth: 2000,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          getPropertyValue: (property: string) => computedStyle[property] ?? '',
        }),
      },
    },
    getBoundingClientRect: () => createRect(0, viewportWidth),
    querySelectorAll: () => [pane],
  } as unknown as HTMLElement
}

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

  it('keeps the leading gutter visible when scrolling back to a left-side pane', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 40,
        viewportWidth: 900,
        scrollWidth: 1024,
        paneLeft: 24,
        paneRight: 504,
        alignmentMargin: 24,
        alignWhenVisible: true,
      }),
    ).toBe(0)
  })

  it('moves a visible right-side pane to its padded focused alignment', () => {
    expect(
      getScrollLeftToRevealHorizontalPane({
        currentScrollLeft: 0,
        viewportWidth: 900,
        scrollWidth: 1008,
        paneLeft: 504,
        paneRight: 984,
        alignmentMargin: 24,
        alignWhenVisible: true,
      }),
    ).toBe(108)
  })
})

describe('horizontal aisle pane scroll reveal', () => {
  it('keeps the current scroll when the target aisle is already fully visible', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 120,
      viewportWidth: 500,
      paneLeftInViewport: 60,
      paneWidth: 240,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target')).toBe(true)

    expect(scrollNode.scrollLeft).toBe(120)
  })

  it('scrolls a right-clipped aisle only enough to reveal its right edge', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 0,
      viewportWidth: 900,
      paneLeftInViewport: 860,
      paneWidth: 460,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target')).toBe(true)

    expect(scrollNode.scrollLeft).toBe(420)
  })

  it('scrolls a left-clipped aisle back to its left edge', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 300,
      viewportWidth: 500,
      paneLeftInViewport: -200,
      paneWidth: 360,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target')).toBe(true)

    expect(scrollNode.scrollLeft).toBe(100)
  })

  it('scrolls a left aisle back far enough to include its leading gutter', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 40,
      viewportWidth: 900,
      paneLeftInViewport: -16,
      paneWidth: 480,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target', { alignmentMargin: 24 })).toBe(true)

    expect(scrollNode.scrollLeft).toBe(0)
  })

  it('scrolls a visible right aisle to its padded focused alignment', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 0,
      viewportWidth: 900,
      paneLeftInViewport: 504,
      paneWidth: 480,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target', { alignmentMargin: 24 })).toBe(true)

    expect(scrollNode.scrollLeft).toBe(108)
  })

  it('uses scroll padding for focused alignment without layout padding', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 0,
      viewportWidth: 900,
      paneLeftInViewport: 504,
      paneWidth: 480,
      computedStyle: {
        'scroll-padding-inline-start': '24px',
        'padding-inline-start': '0px',
      },
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target')).toBe(true)

    expect(scrollNode.scrollLeft).toBe(108)
  })

  it('aligns oversized aisles to their left edge because they cannot fully fit', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 0,
      viewportWidth: 360,
      paneLeftInViewport: 720,
      paneWidth: 480,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'target')).toBe(true)

    expect(scrollNode.scrollLeft).toBe(720)
  })

  it('does nothing when the target aisle is missing', () => {
    const scrollNode = createHorizontalScrollFixture({
      scrollLeft: 120,
      viewportWidth: 500,
      paneLeftInViewport: 60,
      paneWidth: 240,
    })

    expect(scrollAislePaneIntoHorizontalView(scrollNode, 'missing')).toBe(false)
    expect(scrollNode.scrollLeft).toBe(120)
  })
})

describe('horizontal drag auto-scroll geometry', () => {
  const baseInput = {
    containerLeft: 100,
    containerRight: 500,
    currentScrollLeft: 200,
    maxScrollLeft: 800,
    edgeZoneWidth: 80,
    maxStep: 8,
  }

  it('does not scroll when the pointer is outside the edge zones', () => {
    expect(getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 260 })).toBe(0)
  })

  it('scrolls left near the left edge and right near the right edge', () => {
    expect(getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 120 })).toBeLessThan(0)
    expect(getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 480 })).toBeGreaterThan(0)
  })

  it('clamps at the horizontal scroll boundaries', () => {
    expect(
      getHorizontalDragAutoScrollDelta({
        ...baseInput,
        pointerX: 90,
        currentScrollLeft: 0,
      }),
    ).toBe(0)

    expect(
      getHorizontalDragAutoScrollDelta({
        ...baseInput,
        pointerX: 510,
        currentScrollLeft: 800,
      }),
    ).toBe(0)

    expect(
      getHorizontalDragAutoScrollDelta({
        ...baseInput,
        pointerX: 90,
        currentScrollLeft: 3,
      }),
    ).toBe(-3)

    expect(
      getHorizontalDragAutoScrollDelta({
        ...baseInput,
        pointerX: 510,
        currentScrollLeft: 797,
      }),
    ).toBe(3)
  })

  it('ramps speed up as the pointer gets closer to an edge and caps the step', () => {
    const shallowRight = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 430 })
    const deepRight = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 495 })
    const beyondRight = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 620 })

    expect(shallowRight).toBeGreaterThan(0)
    expect(deepRight).toBeGreaterThan(shallowRight)
    expect(beyondRight).toBe(8)

    const shallowLeft = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 170 })
    const deepLeft = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: 105 })
    const beyondLeft = getHorizontalDragAutoScrollDelta({ ...baseInput, pointerX: -20 })

    expect(shallowLeft).toBeLessThan(0)
    expect(deepLeft).toBeLessThan(shallowLeft)
    expect(beyondLeft).toBe(-8)
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
