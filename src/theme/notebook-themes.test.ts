import { describe, expect, it } from 'vitest'
import {
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
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

  it('preserves custom palette overrides by custom theme id only', () => {
    const overrides = normalizeThemePaletteOverrides({
      custom1: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        surface: '#111111',
      },
      light: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        surface: '#222222',
      },
    })

    expect(overrides.custom1?.surface).toBe('#111111')
    expect(overrides.light).toBeUndefined()
  })
})
