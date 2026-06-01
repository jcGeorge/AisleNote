export type CropRatioPresetId =
  | 'freeform'
  | 'original'
  | 'square'
  | 'youtube'
  | 'shorts'
  | 'portrait'
  | 'classic'
  | 'wide'

export type CropRatioPreset = {
  id: CropRatioPresetId
  label: string
  ratio: number | null
}

export type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

export type CropBounds = {
  width: number
  height: number
}

export const CROP_RATIO_PRESETS: CropRatioPreset[] = [
  { id: 'freeform', label: 'Freeform', ratio: null },
  { id: 'original', label: 'Original', ratio: null },
  { id: 'square', label: 'Square 1:1', ratio: 1 },
  { id: 'youtube', label: 'YouTube 16:9', ratio: 16 / 9 },
  { id: 'shorts', label: 'Reels 9:16', ratio: 9 / 16 },
  { id: 'portrait', label: 'Portrait 4:5', ratio: 4 / 5 },
  { id: 'classic', label: 'Classic 4:3', ratio: 4 / 3 },
  { id: 'wide', label: 'Wide 21:9', ratio: 21 / 9 },
]

export const DEFAULT_CROP_RATIO_PRESET_ID: CropRatioPresetId = 'freeform'

const MIN_CROP_SIZE = 24

export function isCropRatioPresetId(value: unknown): value is CropRatioPresetId {
  return CROP_RATIO_PRESETS.some((preset) => preset.id === value)
}

export function normalizeCropRatioPresetId(value: unknown): CropRatioPresetId {
  return isCropRatioPresetId(value) ? value : DEFAULT_CROP_RATIO_PRESET_ID
}

export function getCropRatioPreset(id: CropRatioPresetId): CropRatioPreset {
  return CROP_RATIO_PRESETS.find((preset) => preset.id === id) ?? CROP_RATIO_PRESETS[0]
}

export function getCropRatioValue(
  id: CropRatioPresetId,
  sourceWidth: number,
  sourceHeight: number,
): number | null {
  if (id === 'freeform') return null
  if (id === 'original') {
    return sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : null
  }
  return getCropRatioPreset(id).ratio
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

export function clampCropRectToBounds(rect: CropRect, bounds: CropBounds, minSize = MIN_CROP_SIZE): CropRect {
  const maxWidth = Math.max(1, bounds.width)
  const maxHeight = Math.max(1, bounds.height)
  const width = clamp(Number.isFinite(rect.width) ? rect.width : maxWidth, Math.min(minSize, maxWidth), maxWidth)
  const height = clamp(Number.isFinite(rect.height) ? rect.height : maxHeight, Math.min(minSize, maxHeight), maxHeight)
  const x = clamp(Number.isFinite(rect.x) ? rect.x : 0, 0, maxWidth - width)
  const y = clamp(Number.isFinite(rect.y) ? rect.y : 0, 0, maxHeight - height)
  return { x, y, width, height }
}

export function fitCropRectToRatio(
  rect: CropRect,
  bounds: CropBounds,
  ratio: number | null,
  minSize = MIN_CROP_SIZE,
): CropRect {
  const bounded = clampCropRectToBounds(rect, bounds, minSize)
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return bounded

  const centerX = bounded.x + bounded.width / 2
  const centerY = bounded.y + bounded.height / 2
  let width = bounded.width
  let height = width / ratio

  if (height > bounded.height) {
    height = bounded.height
    width = height * ratio
  }
  if (width > bounds.width) {
    width = bounds.width
    height = width / ratio
  }
  if (height > bounds.height) {
    height = bounds.height
    width = height * ratio
  }

  const minWidth = Math.min(minSize, bounds.width)
  const minHeight = Math.min(minSize, bounds.height)
  if (width < minWidth) {
    width = minWidth
    height = width / ratio
  }
  if (height < minHeight) {
    height = minHeight
    width = height * ratio
  }
  if (width > bounds.width) {
    width = bounds.width
    height = width / ratio
  }
  if (height > bounds.height) {
    height = bounds.height
    width = height * ratio
  }

  return clampCropRectToBounds(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
    bounds,
    minSize,
  )
}

