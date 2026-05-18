import { describe, expect, it } from 'vitest'
import { getImageResizeMetadata, stripImageResizeMetadataFromUrl, withImageResizeMetadata } from '../markdown/image-metadata'
import {
  getImageTransformDimensions,
  getImageTransformDisplayWidth,
  getImageTransformDisplayWidthAfterOperation,
  withImageTransformDisplayWidth,
} from './image-transform'

describe('image transform helpers', () => {
  it('swaps dimensions for rotate operations', () => {
    expect(getImageTransformDimensions(320, 180, 'rotate-cw')).toEqual({ width: 180, height: 320 })
    expect(getImageTransformDimensions(320, 180, 'rotate-ccw')).toEqual({ width: 180, height: 320 })
  })

  it('preserves dimensions for flip operations', () => {
    expect(getImageTransformDimensions(320, 180, 'flip-horizontal')).toEqual({ width: 320, height: 180 })
    expect(getImageTransformDimensions(320, 180, 'flip-vertical')).toEqual({ width: 320, height: 180 })
  })

  it('preserves explicit display width metadata before falling back to rendered width', () => {
    const sourceUrl = withImageResizeMetadata('data:image/png;base64,abc', { v: 1, w: 144 })

    expect(getImageTransformDisplayWidth(sourceUrl, 220)).toBe(144)
    expect(getImageTransformDisplayWidth('data:image/png;base64,abc', 220)).toBe(220)
    expect(getImageTransformDisplayWidth('data:image/png;base64,abc', 0)).toBe(8)
  })

  it('preserves display scale for landscape rotate operations', () => {
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      40,
      4,
      2,
      'rotate-cw',
    )).toBe(20)
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      40,
      4,
      2,
      'rotate-ccw',
    )).toBe(20)
  })

  it('preserves display scale for portrait rotate operations', () => {
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      20,
      2,
      4,
      'rotate-cw',
    )).toBe(40)
  })

  it('keeps square rotate display width unchanged', () => {
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      36,
      4,
      4,
      'rotate-cw',
    )).toBe(36)
  })

  it('preserves display width for flip operations', () => {
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      40,
      4,
      2,
      'flip-horizontal',
    )).toBe(40)
    expect(getImageTransformDisplayWidthAfterOperation(
      'data:image/png;base64,abc',
      40,
      4,
      2,
      'flip-vertical',
    )).toBe(40)
  })

  it('uses explicit display width metadata when preserving rotate scale', () => {
    const sourceUrl = withImageResizeMetadata('data:image/png;base64,abc', { v: 1, w: 144 })

    expect(getImageTransformDisplayWidthAfterOperation(sourceUrl, 220, 320, 180, 'rotate-cw')).toBe(81)
  })

  it('writes transformed display width metadata to transformed data urls', () => {
    const sourceUrl = withImageResizeMetadata('data:image/png;base64,abc', { v: 1, w: 96 })
    const nextUrl = withImageTransformDisplayWidth('data:image/png;base64,def', sourceUrl, 240, 320, 180, 'rotate-cw')

    expect(nextUrl).toContain('data:image/png;base64,def#tabs-image=')
    expect(getImageTransformDisplayWidth(nextUrl, 240)).toBe(54)
  })

  it('stores rotate and flip operations as metadata without changing the image source', () => {
    const sourceUrl = withImageResizeMetadata('tabs-asset:///assets/source.png', { v: 1, w: 96 })
    const rotatedUrl = withImageTransformDisplayWidth(sourceUrl, sourceUrl, 96, 320, 180, 'rotate-cw')
    const flippedUrl = withImageTransformDisplayWidth(rotatedUrl, rotatedUrl, 54, 180, 180, 'flip-horizontal')

    expect(stripImageResizeMetadataFromUrl(rotatedUrl)).toBe('tabs-asset:///assets/source.png')
    expect(getImageResizeMetadata(rotatedUrl)).toMatchObject({ v: 1, w: 54, r: 90 })
    expect(stripImageResizeMetadataFromUrl(flippedUrl)).toBe('tabs-asset:///assets/source.png')
    expect(getImageResizeMetadata(flippedUrl)).toMatchObject({ v: 1, fh: true, r: 90 })
  })
})
