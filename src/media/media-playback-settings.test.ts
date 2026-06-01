import { describe, expect, it } from 'vitest'
import {
  formatMediaSpeedLabel,
  getSteppedMediaVolumePercent,
  normalizeMediaPlaybackSpeed,
  normalizeMediaVolumePercent,
  normalizeStoredMediaPlaybackSpeed,
  normalizeStoredMediaVolumePercent,
} from './media-playback-settings'

describe('media playback settings', () => {
  it('normalizes only supported speed presets', () => {
    expect(normalizeMediaPlaybackSpeed('.50')).toBe(0.5)
    expect(normalizeMediaPlaybackSpeed(1.5)).toBe(1.5)
    expect(normalizeMediaPlaybackSpeed(1.33)).toBeUndefined()
  })

  it('formats speed labels using the requested preset text', () => {
    expect(formatMediaSpeedLabel(0.25)).toBe('.25x')
    expect(formatMediaSpeedLabel(0.5)).toBe('.50x')
    expect(formatMediaSpeedLabel(1)).toBe('1x')
    expect(formatMediaSpeedLabel(1.5)).toBe('1.50x')
    expect(formatMediaSpeedLabel(2)).toBe('2x')
    expect(formatMediaSpeedLabel(3)).toBe('3x')
  })

  it('omits default stored playback settings', () => {
    expect(normalizeStoredMediaPlaybackSpeed(1)).toBeUndefined()
    expect(normalizeStoredMediaPlaybackSpeed(1.25)).toBe(1.25)
    expect(normalizeStoredMediaVolumePercent(100)).toBeUndefined()
    expect(normalizeStoredMediaVolumePercent(0)).toBe(0)
    expect(normalizeStoredMediaVolumePercent(150)).toBe(150)
  })

  it('bounds volume from zero to 150 percent', () => {
    expect(normalizeMediaVolumePercent(0)).toBe(0)
    expect(normalizeMediaVolumePercent(125.4)).toBe(125)
    expect(normalizeMediaVolumePercent(151)).toBeUndefined()
    expect(normalizeMediaVolumePercent(-1)).toBeUndefined()
  })

  it('steps keyboard volume by five percent within bounds', () => {
    expect(getSteppedMediaVolumePercent(100, 'up')).toBe(105)
    expect(getSteppedMediaVolumePercent(100, 'down')).toBe(95)
    expect(getSteppedMediaVolumePercent(149, 'up')).toBe(150)
    expect(getSteppedMediaVolumePercent(2, 'down')).toBe(0)
    expect(getSteppedMediaVolumePercent('not-volume', 'up')).toBe(105)
  })
})
