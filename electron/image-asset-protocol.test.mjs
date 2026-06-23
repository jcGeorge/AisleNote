import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  IMAGE_ASSET_PROTOCOL_SCHEME,
  createImageAssetProtocolResponse,
  parseAssetRangeHeader,
  registerImageAssetProtocol,
} from './image-asset-protocol.mjs'

async function withTempProfile(run) {
  const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'aislenote-asset-protocol-'))
  try {
    return await run(profileRootPath)
  } finally {
    rmSync(profileRootPath, { recursive: true, force: true })
  }
}

function writeAsset(profileRootPath, assetName, bytes) {
  const assetPath = path.join(profileRootPath, 'assets', assetName)
  mkdirSync(path.dirname(assetPath), { recursive: true })
  writeFileSync(assetPath, bytes)
}

async function readResponseBytes(response) {
  return Array.from(new Uint8Array(await response.arrayBuffer()))
}

describe('aislenote-asset protocol responses', () => {
  it('returns full asset responses with media content type, length, and range support', async () => {
    await withTempProfile(async (profileRootPath) => {
      writeAsset(profileRootPath, 'song.mp3', Uint8Array.from([0, 1, 2, 3, 4]))

      const response = createImageAssetProtocolResponse(new Request('aislenote-asset:///assets/song.mp3'), profileRootPath)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('audio/mpeg')
      expect(response.headers.get('content-length')).toBe('5')
      expect(response.headers.get('accept-ranges')).toBe('bytes')
      await expect(readResponseBytes(response)).resolves.toEqual([0, 1, 2, 3, 4])
    })
  })

  it('serves byte ranges for media seeking', async () => {
    await withTempProfile(async (profileRootPath) => {
      writeAsset(profileRootPath, 'clip.webm', Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))

      const response = createImageAssetProtocolResponse(
        new Request('aislenote-asset:///assets/clip.webm', { headers: { Range: 'bytes=2-5' } }),
        profileRootPath,
      )

      expect(response.status).toBe(206)
      expect(response.headers.get('content-type')).toBe('video/webm')
      expect(response.headers.get('content-length')).toBe('4')
      expect(response.headers.get('content-range')).toBe('bytes 2-5/8')
      await expect(readResponseBytes(response)).resolves.toEqual([2, 3, 4, 5])
    })
  })

  it('serves suffix byte ranges', async () => {
    await withTempProfile(async (profileRootPath) => {
      writeAsset(profileRootPath, 'clip.mp4', Uint8Array.from([0, 1, 2, 3, 4, 5]))

      const response = createImageAssetProtocolResponse(
        new Request('aislenote-asset:///assets/clip.mp4', { headers: { Range: 'bytes=-3' } }),
        profileRootPath,
      )

      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe('bytes 3-5/6')
      await expect(readResponseBytes(response)).resolves.toEqual([3, 4, 5])
    })
  })

  it('rejects unsatisfiable ranges', async () => {
    await withTempProfile(async (profileRootPath) => {
      writeAsset(profileRootPath, 'song.mp3', Uint8Array.from([0, 1, 2]))

      const response = createImageAssetProtocolResponse(
        new Request('aislenote-asset:///assets/song.mp3', { headers: { Range: 'bytes=9-12' } }),
        profileRootPath,
      )

      expect(response.status).toBe(416)
      expect(response.headers.get('accept-ranges')).toBe('bytes')
      expect(response.headers.get('content-range')).toBe('bytes */3')
    })
  })

  it('rejects non-asset and traversal paths', async () => {
    await withTempProfile(async (profileRootPath) => {
      writeAsset(profileRootPath, 'song.mp3', Uint8Array.from([0]))

      expect(createImageAssetProtocolResponse(new Request('aislenote-asset:///song.mp3'), profileRootPath).status).toBe(404)
      expect(
        createImageAssetProtocolResponse(new Request('aislenote-asset:///assets/..%2Fsong.mp3'), profileRootPath).status,
      ).toBe(404)
    })
  })

  it('parses explicit, open-ended, and suffix byte ranges', () => {
    expect(parseAssetRangeHeader('bytes=0-2', 10)).toEqual({ satisfiable: true, start: 0, end: 2 })
    expect(parseAssetRangeHeader('bytes=5-', 10)).toEqual({ satisfiable: true, start: 5, end: 9 })
    expect(parseAssetRangeHeader('bytes=-4', 10)).toEqual({ satisfiable: true, start: 6, end: 9 })
    expect(parseAssetRangeHeader('bytes=20-30', 10)).toEqual({ satisfiable: false })
  })

  it('registers the app-owned protocol handler without requiring net.fetch', () => {
    const protocol = { handle: vi.fn() }
    const storageSession = { getProfileRootPath: vi.fn(() => '/tmp/aislenote-profile') }

    registerImageAssetProtocol({ protocol, storageSession })

    expect(protocol.handle).toHaveBeenCalledWith(IMAGE_ASSET_PROTOCOL_SCHEME, expect.any(Function))
  })
})
