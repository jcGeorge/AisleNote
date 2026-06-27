import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CLOSED_IMAGE_TOOLS_STATE,
  CLOSED_INLINE_CROP_STATE,
  getInlineCropCloseDiagnosticDetails,
  hasActiveImageToolsState,
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

  it('reports active image tool state as the inverse of idle close state', () => {
    const idle = {
      imageTools: CLOSED_IMAGE_TOOLS_STATE,
      inlineCrop: CLOSED_INLINE_CROP_STATE,
      hasActiveImage: false,
      hasActiveImageLookup: false,
      hasImageResize: false,
      imageRebindInProgress: false,
    }

    expect(hasActiveImageToolsState(idle)).toBe(false)
    expect(hasActiveImageToolsState({ ...idle, hasActiveImage: true })).toBe(true)
    expect(hasActiveImageToolsState({ ...idle, imageTools: { ...CLOSED_IMAGE_TOOLS_STATE, visible: true } })).toBe(true)
  })
})

describe('image crop diagnostics', () => {
  it('includes close reasons in crop diagnostic details', () => {
    expect(getInlineCropCloseDiagnosticDetails('selected-image-missing', false, {
      hadLookup: true,
    })).toEqual({
      reason: 'selected-image-missing',
      activeImageConnected: false,
      hadLookup: true,
    })
  })
})

describe('image tool viewport refresh behavior', () => {
  it('refreshes selected image tool positions from passive scroll and resize listeners', () => {
    const source = readFileSync(new URL('./useImageTools.ts', import.meta.url), 'utf8')

    expect(source).toContain("document.addEventListener('scroll', scheduleViewportRefresh, listenerOptions)")
    expect(source).toContain("window.addEventListener('resize', scheduleViewportRefresh, listenerOptions)")
    expect(source).toContain('const listenerOptions: AddEventListenerOptions = { capture: true, passive: true }')
    expect(source).toContain('if (!hasActiveState() || frameId) return')
    expect(source).toContain('window.requestAnimationFrame(() => {')
    expect(source).toContain('refreshPosition({ closeOnMissing: false })')
  })

  it('closes image tools when editor mutations remove the selected image', () => {
    const source = readFileSync(new URL('./useImageTools.ts', import.meta.url), 'utf8')

    expect(source).toContain(`const runSyncAndScheduleFollowUp = () => {
      syncEditorImageDisplayMetadata()
      closeIfSelectedImageMissing()
      scheduleSync()
    }`)
  })

  it('reserves image layout only during resize commit to avoid drag-time work', () => {
    const source = readFileSync(new URL('./useImageTools.ts', import.meta.url), 'utf8')

    expect(source).toContain('reservedDisplayBox?: ImageDisplayLayoutReservation')
    expect(source).toContain('reserveImageDisplayLayout(image, resizeCommitLayout)')
    expect(source).toContain('reservedDisplayBox: resizeCommitLayout')
    expect(source).toContain('releaseReservedImageDisplayLayoutWhenReady(selectedImage)')
    expect(source).toContain(`if (imageResizeRef.current) {
        continueResize(event.clientX)
      }`)
  })
})
