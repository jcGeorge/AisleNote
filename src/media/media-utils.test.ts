import { describe, expect, it } from 'vitest'
import { buildAssetUrl } from '../markdown/image-asset-refs.js'
import { registerAssetBytes } from '../markdown/image-asset-registry'
import {
  MEDIA_SEEK_STEP_SECONDS,
  formatMediaTime,
  getMediaDisplayTitle,
  getMediaKeyboardAction,
  getMediaKindFromFile,
  getMediaKindFromUrl,
  getMediaSeekTime,
  getMediaSliderDisplayValue,
  isPotentialMediaUrl,
} from './media-utils'

describe('media utils', () => {
  it('detects registered asset media kinds from mime types before extension fallback', () => {
    registerAssetBytes('assets/audio-webm.webm', new Uint8Array([1]), 'audio/webm')
    registerAssetBytes('assets/video-m4a.m4a', new Uint8Array([2]), 'video/mp4')

    expect(getMediaKindFromUrl(buildAssetUrl('assets/audio-webm.webm'))).toBe('audio')
    expect(getMediaKindFromUrl(buildAssetUrl('assets/video-m4a.m4a'))).toBe('video')
  })

  it('detects common audio and video file urls with query and hash suffixes', () => {
    expect(getMediaKindFromUrl('https://example.com/song.mp3?download=1#clip')).toBe('audio')
    expect(getMediaKindFromUrl('recordings/take.wav')).toBe('audio')
    expect(getMediaKindFromUrl('https://example.com/movie.mp4?x=1')).toBe('video')
    expect(getMediaKindFromUrl('assets/clip.webm#t=12')).toBe('video')
    expect(getMediaKindFromUrl('assets/report.pdf')).toBeNull()
  })

  it('cheaply rejects ordinary external links before media parsing work', () => {
    expect(isPotentialMediaUrl('https://lucide.dev/icons/table-of-contents')).toBe(false)
    expect(isPotentialMediaUrl('https://example.com/docs')).toBe(false)
    expect(isPotentialMediaUrl('https://example.com/song.mp3')).toBe(true)
    expect(isPotentialMediaUrl('data:audio/mpeg;base64,abc')).toBe(true)
    expect(isPotentialMediaUrl(buildAssetUrl('assets/registered-media'))).toBe(true)
  })

  it('detects the supported media extension allowlist', () => {
    for (const extension of ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus']) {
      expect(getMediaKindFromUrl(`assets/song.${extension}`), extension).toBe('audio')
    }
    for (const extension of ['mp4', 'm4v', 'webm']) {
      expect(getMediaKindFromUrl(`assets/clip.${extension}`), extension).toBe('video')
    }
  })

  it('hides supported media extensions from displayed player titles only', () => {
    expect(getMediaDisplayTitle('Miho Komatsu - Mystery.mp3', 'audio')).toBe('Miho Komatsu - Mystery')
    expect(getMediaDisplayTitle('Creed - One Last Breath.MP4', 'video')).toBe('Creed - One Last Breath')
    expect(getMediaDisplayTitle('clip.final.webm', 'video')).toBe('clip.final')
    expect(getMediaDisplayTitle('notes.pdf', 'audio')).toBe('notes.pdf')
    expect(getMediaDisplayTitle('', 'audio')).toBe('audio')
  })

  it('detects media urls with app-owned transform metadata fragments', () => {
    expect(getMediaKindFromUrl('aislenote-asset:///assets/clip.webm#aislenote-media=width=320,ratio=shorts')).toBe('video')
    expect(getMediaKindFromUrl('aislenote-asset:///assets/song.mp3#aislenote-media=width=320')).toBe('audio')
  })

  it('detects media file kinds from mime type before file extension fallback', () => {
    expect(getMediaKindFromFile({ type: 'audio/mpeg', name: 'wrong.mp4' })).toBe('audio')
    expect(getMediaKindFromFile({ type: 'video/webm', name: 'wrong.mp3' })).toBe('video')
    expect(getMediaKindFromFile({ type: '', name: 'song.m4a' })).toBe('audio')
    expect(getMediaKindFromFile({ type: '', name: 'clip.mov' })).toBe('video')
    expect(getMediaKindFromFile({ type: 'application/pdf', name: 'report.pdf' })).toBeNull()
  })

  it('formats media times and clamps seek positions', () => {
    expect(formatMediaTime(Number.NaN)).toBe('0:00')
    expect(formatMediaTime(65.9)).toBe('1:05')
    expect(formatMediaTime(3723.4)).toBe('1:02:03')

    expect(MEDIA_SEEK_STEP_SECONDS).toBe(10)
    expect(getMediaSeekTime(4, -10, 100)).toBe(0)
    expect(getMediaSeekTime(95, 10, 100)).toBe(100)
    expect(getMediaSeekTime(25, 10, 100)).toBe(35)
  })

  it('keeps slider syncing after focus-preserving seeks', () => {
    expect(getMediaSliderDisplayValue(12.5, '4', false)).toBe('12.5')
    expect(getMediaSliderDisplayValue(Number.NaN, '4', false)).toBe('0')
  })

  it('preserves the in-progress slider value while the pointer is dragging', () => {
    expect(getMediaSliderDisplayValue(12.5, '4', true)).toBe('4')
  })

  it('maps focused media keyboard shortcuts to playback actions', () => {
    expect(getMediaKeyboardAction({ key: ' ', code: 'Space' })).toBe('toggle-playback')
    expect(getMediaKeyboardAction({ key: 'Spacebar' })).toBe('toggle-playback')
    expect(getMediaKeyboardAction({ key: 'ArrowLeft' })).toBe('seek-backward')
    expect(getMediaKeyboardAction({ code: 'ArrowRight' })).toBe('seek-forward')
    expect(getMediaKeyboardAction({ key: 'ArrowDown' })).toBe('volume-down')
    expect(getMediaKeyboardAction({ code: 'ArrowUp' })).toBe('volume-up')
  })

  it('ignores media keyboard shortcuts with command modifiers', () => {
    expect(getMediaKeyboardAction({ key: 'ArrowLeft', metaKey: true })).toBeNull()
    expect(getMediaKeyboardAction({ key: 'ArrowRight', ctrlKey: true })).toBeNull()
    expect(getMediaKeyboardAction({ key: 'ArrowUp', metaKey: true })).toBeNull()
    expect(getMediaKeyboardAction({ key: 'ArrowDown', ctrlKey: true })).toBeNull()
    expect(getMediaKeyboardAction({ key: ' ', altKey: true })).toBeNull()
  })
})
