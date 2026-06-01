import {
  MEDIA_DEFAULT_VOLUME_PERCENT,
  normalizeMediaVolumePercent,
} from './media-playback-settings'

type MediaVolumeState = {
  context: AudioContext
  gain: GainNode
}

const volumeStateByMedia = new WeakMap<HTMLMediaElement, MediaVolumeState>()

function createVolumeState(media: HTMLMediaElement): MediaVolumeState | null {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return null
  try {
    const context = new AudioContextCtor()
    const source = context.createMediaElementSource(media)
    const gain = context.createGain()
    source.connect(gain)
    gain.connect(context.destination)
    const state = { context, gain }
    volumeStateByMedia.set(media, state)
    return state
  } catch {
    return null
  }
}

export function applyMediaElementVolume(media: HTMLMediaElement | null | undefined, rawVolume: unknown): number {
  if (!media) return MEDIA_DEFAULT_VOLUME_PERCENT
  const volume = normalizeMediaVolumePercent(rawVolume) ?? MEDIA_DEFAULT_VOLUME_PERCENT
  const gainValue = volume / 100
  const existingState = volumeStateByMedia.get(media)

  if (volume <= MEDIA_DEFAULT_VOLUME_PERCENT && !existingState) {
    media.volume = gainValue
    return volume
  }

  const state = existingState ?? createVolumeState(media)
  if (!state) {
    media.volume = Math.min(1, gainValue)
    return volume
  }

  media.volume = volume <= MEDIA_DEFAULT_VOLUME_PERCENT ? gainValue : 1
  state.gain.gain.value = volume <= MEDIA_DEFAULT_VOLUME_PERCENT ? 1 : gainValue
  return volume
}

export function resumeMediaElementVolumeContext(media: HTMLMediaElement | null | undefined): void {
  const context = media ? volumeStateByMedia.get(media)?.context : null
  if (!context || context.state !== 'suspended') return
  void context.resume().catch(() => undefined)
}
