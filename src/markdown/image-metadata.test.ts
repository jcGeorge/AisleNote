import { describe, expect, it } from 'vitest'
import {
  buildImageResizeMetadataFragment,
  normalizeImageResizeMetadataFragment,
  parseImageResizeMetadataFragment,
  splitImageResizeMetadataFromUrl,
  withImageResizeMetadata,
} from './image-metadata'

describe('image resize metadata', () => {
  it('builds readable resize metadata fragments in canonical order', () => {
    expect(buildImageResizeMetadataFragment({
      v: 1,
      w: 480,
      r: 90,
      fh: true,
      fv: true,
    })).toBe('#aislenote-image=width=480,rotate=90,flip-horizontal,flip-vertical')
  })

  it('parses readable resize metadata fragments', () => {
    expect(parseImageResizeMetadataFragment('#aislenote-image=width=320,rotate=270,flip-vertical')).toEqual({
      v: 1,
      w: 320,
      r: 270,
      fv: true,
    })
  })

  it('does not parse old encoded resize metadata fragments', () => {
    expect(parseImageResizeMetadataFragment('#aislenote-image=eyJ2IjoxLCJ3Ijo0ODB9')).toBeNull()
  })

  it('normalizes valid readable fragments and preserves invalid fragments', () => {
    expect(normalizeImageResizeMetadataFragment('#aislenote-image=rotate=90,width=240')).toBe('#aislenote-image=width=240,rotate=90')
    expect(normalizeImageResizeMetadataFragment('#aislenote-image=not-readable')).toBe('#aislenote-image=not-readable')
  })

  it('keeps readable metadata attached to image urls', () => {
    const url = withImageResizeMetadata('aislenote-asset:///assets/example.png', { v: 1, w: 144, fh: true })

    expect(url).toBe('aislenote-asset:///assets/example.png#aislenote-image=width=144,flip-horizontal')
    expect(splitImageResizeMetadataFromUrl(url)).toMatchObject({
      imageUrl: 'aislenote-asset:///assets/example.png',
      metadata: { v: 1, w: 144, fh: true },
      metadataFragment: '#aislenote-image=width=144,flip-horizontal',
    })
  })
})
