import { describe, expect, it } from 'vitest'
import { withImageResizeMetadata } from '../markdown/image-metadata'
import {
  getImageTransformDimensions,
  getImageTransformDisplayWidth,
  withPreservedImageTransformDisplayWidth,
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

  it('writes preserved display width metadata to transformed data urls', () => {
    const sourceUrl = withImageResizeMetadata('data:image/png;base64,abc', { v: 1, w: 96 })
    const nextUrl = withPreservedImageTransformDisplayWidth('data:image/png;base64,def', sourceUrl, 240)

    expect(nextUrl).toContain('data:image/png;base64,def#tabs-image=')
    expect(getImageTransformDisplayWidth(nextUrl, 240)).toBe(96)
  })
})
