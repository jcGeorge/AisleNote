import { describe, expect, it } from 'vitest'
import { parseAssetUrl, parseImageAssetUrl } from './image-asset-refs.js'
import {
  getRegisteredAssetBytes,
  getRegisteredImageAssetBytes,
  getRegisteredAssetMimeType,
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

  it('preserves file extensions for generic media assets when the blob has a broader mime type', async () => {
    const assetUrl = await importBlobAsAssetUrl(new Blob([new Uint8Array([7, 8, 9])], { type: 'video/mp4' }), 'clip.m4v')

    expect(assetUrl).toMatch(/\.m4v$/)
  })

  it('infers mime types for supported media asset extensions', () => {
    expect(getRegisteredAssetMimeType('assets/song.aac')).toBe('audio/aac')
    expect(getRegisteredAssetMimeType('assets/song.flac')).toBe('audio/flac')
    expect(getRegisteredAssetMimeType('assets/song.oga')).toBe('audio/ogg')
    expect(getRegisteredAssetMimeType('assets/song.opus')).toBe('audio/ogg')
    expect(getRegisteredAssetMimeType('assets/clip.m4v')).toBe('video/mp4')
  })

  it('keeps markdown asset links stable when normalizing persistence sources', () => {
    const markdown = normalizeMarkdownAssetSourcesForPersistence('[report](tabs-asset:///assets/asset-test.pdf)')

    expect(markdown).toBe('[report](tabs-asset:///assets/asset-test.pdf)')
  })

  it('keeps escaped media asset links and media metadata stable when normalizing persistence sources', () => {
    const markdown = normalizeMarkdownAssetSourcesForPersistence(
      '[song [demo\\].mp3](tabs-asset:///assets/song.mp3#tabs-media=width=320)',
    )

    expect(markdown).toBe('[song [demo\\].mp3](tabs-asset:///assets/song.mp3#tabs-media=width=320)')
  })
})
