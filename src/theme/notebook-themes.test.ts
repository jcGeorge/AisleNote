import { describe, expect, it } from 'vitest'
import {
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  normalizeCustomThemePalette,
  normalizeThemePaletteOverrides,
} from './notebook-themes'

describe('notebook theme palettes', () => {
  it('excludes removed tab rail palette slots', () => {
    expect(CUSTOM_THEME_PALETTE_SLOTS).not.toContain('domainRail')
    expect(CUSTOM_THEME_PALETTE_SLOTS).not.toContain('spaceRail')
    expect(CUSTOM_THEME_PALETTE_SLOTS).not.toContain('parentRail')
    expect(CUSTOM_THEME_PALETTE_SLOTS).not.toContain('subtabRail')
  })

  it('normalizes supported custom palette settings without carrying removed slots', () => {
    const palette = normalizeCustomThemePalette({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: 'ABCDEF',
      sidebarAccent: '#123456',
      domainRail: '#ff0000',
    })

    expect(palette.primary).toBe('#abcdef')
    expect(palette.sidebarAccent).toBe('#123456')
    expect('domainRail' in palette).toBe(false)
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
