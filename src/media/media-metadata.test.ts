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
    const url = withMediaTransformMetadata('tabs-asset:///assets/clip.webm', legacyMetadata)

    expect(url).toBe(
      'tabs-asset:///assets/clip.webm#tabs-media=width=420,rotate=90,flip-horizontal,flip-vertical',
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
      'tabs-asset:///assets/clip.mp4#tabs-media=width=640,crop=0.1:0.2:0.3:0.4',
    )

    expect(split.mediaUrl).toBe('tabs-asset:///assets/clip.mp4')
    expect(split.metadata).toEqual({
      v: 1,
      w: 640,
    })
    expect(stripMediaMetadataFromUrl('movie.mp4#tabs-media=rotate=180')).toBe('movie.mp4')
  })

  it('builds and parses playback speed and volume while omitting defaults', () => {
    const url = withMediaTransformMetadata('tabs-asset:///assets/song.mp3', {
      v: 1,
      speed: 1.25,
      volume: 125,
    })

    expect(url).toBe('tabs-asset:///assets/song.mp3#tabs-media=speed=1.25,volume=125')
    expect(getMediaTransformMetadata(url)).toEqual({
      v: 1,
      speed: 1.25,
      volume: 125,
    })
    expect(buildMediaMetadataFragment({ v: 1, speed: 1, volume: 100 })).toBe('')
  })

  it('ignores invalid playback metadata values', () => {
    expect(getMediaTransformMetadata('song.mp3#tabs-media=speed=4,volume=200')).toBeNull()
    expect(getMediaTransformMetadata('song.mp3#tabs-media=speed=0.75,volume=-1')).toEqual({
      v: 1,
      speed: 0.75,
    })
  })

  it('ignores legacy crop-only metadata', () => {
    expect(getMediaTransformMetadata('tabs-asset:///assets/clip.mp4#tabs-media=crop=0.1:0.2:0.3:0.4,ratio=shorts')).toBeNull()
  })

  it('omits empty metadata fragments', () => {
    expect(buildMediaMetadataFragment({ v: 1 })).toBe('')
    expect(withMediaTransformMetadata('tabs-asset:///assets/clip.mp4#tabs-media=width=640', { v: 1 })).toBe(
      'tabs-asset:///assets/clip.mp4',
    )
  })
})
