import { describe, expect, it } from 'vitest'
import { parseAssetUrl, parseImageAssetUrl } from './image-asset-refs.js'
import {
  getRegisteredAssetBytes,
  getRegisteredImageAssetBytes,
  importBlobAsAssetUrl,
  importImageBlobAsAssetUrl,
  normalizeMarkdownAssetSourcesForPersistence,
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

  it('imports non-image blobs as stable asset links', async () => {
    const assetUrl = await importBlobAsAssetUrl(new Blob([new Uint8Array([4, 5, 6])], { type: 'application/pdf' }), 'report.pdf')
    const assetPath = parseAssetUrl(assetUrl)

    expect(assetUrl).toMatch(/^tabs-asset:\/\/\/assets\/asset-/)
    expect(assetUrl).toMatch(/\.pdf$/)
    expect(assetPath ? Array.from(getRegisteredAssetBytes(assetPath) ?? []) : []).toEqual([4, 5, 6])
  })

  it('keeps markdown asset links stable when normalizing persistence sources', () => {
    const markdown = normalizeMarkdownAssetSourcesForPersistence('[report](tabs-asset:///assets/asset-test.pdf)')

    expect(markdown).toBe('[report](tabs-asset:///assets/asset-test.pdf)')
  })
})
