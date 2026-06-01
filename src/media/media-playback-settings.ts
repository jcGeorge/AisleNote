export const MEDIA_DEFAULT_PLAYBACK_SPEED = 1
export const MEDIA_DEFAULT_VOLUME_PERCENT = 100
export const MEDIA_MAX_VOLUME_PERCENT = 150
export const MEDIA_VOLUME_KEYBOARD_STEP_PERCENT = 5

export const MEDIA_SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const

const MEDIA_SPEED_LABELS = new Map<number, string>([
  [0.25, '.25x'],
  [0.5, '.50x'],
  [0.75, '.75x'],
  [1, '1x'],
  [1.25, '1.25x'],
  [1.5, '1.50x'],
  [1.75, '1.75x'],
  [2, '2x'],
  [2.5, '2.5x'],
  [3, '3x'],
])

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001
}

export function normalizeMediaPlaybackSpeed(value: unknown): number | undefined {
  const speed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(speed)) return undefined
  return MEDIA_SPEED_PRESETS.find((preset) => nearlyEqual(preset, speed))
}

export function normalizeStoredMediaPlaybackSpeed(value: unknown): number | undefined {
  const speed = normalizeMediaPlaybackSpeed(value)
  return speed && speed !== MEDIA_DEFAULT_PLAYBACK_SPEED ? speed : undefined
}

export function normalizeMediaVolumePercent(value: unknown): number | undefined {
  const volume = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(volume)) return undefined
  const rounded = Math.round(volume)
  return rounded >= 0 && rounded <= MEDIA_MAX_VOLUME_PERCENT ? rounded : undefined
}

export function normalizeStoredMediaVolumePercent(value: unknown): number | undefined {
  const volume = normalizeMediaVolumePercent(value)
  return volume !== undefined && volume !== MEDIA_DEFAULT_VOLUME_PERCENT ? volume : undefined
}

export function getSteppedMediaVolumePercent(
  value: unknown,
  direction: 'up' | 'down',
  step = MEDIA_VOLUME_KEYBOARD_STEP_PERCENT,
): number {
  const current = normalizeMediaVolumePercent(value) ?? MEDIA_DEFAULT_VOLUME_PERCENT
  const safeStep = Number.isFinite(step) && step > 0 ? Math.round(step) : MEDIA_VOLUME_KEYBOARD_STEP_PERCENT
  const next = current + (direction === 'up' ? safeStep : -safeStep)
  return Math.min(MEDIA_MAX_VOLUME_PERCENT, Math.max(0, next))
}

export function formatMediaSpeedLabel(value: unknown): string {
  const speed = normalizeMediaPlaybackSpeed(value) ?? MEDIA_DEFAULT_PLAYBACK_SPEED
  return MEDIA_SPEED_LABELS.get(speed) ?? `${speed}x`
}
