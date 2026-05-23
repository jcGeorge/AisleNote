import { normalizeHexColor } from './defaults'

export type RgbColor = {
  r: number
  g: number
  b: number
}

export type HsvColor = {
  h: number
  s: number
  v: number
}

type RectLike = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

type PickerPanelPlacementParams = {
  anchorX: number
  anchorY: number
  panelWidth: number
  panelHeight: number
  viewportWidth: number
  viewportHeight: number
  viewportPadding?: number
  gap?: number
}

export type PickerPanelPlacement = {
  placement: 'above' | 'below'
  left: number
  top: number
  width: number
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function clampPanelCoordinate(value: number, min: number, max: number): number {
  if (max < min) return min
  return clamp(value, min, max)
}

export function clampHue(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

export function clampPercent(value: number): number {
  return clamp(value, 0, 100)
}

export function clampRgbChannel(value: number): number {
  return Math.round(clamp(value, 0, 255))
}

export function hexToRgb(value: string): RgbColor | null {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

export function rgbToHex(color: RgbColor): string {
  const toHex = (value: number) => clampRgbChannel(value).toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

export function rgbToHsv(color: RgbColor): HsvColor {
  const r = clampRgbChannel(color.r) / 255
  const g = clampRgbChannel(color.g) / 255
  const b = clampRgbChannel(color.b) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6)
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2)
    } else {
      h = 60 * ((r - g) / delta + 4)
    }
  }

  return {
    h: clampHue(h),
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  }
}

export function hsvToRgb(color: HsvColor): RgbColor {
  const h = clampHue(color.h)
  const s = clampPercent(color.s) / 100
  const v = clampPercent(color.v) / 100
  const chroma = v * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const match = v - chroma

  let r = 0
  let g = 0
  let b = 0

  if (h < 60) {
    r = chroma
    g = x
  } else if (h < 120) {
    r = x
    g = chroma
  } else if (h < 180) {
    g = chroma
    b = x
  } else if (h < 240) {
    g = x
    b = chroma
  } else if (h < 300) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  return {
    r: (r + match) * 255,
    g: (g + match) * 255,
    b: (b + match) * 255,
  }
}

export function hexToHsv(value: string, fallbackHex: string): HsvColor {
  return rgbToHsv(hexToRgb(value) ?? hexToRgb(fallbackHex) ?? { r: 0, g: 0, b: 0 })
}

export function hsvToHex(color: HsvColor): string {
  return rgbToHex(hsvToRgb(color))
}

export function getSaturationDarknessFromPoint(clientX: number, clientY: number, rect: RectLike) {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const xPercent = ((clientX - rect.left) / width) * 100
  const yPercent = ((clientY - rect.top) / height) * 100
  return {
    s: clampPercent(xPercent),
    v: clampPercent(100 - yPercent),
  }
}

export function getPickerPanelPlacement({
  anchorX,
  anchorY,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  viewportPadding = 12,
  gap = 8,
}: PickerPanelPlacementParams): PickerPanelPlacement {
  const maxPanelWidth = Math.max(1, viewportWidth - viewportPadding * 2)
  const width = Math.min(Math.max(1, panelWidth), maxPanelWidth)
  const left = clampPanelCoordinate(anchorX - width / 2, viewportPadding, viewportWidth - viewportPadding - width)
  const topAbove = anchorY - gap - panelHeight
  const placement = topAbove >= viewportPadding ? 'above' : 'below'
  const requestedTop = placement === 'above' ? topAbove : anchorY + gap
  const top = clampPanelCoordinate(requestedTop, viewportPadding, viewportHeight - viewportPadding - panelHeight)
  return { placement, left, top, width }
}

export function nudgeSaturationDarkness(
  color: HsvColor,
  key: string,
  options: { largeStep?: boolean } = {},
): HsvColor | null {
  const step = options.largeStep ? 10 : 2
  if (key === 'ArrowLeft') return { ...color, s: clampPercent(color.s - step) }
  if (key === 'ArrowRight') return { ...color, s: clampPercent(color.s + step) }
  if (key === 'ArrowUp') return { ...color, v: clampPercent(color.v + step) }
  if (key === 'ArrowDown') return { ...color, v: clampPercent(color.v - step) }
  if (key === 'Home') return { ...color, s: 0 }
  if (key === 'End') return { ...color, s: 100 }
  if (key === 'PageUp') return { ...color, v: clampPercent(color.v + 10) }
  if (key === 'PageDown') return { ...color, v: clampPercent(color.v - 10) }
  return null
}
