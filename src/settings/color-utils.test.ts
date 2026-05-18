import { describe, expect, it } from 'vitest'
import {
  getSaturationDarknessFromPoint,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  nudgeSaturationDarkness,
  rgbToHex,
  rgbToHsv,
} from './color-utils'

describe('settings color utilities', () => {
  it('normalizes hex colors before converting to RGB', () => {
    expect(hexToRgb('#2f67de')).toEqual({ r: 47, g: 103, b: 222 })
    expect(hexToRgb('abc')).toEqual({ r: 170, g: 187, b: 204 })
  })

  it('returns null for invalid hex values', () => {
    expect(hexToRgb('not-a-color')).toBeNull()
    expect(hexToRgb('#12')).toBeNull()
  })

  it('clamps RGB channels when converting to hex', () => {
    expect(rgbToHex({ r: 47, g: 103, b: 222 })).toBe('#2f67de')
    expect(rgbToHex({ r: -10, g: 260, b: 12.4 })).toBe('#00ff0c')
  })

  it('round trips RGB through HSV without changing the final hex color', () => {
    const rgb = { r: 31, g: 155, b: 103 }
    expect(rgbToHex(hsvToRgb(rgbToHsv(rgb)))).toBe('#1f9b67')
  })

  it('falls back to the provided color when a hex value is invalid', () => {
    expect(hsvToHex(hexToHsv('invalid', '#2f67de'))).toBe('#2f67de')
  })

  it('maps pointer position to saturation and darkness values', () => {
    const result = getSaturationDarknessFromPoint(75, 25, {
      left: 25,
      top: 5,
      width: 100,
      height: 80,
    } as DOMRect)

    expect(result.s).toBe(50)
    expect(result.v).toBe(75)
  })

  it('nudges saturation and darkness with keyboard arrows', () => {
    const color = { h: 215, s: 40, v: 60 }

    expect(nudgeSaturationDarkness(color, 'ArrowLeft')).toEqual({ h: 215, s: 38, v: 60 })
    expect(nudgeSaturationDarkness(color, 'ArrowUp', { largeStep: true })).toEqual({ h: 215, s: 40, v: 70 })
    expect(nudgeSaturationDarkness(color, 'x')).toBeNull()
  })
})
