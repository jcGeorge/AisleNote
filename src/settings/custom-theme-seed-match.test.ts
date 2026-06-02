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
import {
  getBuiltInThemeOverrideCssVariables,
  getCustomThemeCssVariables,
  getThemeShellCustomClassName,
} from './theme-css-variables'

describe('custom theme seed matching', () => {
  it('detects exact built-in palette seeds', () => {
    expect(getCustomThemePaletteSeedMatch(BUILT_IN_THEME_PALETTE_SEEDS.dark)).toBe('dark')
    expect(getCustomThemePaletteSeedMatch(BUILT_IN_THEME_PALETTE_SEEDS.dawn)).toBe('dawn')
  })

  it('does not match edited palettes', () => {
    expect(getCustomThemePaletteSeedMatch({
      ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
      primary: '#3f6f50',
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

  it('includes explicit tag colors in every palette seed', () => {
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dark.tagText).toBe('#06141a')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dark.tagBg).toBe('#22d3ee')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.light.tagText).toBe('#f8fafc')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.light.tagBg).toBe('#0f766e')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.tagText).toBe('#fff7ed')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.tagBg).toBe('#0f766e')
    expect(DEFAULT_CUSTOM_THEME_PALETTE.tagText).toBe('#06141a')
    expect(DEFAULT_CUSTOM_THEME_PALETTE.tagBg).toBe('#22d3ee')
  })

  it('uses the real editor surfaces for dawn and light palette seeds', () => {
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.canvas).toBe('#d8c9a3')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.page).toBe('#8a744a')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.light.canvas).toBe('#ffffff')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.light.page).toBe('#e8eef8')
  })

  it('keeps persisted per-theme palette overrides', () => {
    const palettes = normalizeThemePalettes({
      dawn: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
        canvas: '#776238',
      },
      light: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.light,
        primary: '#123456',
      },
    })

    expect(palettes.dawn?.canvas).toBe('#776238')
    expect(palettes.light?.primary).toBe('#123456')
    expect(getThemePaletteForTheme('dawn', {
      dawn: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
        canvas: '#776238',
      },
    }).canvas).toBe('#776238')
  })

  it('normalizes per-theme palette overrides', () => {
    const palettes = normalizeThemePalettes({
      custom1: {
        primary: '#AbC',
        domainRail: '#a95429',
      },
        dawn: {
          primary: '#123456',
          spaceRail: '#997b28',
        },
        unknown: {
          primary: '#ffffff',
        },
    })

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

  it('keeps edited built-in theme shell styles scoped to changed slots', () => {
    const palette = {
      ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
      parentRail: '#123456',
    }
    const variables = getBuiltInThemeOverrideCssVariables('dawn', palette)

    expect(getThemeShellCustomClassName('dawn', palette)).toBe('')
    expect(variables).toEqual({ '--parent-rail-accent': '#123456' })
    expect(variables).not.toHaveProperty('--app-page-bg')
    expect(variables).not.toHaveProperty('--custom-theme-page')
  })

  it('keeps page overrides separate from rail overrides for built-in themes', () => {
    const variables = getBuiltInThemeOverrideCssVariables('dawn', {
      ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
      page: '#112233',
    })

    expect(variables['--app-page-bg']).toBe('#112233')
    expect(variables['--settings-page-bg']).toBe('#112233')
    expect(variables).not.toHaveProperty('--parent-rail-accent')
  })

  it('keeps custom themes on the full derived theme variable path', () => {
    const palette = {
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#123456',
    }

    expect(getThemeShellCustomClassName('custom1', palette)).toBe('theme-custom-derived')
    expect(getCustomThemeCssVariables(palette)['--custom-theme-page']).toBe(DEFAULT_CUSTOM_THEME_PALETTE.page)
    expect(getCustomThemeCssVariables(palette)['--custom-theme-primary']).toBe('#123456')
  })
})
