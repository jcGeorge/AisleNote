import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  getThemePaletteForTheme,
  getCustomThemePaletteSeedMatch,
  isThemePaletteSeed,
  normalizeThemePalettes,
  setThemePaletteOverride,
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

  it('uses the configured domain and space rail defaults for every theme', () => {
    Object.values(BUILT_IN_THEME_PALETTE_SEEDS).forEach((palette) => {
      expect(palette.domainRail).toBe('#a95429')
      expect(palette.spaceRail).toBe('#997b28')
    })
    expect(DEFAULT_CUSTOM_THEME_PALETTE.domainRail).toBe('#a95429')
    expect(DEFAULT_CUSTOM_THEME_PALETTE.spaceRail).toBe('#997b28')
  })

  it('uses the real editor surfaces for dawn and blues palette seeds', () => {
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.canvas).toBe('#d8c9a3')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.page).toBe('#8a744a')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.blues.canvas).toBe('#aeb8c6')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.blues.page).toBe('#314563')
  })

  it('drops exact legacy dawn and blues seed overrides', () => {
    const palettes = normalizeThemePalettes({
      dawn: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
        canvas: '#776238',
      },
      blues: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.blues,
        canvas: '#25324d',
      },
      light: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.light,
        primary: '#123456',
      },
    })

    expect(palettes.dawn).toBeUndefined()
    expect(palettes.blues).toBeUndefined()
    expect(palettes.light?.primary).toBe('#123456')
    expect(getThemePaletteForTheme('dawn', {
      dawn: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
        canvas: '#776238',
      },
    }).canvas).toBe('#d8c9a3')
  })

  it('normalizes per-theme palette overrides and migrates legacy custom palettes', () => {
    const legacyCustom = {
      primary: '#AbC',
      domainRail: '#a95429',
    }
    const palettes = normalizeThemePalettes(
      {
        dawn: {
          primary: '#123456',
          spaceRail: '#997b28',
        },
        unknown: {
          primary: '#ffffff',
        },
      },
      normalizeThemePalettes({ custom: legacyCustom }).custom1,
    )

    expect(palettes.dawn?.primary).toBe('#123456')
    expect(palettes.dawn?.spaceRail).toBe('#997b28')
    expect(palettes.custom1?.primary).toBe('#aabbcc')
    expect('unknown' in palettes).toBe(false)
  })

  it('updates a built-in theme palette without turning it into a custom palette', () => {
    const themePalettes = setThemePaletteOverride(BUILT_IN_THEME_PALETTE_SEEDS, 'dawn', {
      ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
      primary: '#123456',
    })

    expect(getThemePaletteForTheme('dawn', themePalettes).primary).toBe('#123456')
    expect(getThemePaletteForTheme('light', themePalettes).primary).toBe(BUILT_IN_THEME_PALETTE_SEEDS.light.primary)
    expect(isThemePaletteSeed('dawn', themePalettes.dawn)).toBe(false)
    expect(themePalettes.custom1).toBeUndefined()
  })
})
