import { describe, expect, it } from 'vitest'
import { getViewportSafeNoteMentionMenuPosition } from './useNoteMentionController'

describe('note mention menu positioning', () => {
  it('opens below the cursor when below is the larger side', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 100, bottom: 120, left: 80 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
    )).toEqual({ top: 128, left: 80, previewLayout: 'left' })
  })

  it('opens above the cursor when above is the larger side', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 520, bottom: 540, left: 80 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
    )).toEqual({ top: 352, left: 80, previewLayout: 'left' })
  })

  it('opens above when above is larger even if below still has room', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 600, bottom: 620, left: 80 },
      { width: 240, height: 200 },
      { width: 800, height: 1000 },
    )).toEqual({ top: 392, left: 80, previewLayout: 'left' })
  })

  it('clamps to the viewport gap at right and bottom edges', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 540, bottom: 560, left: 760 },
      { width: 240, height: 220 },
      { width: 800, height: 600 },
    )).toEqual({ top: 312, left: 552, previewLayout: 'left' })
  })

  it('keeps an oversized menu inside the top viewport gap', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 20, bottom: 40, left: 4 },
      { width: 900, height: 900 },
      { width: 800, height: 600 },
    )).toEqual({ top: 8, left: 8, previewLayout: 'left' })
  })

  it('places the preview to the left of the selector when the combined popover fits', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 100, bottom: 120, left: 400 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
      8,
      { previewSize: { width: 280, height: 160 } },
    )).toEqual({ top: 128, left: 112, previewLayout: 'left' })
  })

  it('flips the left-preview popover above when selector height would overflow below', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 520, bottom: 540, left: 80 },
      { width: 240, height: 160 },
      { width: 800, height: 600 },
      8,
      { previewSize: { width: 280, height: 160 } },
    )).toEqual({ top: 352, left: 8, previewLayout: 'left' })
  })

  it('falls back down and clamps when the left-preview popover cannot fit above', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 20, bottom: 40, left: 80 },
      { width: 240, height: 580 },
      { width: 800, height: 600 },
      8,
      { previewSize: { width: 280, height: 580 } },
    )).toEqual({ top: 12, left: 8, previewLayout: 'left' })
  })

  it('clamps the left-preview popover on narrow viewports', () => {
    expect(getViewportSafeNoteMentionMenuPosition(
      { top: 100, bottom: 120, left: 80 },
      { width: 500, height: 160 },
      { width: 800, height: 600 },
      8,
      { previewSize: { width: 280, height: 160 } },
    )).toEqual({ top: 128, left: 8, previewLayout: 'left' })
  })
})
