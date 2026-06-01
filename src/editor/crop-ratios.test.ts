import { describe, expect, it } from 'vitest'
import {
  fitCropRectToRatio,
  getCropRatioValue,
  type CropRatioPresetId,
} from './crop-ratios'

describe('crop ratio presets', () => {
  it.each<[CropRatioPresetId, number | null]>([
    ['freeform', null],
    ['square', 1],
    ['youtube', 16 / 9],
    ['shorts', 9 / 16],
    ['portrait', 4 / 5],
    ['classic', 4 / 3],
    ['wide', 21 / 9],
  ])('returns the ratio for %s', (id, expected) => {
    expect(getCropRatioValue(id, 1920, 1080)).toBe(expected)
  })

  it('uses source bounds for the original ratio preset', () => {
    expect(getCropRatioValue('original', 1920, 1080)).toBeCloseTo(16 / 9)
    expect(getCropRatioValue('original', 1080, 1920)).toBeCloseTo(9 / 16)
    expect(getCropRatioValue('original', 1000, 1000)).toBeCloseTo(1)
  })

  it('fits a landscape crop to a requested ratio within bounds', () => {
    const rect = fitCropRectToRatio(
      { x: 10, y: 20, width: 800, height: 800 },
      { width: 1200, height: 900 },
      16 / 9,
    )

    expect(rect.width / rect.height).toBeCloseTo(16 / 9)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(1200)
    expect(rect.y + rect.height).toBeLessThanOrEqual(900)
  })

  it('fits a portrait crop to a requested ratio within bounds', () => {
    const rect = fitCropRectToRatio(
      { x: 120, y: 40, width: 700, height: 700 },
      { width: 900, height: 1200 },
      9 / 16,
    )

    expect(rect.width / rect.height).toBeCloseTo(9 / 16)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(900)
    expect(rect.y + rect.height).toBeLessThanOrEqual(1200)
  })
})

