import { describe, expect, it } from 'vitest'
import {
  buildMediaMetadataFragment,
  getMediaTransformMetadata,
  splitMediaMetadataFromUrl,
  stripMediaMetadataFromUrl,
  withMediaTransformMetadata,
  type MediaTransformMetadata,
} from './media-metadata'

type LegacyMediaMetadata = Partial<MediaTransformMetadata> & {
  crop?: { x: number; y: number; w: number; h: number }
  ratio?: string
}

describe('media metadata', () => {
  it('builds and parses readable media transform fragments', () => {
    const legacyMetadata: LegacyMediaMetadata = {
      v: 1,
      w: 420,
      r: 90,
      fh: true,
      fv: true,
      crop: { x: 0.12504, y: 0.2, w: 0.5, h: 0.4 },
      ratio: 'shorts',
    }
    const url = withMediaTransformMetadata('aislenote-asset:///assets/clip.webm', legacyMetadata)

    expect(url).toBe(
      'aislenote-asset:///assets/clip.webm#aislenote-media=width=420,rotate=90,flip-horizontal,flip-vertical',
    )
    expect(getMediaTransformMetadata(url)).toEqual({
      v: 1,
      w: 420,
      r: 90,
      fh: true,
      fv: true,
    })
  })

  it('splits and strips media metadata from urls', () => {
    const split = splitMediaMetadataFromUrl(
      'aislenote-asset:///assets/clip.mp4#aislenote-media=width=640,crop=0.1:0.2:0.3:0.4',
    )

    expect(split.mediaUrl).toBe('aislenote-asset:///assets/clip.mp4')
    expect(split.metadata).toEqual({
      v: 1,
      w: 640,
    })
    expect(stripMediaMetadataFromUrl('movie.mp4#aislenote-media=rotate=180')).toBe('movie.mp4')
  })

  it('builds and parses playback speed and volume while omitting defaults', () => {
    const url = withMediaTransformMetadata('aislenote-asset:///assets/song.mp3', {
      v: 1,
      speed: 1.25,
      volume: 125,
    })

    expect(url).toBe('aislenote-asset:///assets/song.mp3#aislenote-media=speed=1.25,volume=125')
    expect(getMediaTransformMetadata(url)).toEqual({
      v: 1,
      speed: 1.25,
      volume: 125,
    })
    expect(buildMediaMetadataFragment({ v: 1, speed: 1, volume: 100 })).toBe('')
  })

  it('ignores invalid playback metadata values', () => {
    expect(getMediaTransformMetadata('song.mp3#aislenote-media=speed=4,volume=200')).toBeNull()
    expect(getMediaTransformMetadata('song.mp3#aislenote-media=speed=0.75,volume=-1')).toEqual({
      v: 1,
      speed: 0.75,
    })
  })

  it('ignores legacy crop-only metadata', () => {
    expect(getMediaTransformMetadata('aislenote-asset:///assets/clip.mp4#aislenote-media=crop=0.1:0.2:0.3:0.4,ratio=shorts')).toBeNull()
  })

  it('omits empty metadata fragments', () => {
    expect(buildMediaMetadataFragment({ v: 1 })).toBe('')
    expect(withMediaTransformMetadata('aislenote-asset:///assets/clip.mp4#aislenote-media=width=640', { v: 1 })).toBe(
      'aislenote-asset:///assets/clip.mp4',
    )
  })
})
