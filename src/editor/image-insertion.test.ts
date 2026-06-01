import { describe, expect, it } from 'vitest'
import {
  getDefaultInsertedImageDisplayWidth,
  getEditorImageInsertionContainerWidth,
} from './image-insertion'

describe('image insertion helpers', () => {
  it('uses the natural image width when it fits inside the editor', () => {
    expect(getDefaultInsertedImageDisplayWidth(320, 640)).toBe(320)
  })

  it('caps the default image width to the editor content width', () => {
    expect(getDefaultInsertedImageDisplayWidth(1200, 480)).toBe(480)
  })

  it('falls back to natural image width when editor width is unavailable', () => {
    expect(getDefaultInsertedImageDisplayWidth(240, null)).toBe(240)
    expect(getDefaultInsertedImageDisplayWidth(0, 480)).toBeNull()
  })

  it('measures editor content width from the Toast UI content surface', () => {
    const content = {
      getBoundingClientRect: () => ({ width: 0 }),
      clientWidth: 512,
    }
    const root = {
      querySelector: () => content,
    }

    expect(getEditorImageInsertionContainerWidth(root as unknown as HTMLElement)).toBe(512)
  })
})
