import { describe, expect, it, vi } from 'vitest'
import {
  MEDIA_REVEAL_CONTEXT_MENU_EVENT,
  dispatchMediaRevealContextMenuEvent,
  getMediaRevealContextMenuDetailFromTarget,
  getMediaRevealTargetFromPlayer,
} from './media-context-menu'

function createMediaPlayer(kind: 'audio' | 'video', source: string) {
  const player = {
    getAttribute: (name: string) =>
      name === 'data-media-kind' ? kind : name === 'data-media-source' ? source : null,
    ownerDocument: {
      defaultView: {
        dispatchEvent: vi.fn(() => true),
      },
    },
  } as unknown as Element
  const child = {
    closest: (selector: string) => (selector.includes('.tabs-media-player') ? player : null),
  } as unknown as Element
  return { player, child }
}

describe('media context menu helpers', () => {
  it('returns reveal metadata for local audio and video asset players', () => {
    const audio = createMediaPlayer('audio', 'tabs-asset:///assets/song.mp3#tabs-media=speed=1.5')
    const video = createMediaPlayer('video', 'tabs-asset:///assets/clip.webm#tabs-media=width=360')

    expect(getMediaRevealTargetFromPlayer(audio.player)).toEqual({
      kind: 'audio',
      source: 'tabs-asset:///assets/song.mp3#tabs-media=speed=1.5',
    })
    expect(getMediaRevealContextMenuDetailFromTarget(video.child, 12, 34)).toEqual({
      kind: 'video',
      source: 'tabs-asset:///assets/clip.webm#tabs-media=width=360',
      x: 12,
      y: 34,
    })
  })

  it('ignores external media and non-media asset links', () => {
    const external = createMediaPlayer('audio', 'https://example.com/song.mp3')
    const pdf = createMediaPlayer('audio', 'tabs-asset:///assets/file.pdf')
    const plainTarget = {
      closest: () => null,
    } as unknown as Element

    expect(getMediaRevealTargetFromPlayer(external.player)).toBeNull()
    expect(getMediaRevealTargetFromPlayer(pdf.player)).toBeNull()
    expect(getMediaRevealContextMenuDetailFromTarget(plainTarget, 0, 0)).toBeNull()
  })

  it('dispatches a window-level media context menu event from preview players', () => {
    const { player } = createMediaPlayer('audio', 'tabs-asset:///assets/song.mp3')
    const ownerWindow = player.ownerDocument.defaultView as unknown as { dispatchEvent: ReturnType<typeof vi.fn> }

    expect(
      dispatchMediaRevealContextMenuEvent(player, {
        kind: 'audio',
        source: 'tabs-asset:///assets/song.mp3',
        x: 2,
        y: 4,
      }),
    ).toBe(true)
    expect(ownerWindow.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: MEDIA_REVEAL_CONTEXT_MENU_EVENT,
      detail: {
        kind: 'audio',
        source: 'tabs-asset:///assets/song.mp3',
        x: 2,
        y: 4,
      },
    }))
  })

  it('returns false when a player has no owner window for event dispatch', () => {
    const player = {
      ownerDocument: {},
    } as unknown as Element

    expect(
      dispatchMediaRevealContextMenuEvent(player, {
        kind: 'audio',
        source: 'tabs-asset:///assets/song.mp3',
        x: 2,
        y: 4,
      }),
    ).toBe(false)
  })
})
