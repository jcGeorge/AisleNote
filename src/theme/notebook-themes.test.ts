import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_PALETTE_LABELS,
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
      'panel',
      'raised',
      'button',
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

  it('uses short user-facing palette labels', () => {
    expect(CUSTOM_THEME_PALETTE_LABELS.panel).toBe('Panel')
    expect(CUSTOM_THEME_PALETTE_LABELS.raised).toBe('Raised')
    expect(CUSTOM_THEME_PALETTE_LABELS.button).toBe('Button')
  })

  it('normalizes supported custom palette settings without carrying removed or unknown slots', () => {
    const palette = normalizeCustomThemePalette({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: 'ABCDEF',
      surface: '#111111',
      surfaceRaised: '#222222',
      secondary: '#112233',
      tooltipPrimary: '#ccddee',
      tooltipSecondary: '#667788',
      sidebarAccent: '#123456',
      unsupportedSlot: '#ff0000',
    })

    expect(palette.primary).toBe('#abcdef')
    expect('surface' in palette).toBe(false)
    expect('surfaceRaised' in palette).toBe(false)
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
        panel: '#111111',
        button: '#222222',
      },
      light: {
        ...BUILT_IN_THEME_PALETTE_SEEDS.light,
        panel: '#222222',
        button: '#333333',
      },
    })

    expect(overrides.custom1?.panel).toBe('#111111')
    expect(overrides.custom1?.button).toBe('#222222')
    expect(overrides.light?.panel).toBe('#222222')
    expect(overrides.light?.button).toBe('#333333')
  })

  it('uses cool off-white neutrals for the Light palette seed', () => {
    const light = BUILT_IN_THEME_PALETTE_SEEDS.light

    expect(light.canvas).toBe('#f2f5fa')
    expect(light.page).toBe('#dfe7f2')
    expect(light.panel).toBe('#f7f9fc')
    expect(light.raised).toBe('#f3f6fb')
    expect(light.button).toBe('#dbe5f8')
    expect([light.canvas, light.panel, light.raised, light.sidebar]).not.toContain('#ffffff')
  })

  it('uses a warm sunrise Cheese palette as the canvas seed', () => {
    expect(BUILT_IN_THEME_PALETTE_SEEDS.cheese.canvas).toBe('#ead890')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.cheese.panel).toBe('#ecd8ac')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.cheese.raised).toBe('#ead4a9')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.cheese.button).toBe('#e5d07b')
    expect(BUILT_IN_THEME_PALETTE_SEEDS.cheese.sidebar).toBe('#e3cb68')
    expect(getThemePaletteForTheme('cheese', {}).canvas).toBe('#ead890')
  })

  it('uses theme-specific tag background defaults', () => {
    expect(getThemePaletteForTheme('dark', {}).tagBg).toBe('#e5c552')
    expect(getThemePaletteForTheme('cheese', {}).tagBg).toBe('#f0c142')
    expect(getThemePaletteForTheme('custom1', {}).tagBg).toBe('#e5c552')
    expect(getThemePaletteForTheme('custom2', {}).tagBg).toBe('#83ecd2')
    expect(getThemePaletteForTheme('custom3', {}).tagBg).toBe('#d574e2')
  })

  it('uses theme-specific button defaults', () => {
    expect(getThemePaletteForTheme('dark', {}).button).toBe('#13264a')
    expect(getThemePaletteForTheme('light', {}).button).toBe('#dbe5f8')
    expect(getThemePaletteForTheme('cheese', {}).button).toBe('#e5d07b')
    expect(getThemePaletteForTheme('custom1', {}).button).toBe('#13264a')
    expect(getThemePaletteForTheme('custom2', {}).button).toBe('#173543')
    expect(getThemePaletteForTheme('custom3', {}).button).toBe('#3f2447')
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
      button: '#334455',
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
    expect(variables['--custom-theme-button']).toBe('#334455')
    expect(variables['--custom-theme-primary']).toBe('#445566')
    expect(variables).not.toHaveProperty('--custom-theme-surface')
    expect(variables).not.toHaveProperty('--custom-theme-surface-raised')
    expect(variables).not.toHaveProperty('--custom-theme-secondary')
    expect(variables).not.toHaveProperty('--custom-theme-tooltip-primary')
    expect(variables).not.toHaveProperty('--custom-theme-tooltip-secondary')
    expect(variables).not.toHaveProperty('--custom-theme-sidebar-accent')
  })

  it('keeps built-in classes while enabling palette-derived tokens', () => {
    expect(getThemeClassName('light')).toBe('theme-light theme-palette-derived')
    expect(getThemeClassName('cheese')).toBe('theme-cheese theme-palette-derived')
    expect(getThemeClassName('custom1')).toBe('theme-custom-derived theme-palette-derived')
  })
})
