import { describe, expect, it } from 'vitest'
import { getExtensionFromMimeType, getMimeTypeFromExtension } from './hybrid-storage-core.js'

describe('hybrid storage media mime helpers', () => {
  it('maps the supported media extensions to browser-playable mime types', () => {
    expect(getMimeTypeFromExtension('mp4')).toBe('video/mp4')
    expect(getMimeTypeFromExtension('m4v')).toBe('video/mp4')
    expect(getMimeTypeFromExtension('webm')).toBe('video/webm')
    expect(getMimeTypeFromExtension('mp3')).toBe('audio/mpeg')
    expect(getMimeTypeFromExtension('m4a')).toBe('audio/mp4')
    expect(getMimeTypeFromExtension('aac')).toBe('audio/aac')
    expect(getMimeTypeFromExtension('wav')).toBe('audio/wav')
    expect(getMimeTypeFromExtension('flac')).toBe('audio/flac')
    expect(getMimeTypeFromExtension('ogg')).toBe('audio/ogg')
    expect(getMimeTypeFromExtension('oga')).toBe('audio/ogg')
    expect(getMimeTypeFromExtension('opus')).toBe('audio/ogg')
  })

  it('maps supported media mime types back to stable extensions', () => {
    expect(getExtensionFromMimeType('video/mp4')).toBe('mp4')
    expect(getExtensionFromMimeType('video/webm')).toBe('webm')
    expect(getExtensionFromMimeType('audio/mpeg')).toBe('mp3')
    expect(getExtensionFromMimeType('audio/mp4')).toBe('m4a')
    expect(getExtensionFromMimeType('audio/aac')).toBe('aac')
    expect(getExtensionFromMimeType('audio/wav')).toBe('wav')
    expect(getExtensionFromMimeType('audio/flac')).toBe('flac')
    expect(getExtensionFromMimeType('audio/ogg')).toBe('ogg')
  })
})
