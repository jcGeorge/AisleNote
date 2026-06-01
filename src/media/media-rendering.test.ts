import { describe, expect, it } from 'vitest'
import {
  getMediaFrameStyle,
  getMediaPlayerClassName,
  getMediaVideoStyle,
  getMediaViewportAspectRatio,
} from './media-rendering'
import type { MediaTransformMetadata } from './media-metadata'

type LegacyMediaMetadata = MediaTransformMetadata & {
  crop?: { x: number; y: number; w: number; h: number }
  ratio?: string
}

describe('media rendering metadata', () => {
  it('marks players with simple transform metadata classes and ignores legacy crop metadata', () => {
    const legacyMetadata: LegacyMediaMetadata = {
      v: 1,
      w: 480,
      r: 90,
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
    }
    const className = getMediaPlayerClassName('video', legacyMetadata)

    expect(className).toContain('has-media-width')
    expect(className).toContain('has-media-transform')
    expect(className).not.toContain('has-media-crop')
  })

  it('computes viewport aspect ratios from natural video ratio and rotation only', () => {
    const legacyCropMetadata: LegacyMediaMetadata = {
      v: 1,
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 },
    }
    const legacyRotatedCropMetadata: LegacyMediaMetadata = {
      v: 1,
      r: 90,
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 },
    }

    expect(
      getMediaViewportAspectRatio(
        legacyCropMetadata,
        16 / 9,
      ),
    ).toBeCloseTo(16 / 9)
    expect(
      getMediaViewportAspectRatio(
        legacyRotatedCropMetadata,
        16 / 9,
      ),
    ).toBeCloseTo(9 / 16)
  })

  it('creates transform styles for video display and ignores legacy crop styles', () => {
    const legacyCropMetadata: LegacyMediaMetadata = {
      v: 1,
      crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.25 },
    }

    expect(getMediaFrameStyle({ v: 1, r: 180, fh: true })).toEqual({
      transform: 'rotate(180deg) scaleX(-1)',
      transformOrigin: 'center center',
    })
    expect(getMediaFrameStyle({ v: 1, r: 90 }, 16 / 9)).toMatchObject({
      width: '177.77777777777777%',
      height: '56.25%',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) rotate(90deg)',
    })
    expect(getMediaVideoStyle(legacyCropMetadata)).toEqual({})
  })
})
