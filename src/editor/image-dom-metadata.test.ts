import { describe, expect, it } from 'vitest'
import { withImageResizeMetadata } from '../markdown/image-metadata'
import {
  releaseImageDisplayLayoutReservation,
  reserveImageDisplayLayout,
  syncImageDisplayMetadata,
} from './image-dom-metadata'

function createImageDouble(src: string): HTMLImageElement {
  const attrs = new Map<string, string>([['src', src]])
  return {
    src,
    style: {},
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value)
    },
    removeAttribute: (name: string) => {
      attrs.delete(name)
    },
  } as unknown as HTMLImageElement
}

describe('image DOM metadata sync', () => {
  it('keeps reserved resize commit height until the reservation is released', () => {
    const image = createImageDouble(withImageResizeMetadata('aislenote-asset:///assets/example.png', { v: 1, w: 240 }))

    expect(reserveImageDisplayLayout(image, { width: 240, height: 135 })).toBe(true)
    expect(syncImageDisplayMetadata(image)).toBe(true)

    expect(image.style.width).toBe('240px')
    expect(image.style.height).toBe('135px')
    expect(image.getAttribute('height')).toBe('135')

    expect(releaseImageDisplayLayoutReservation(image)).toBe(true)

    expect(image.style.height).toBe('auto')
    expect(image.getAttribute('height')).toBeNull()
  })
})
