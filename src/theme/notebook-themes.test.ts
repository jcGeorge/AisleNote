import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  getThemeClassName,
  getThemePaletteForTheme,
  getThemePaletteVariables,
  normalizeCustomThemePalette,
  normalizeThemePaletteOverrides,
} from './notebook-themes'

describe('notebook theme palettes', () => {
  it('exposes only notebook-era custom palette slots', () => {
    expect(CUSTOM_THEME_PALETTE_SLOTS).toEqual([
      'canvas',
      'page',
      'surface',
      'surfaceRaised',
      'text',
      'mutedText',
      'border',
      'primary',
      'secondary',
      'danger',
      'warning',
      'success',
      'tagText',
      'tagBg',
      'tooltipPrimary',
      'tooltipSecondary',
      'sidebar',
      'sidebarAccent',
    ])
  })

  it('normalizes supported custom palette settings without carrying unknown slots', () => {
    const palette = normalizeCustomThemePalette({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: 'ABCDEF',
      sidebarAccent: '#123456',
      unsupportedSlot: '#ff0000',
    })

    expect(palette.primary).toBe('#abcdef')
    expect(palette.sidebarAccent).toBe('#123456')
    expect('unsupportedSlot' in palette).toBe(false)
  })

  it('preserves palette overrides by built-in and custom theme id', () => {
    const overrides = normalizeThemePaletteOverrides({
      custom1: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        surface: '#111111',
      },
      light: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.light,
        surface: '#222222',
      },
    })

    expect(overrides.custom1?.surface).toBe('#111111')
    expect(overrides.light?.surface).toBe('#222222')
  })

  it('uses cool off-white neutrals for the Light palette seed', () => {
    const light = BUILT_IN_THEME_PALETTE_SEEDS.light

    expect(light.canvas).toBe('#f2f5fa')
    expect(light.page).toBe('#dfe7f2')
    expect(light.surface).toBe('#f7f9fc')
    expect(light.surfaceRaised).toBe('#f3f6fb')
    expect([light.canvas, light.surface, light.surfaceRaised, light.sidebar]).not.toContain('#ffffff')
  })

  it('uses a warm sunrise Dawn palette as the canvas seed', () => {
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.canvas).toBe('#e2bc69')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.surfaceRaised).toBe('#ead4a9')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.sidebar).toBe('#e3cb68')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.dawn.sidebarAccent).toBe('#e3cb68')
    expect(getThemePaletteForTheme('dawn', {}).canvas).toBe('#e2bc69')
  })

  it('emits palette variables for built-in theme overrides', () => {
    const lightPalette = {
      ...BUILT_IN_THEME_PALETTE_SEEDS.light,
      canvas: '#112233',
      primary: '#445566',
    }
    const variables = getThemePaletteVariables({
      theme: 'light',
      ui: {
        themePalettes: {
          light: lightPalette,
        },
      },
    })

    expect(variables['--custom-theme-canvas']).toBe('#112233')
    expect(variables['--custom-theme-primary']).toBe('#445566')
  })

  it('keeps built-in classes while enabling palette-derived tokens', () => {
    expect(getThemeClassName('light')).toBe('theme-light theme-palette-derived')
    expect(getThemeClassName('dawn')).toBe('theme-dawn theme-palette-derived')
    expect(getThemeClassName('custom1')).toBe('theme-custom-derived theme-palette-derived')
  })
})
