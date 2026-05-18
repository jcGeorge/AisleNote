import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  getCustomThemePaletteSeedMatch,
} from './defaults'

describe('custom theme seed matching', () => {
  it('detects exact built-in palette seeds', () => {
    expect(getCustomThemePaletteSeedMatch(BUILT_IN_THEME_PALETTE_SEEDS.dark)).toBe('dark')
    expect(getCustomThemePaletteSeedMatch(BUILT_IN_THEME_PALETTE_SEEDS.blues)).toBe('blues')
  })

  it('does not match edited palettes', () => {
    expect(getCustomThemePaletteSeedMatch({
      ...BUILT_IN_THEME_PALETTE_SEEDS.blues,
      primary: '#385690',
    })).toBeNull()
  })
})
