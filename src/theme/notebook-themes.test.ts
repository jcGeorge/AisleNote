import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  copyThemePaletteToCustomPalette,
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
      'danger',
      'warning',
      'success',
      'tagText',
      'tagBg',
      'sidebar',
    ])
  })

  it('normalizes supported custom palette settings without carrying removed or unknown slots', () => {
    const palette = normalizeCustomThemePalette({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: 'ABCDEF',
      secondary: '#112233',
      tooltipPrimary: '#ccddee',
      tooltipSecondary: '#667788',
      sidebarAccent: '#123456',
      unsupportedSlot: '#ff0000',
    })

    expect(palette.primary).toBe('#abcdef')
    expect('secondary' in palette).toBe(false)
    expect('tooltipPrimary' in palette).toBe(false)
    expect('tooltipSecondary' in palette).toBe(false)
    expect('sidebarAccent' in palette).toBe(false)
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
    expect(getThemePaletteForTheme('dawn', {}).canvas).toBe('#e2bc69')
  })

  it('uses theme-specific tag background defaults', () => {
    expect(getThemePaletteForTheme('dark', {}).tagBg).toBe('#8fd1dc')
    expect(getThemePaletteForTheme('custom1', {}).tagBg).toBe('#8fd1dc')
    expect(getThemePaletteForTheme('custom2', {}).tagBg).toBe('#83ecd2')
    expect(getThemePaletteForTheme('custom3', {}).tagBg).toBe('#d574e2')
  })

  it('copies a resolved built-in palette to a selected custom palette', () => {
    const lightOverride = {
      ...BUILT_IN_THEME_PALETTE_SEEDS.light,
      primary: '#123456',
      tagBg: '#abcdef',
    }
    const custom3Override = {
      ...CUSTOM_THEME_PALETTE_SEEDS.custom3,
      warning: '#654321',
    }
    const nextPalettes = copyThemePaletteToCustomPalette(
      {
        light: lightOverride,
        custom3: custom3Override,
      },
      'light',
      'custom2',
    )

    expect(nextPalettes.custom2).toEqual(lightOverride)
    expect(nextPalettes.light).toEqual(lightOverride)
    expect(nextPalettes.custom3).toEqual(custom3Override)
  })

  it('copies a resolved custom palette override to another selected custom palette', () => {
    const custom1Override = {
      ...CUSTOM_THEME_PALETTE_SEEDS.custom1,
      canvas: '#010203',
      primary: '#040506',
    }
    const nextPalettes = copyThemePaletteToCustomPalette(
      {
        custom1: custom1Override,
      },
      'custom1',
      'custom3',
    )

    expect(nextPalettes.custom3).toEqual(custom1Override)
    expect(nextPalettes.custom1).toEqual(custom1Override)
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
    expect(variables).not.toHaveProperty('--custom-theme-secondary')
    expect(variables).not.toHaveProperty('--custom-theme-tooltip-primary')
    expect(variables).not.toHaveProperty('--custom-theme-tooltip-secondary')
    expect(variables).not.toHaveProperty('--custom-theme-sidebar-accent')
  })

  it('keeps built-in classes while enabling palette-derived tokens', () => {
    expect(getThemeClassName('light')).toBe('theme-light theme-palette-derived')
    expect(getThemeClassName('dawn')).toBe('theme-dawn theme-palette-derived')
    expect(getThemeClassName('custom1')).toBe('theme-custom-derived theme-palette-derived')
  })
})
