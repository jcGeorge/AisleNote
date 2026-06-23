import { describe, expect, it, vi } from 'vitest'
import {
  MEDIA_PLAYBACK_SETTINGS_SELECTOR,
  getMediaPlaybackPopupFixedPosition,
  getMediaPlaybackSettingsElement,
  isMediaPlaybackSettingsTarget,
  isMediaPlaybackSettingsTargetForPlayer,
} from './media-playback-popups'

describe('media playback popup helpers', () => {
  it('detects speed and volume settings targets by closest wrapper', () => {
    const settingsElement = { className: 'aislenote-media-speed-wrap' }
    const target = {
      closest: vi.fn(() => settingsElement),
    }

    expect(getMediaPlaybackSettingsElement(target as unknown as EventTarget)).toBe(settingsElement)
    expect(isMediaPlaybackSettingsTarget(target as unknown as EventTarget)).toBe(true)
    expect(target.closest).toHaveBeenCalledWith(MEDIA_PLAYBACK_SETTINGS_SELECTOR)
  })

  it('ignores targets outside media speed and volume settings', () => {
    const target = {
      closest: vi.fn(() => null),
    }

    expect(getMediaPlaybackSettingsElement(target as unknown as EventTarget)).toBeNull()
    expect(isMediaPlaybackSettingsTarget(target as unknown as EventTarget)).toBe(false)
  })

  it('keeps settings clicks active only for the owning media player', () => {
    const settingsElement = { className: 'aislenote-media-volume-wrap' }
    const target = {
      closest: vi.fn(() => settingsElement),
    }
    const owningPlayer = {
      contains: vi.fn((node: unknown) => node === settingsElement),
    }
    const otherPlayer = {
      contains: vi.fn(() => false),
    }

    expect(
      isMediaPlaybackSettingsTargetForPlayer(
        owningPlayer as unknown as EventTarget,
        target as unknown as EventTarget,
      ),
    ).toBe(true)
    expect(
      isMediaPlaybackSettingsTargetForPlayer(
        otherPlayer as unknown as EventTarget,
        target as unknown as EventTarget,
      ),
    ).toBe(false)
  })

  it('treats missing players and non-element targets as outside clicks', () => {
    expect(isMediaPlaybackSettingsTargetForPlayer(null, null)).toBe(false)
    expect(isMediaPlaybackSettingsTargetForPlayer({} as EventTarget, {} as EventTarget)).toBe(false)
  })

  it('positions open popups above the anchor and clamps them inside the viewport', () => {
    expect(
      getMediaPlaybackPopupFixedPosition(
        { left: 100, top: 200, width: 40, height: 20 },
        { width: 80, height: 120 },
        { width: 500, height: 400 },
        'center',
      ),
    ).toEqual({ left: 80, top: 75 })
    expect(
      getMediaPlaybackPopupFixedPosition(
        { left: 2, top: 20, width: 40, height: 20 },
        { width: 120, height: 120 },
        { width: 160, height: 140 },
        'left',
      ),
    ).toEqual({ left: 8, top: 8 })
  })
})
