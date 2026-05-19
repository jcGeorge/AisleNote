import { describe, expect, it } from 'vitest'
import {
  CLOSED_IMAGE_TOOLS_STATE,
  CLOSED_INLINE_CROP_STATE,
  shouldSkipImageToolsClose,
} from './useImageTools'

describe('image tools close behavior', () => {
  it('skips closing when image tools are already idle', () => {
    expect(
      shouldSkipImageToolsClose({
        imageTools: CLOSED_IMAGE_TOOLS_STATE,
        inlineCrop: CLOSED_INLINE_CROP_STATE,
        hasActiveImage: false,
        hasActiveImageLookup: false,
        hasImageResize: false,
        imageRebindInProgress: false,
      }),
    ).toBe(true)
  })

  it('does not skip close while image tools are visible or crop state is active', () => {
    expect(
      shouldSkipImageToolsClose({
        imageTools: { ...CLOSED_IMAGE_TOOLS_STATE, visible: true },
        inlineCrop: CLOSED_INLINE_CROP_STATE,
        hasActiveImage: false,
        hasActiveImageLookup: false,
        hasImageResize: false,
        imageRebindInProgress: false,
      }),
    ).toBe(false)

    expect(
      shouldSkipImageToolsClose({
        imageTools: CLOSED_IMAGE_TOOLS_STATE,
        inlineCrop: { ...CLOSED_INLINE_CROP_STATE, active: true },
        hasActiveImage: false,
        hasActiveImageLookup: false,
        hasImageResize: false,
        imageRebindInProgress: false,
      }),
    ).toBe(false)
  })

  it('does not skip close while selected image internals are active', () => {
    const base = {
      imageTools: CLOSED_IMAGE_TOOLS_STATE,
      inlineCrop: CLOSED_INLINE_CROP_STATE,
      hasActiveImage: false,
      hasActiveImageLookup: false,
      hasImageResize: false,
      imageRebindInProgress: false,
    }

    expect(shouldSkipImageToolsClose({ ...base, hasActiveImage: true })).toBe(false)
    expect(shouldSkipImageToolsClose({ ...base, hasActiveImageLookup: true })).toBe(false)
    expect(shouldSkipImageToolsClose({ ...base, hasImageResize: true })).toBe(false)
    expect(shouldSkipImageToolsClose({ ...base, imageRebindInProgress: true })).toBe(false)
  })
})
