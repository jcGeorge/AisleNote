import { describe, expect, it } from 'vitest'
import { parseImageAssetUrl } from './image-asset-refs.js'
import {
  getRegisteredImageAssetBytes,
  importImageBlobAsAssetUrl,
  normalizeMarkdownImageSourcesForPersistence,
} from './image-asset-registry'

describe('image asset registry', () => {
  it('imports image blobs as stable asset refs without data URLs', async () => {
    const assetUrl = await importImageBlobAsAssetUrl(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'pixel.png')
    const assetPath = parseImageAssetUrl(assetUrl)

    expect(assetUrl).toMatch(/^tabs-asset:\/\/\/assets\/asset-/)
    expect(assetUrl).not.toContain('data:image/')
    expect(assetPath ? Array.from(getRegisteredImageAssetBytes(assetPath) ?? []) : []).toEqual([1, 2, 3])
  })

  it('keeps stable asset refs when normalizing markdown for persistence', () => {
    const markdown = normalizeMarkdownImageSourcesForPersistence('![pixel](tabs-asset:///assets/asset-test.png)')

    expect(markdown).toBe('![pixel](tabs-asset:///assets/asset-test.png)')
    expect(markdown).not.toContain('data:image/')
  })
})
