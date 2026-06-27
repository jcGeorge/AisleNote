import { describe, expect, it } from 'vitest'
import {
  getMediaFrameStyle,
  getMediaPlayerClassName,
  getMediaVideoStyle,
  getMediaViewportAspectRatio,
} from './media-rendering'
import type { MediaTransformMetadata } from './media-metadata'

describe('media rendering metadata', () => {
  it('marks players with simple transform metadata classes', () => {
    const metadata: MediaTransformMetadata = {
      v: 1,
      w: 480,
      r: 90,
    }
    const className = getMediaPlayerClassName('video', metadata)

    expect(className).toContain('has-media-width')
    expect(className).toContain('has-media-transform')
  })

  it('computes viewport aspect ratios from natural video ratio and rotation only', () => {
    const metadata: MediaTransformMetadata = {
      v: 1,
    }
    const rotatedMetadata: MediaTransformMetadata = {
      v: 1,
      r: 90,
    }

    expect(
      getMediaViewportAspectRatio(
        metadata,
        16 / 9,
      ),
    ).toBeCloseTo(16 / 9)
    expect(
      getMediaViewportAspectRatio(
        rotatedMetadata,
        16 / 9,
      ),
    ).toBeCloseTo(9 / 16)
  })

  it('creates transform styles for video display', () => {
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
    expect(getMediaVideoStyle({ v: 1 })).toEqual({})
  })
})
