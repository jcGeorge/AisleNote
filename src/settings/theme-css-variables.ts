import type { AppTheme, CustomThemePalette, CustomThemePaletteSlot } from '../types/app'
import {
  getCustomThemePaletteSeed,
  getCustomThemePaletteSeedMatch,
  isCustomTheme,
  isThemePaletteSeed,
} from './defaults'

export type ThemeCssVariables = Record<`--${string}`, string>

const CUSTOM_THEME_VARIABLE_BY_SLOT: Record<CustomThemePaletteSlot, `--${string}`> = {
  canvas: '--custom-theme-canvas',
  page: '--custom-theme-page',
  surface: '--custom-theme-surface',
  surfaceRaised: '--custom-theme-surface-raised',
  text: '--custom-theme-text',
  mutedText: '--custom-theme-muted-text',
  border: '--custom-theme-border',
  primary: '--custom-theme-primary',
  secondary: '--custom-theme-secondary',
  danger: '--custom-theme-danger',
  warning: '--custom-theme-warning',
  success: '--custom-theme-success',
  tagText: '--custom-theme-tag-text',
  tagBg: '--custom-theme-tag-bg',
  domainRail: '--custom-theme-domain-rail',
  spaceRail: '--custom-theme-space-rail',
  parentRail: '--custom-theme-parent-rail',
  subtabRail: '--custom-theme-subtab-rail',
}

const BUILT_IN_OVERRIDE_VARIABLES_BY_SLOT: Partial<Record<CustomThemePaletteSlot, `--${string}`[]>> = {
  canvas: ['--app-bg', '--editor-bg', '--editor-shell-bg', '--editor-trash-home-bg'],
  page: ['--app-page-bg', '--spaces-page-bg', '--settings-page-bg'],
  surface: ['--app-surface', '--editor-panel-bg', '--editor-toolbar-bg', '--settings-card-bg'],
  surfaceRaised: ['--app-surface-raised', '--menu-bg'],
  text: ['--app-text', '--app-text-heading', '--editor-text', '--editor-heading-text', '--editor-toolbar-icon-color'],
  mutedText: ['--app-text-muted', '--app-text-subtle', '--editor-muted-text'],
  border: ['--app-border', '--app-border-muted', '--editor-border'],
  primary: ['--app-primary', '--app-primary-action', '--settings-section-tab-active-bg', '--theme-switch-option-selected-bg'],
  danger: ['--app-danger-bg', '--toast-error'],
  warning: ['--toast-warning'],
  success: ['--toast-success'],
  tagText: ['--editor-tag-text'],
  tagBg: ['--editor-tag-bg'],
  domainRail: ['--domain-rail-accent'],
  spaceRail: ['--space-rail-accent'],
  parentRail: ['--parent-rail-accent'],
  subtabRail: ['--subtab-rail-accent'],
}

export function getCustomThemeCssVariables(palette: CustomThemePalette): ThemeCssVariables {
  const variables = {} as ThemeCssVariables
  Object.entries(CUSTOM_THEME_VARIABLE_BY_SLOT).forEach(([slot, variable]) => {
    variables[variable] = palette[slot as CustomThemePaletteSlot]
  })
  return variables
}

export function getBuiltInThemeOverrideCssVariables(
  theme: AppTheme,
  palette: CustomThemePalette | null | undefined,
): ThemeCssVariables {
  if (!palette || isCustomTheme(theme) || isThemePaletteSeed(theme, palette)) return {} as ThemeCssVariables

  const seed = getCustomThemePaletteSeed(theme)
  const variables = {} as ThemeCssVariables
  Object.entries(BUILT_IN_OVERRIDE_VARIABLES_BY_SLOT).forEach(([slot, cssVariables]) => {
    const paletteSlot = slot as CustomThemePaletteSlot
    const value = palette[paletteSlot]
    if (value === seed[paletteSlot]) return
    cssVariables?.forEach((cssVariable) => {
      variables[cssVariable] = value
    })
  })
  return variables
}

export function getThemeShellCustomClassName(theme: AppTheme, activePalette: CustomThemePalette): string {
  if (!isCustomTheme(theme)) return ''

  const seedSource = getCustomThemePaletteSeedMatch(activePalette)
  if (!seedSource) return 'theme-custom-derived'
  return seedSource === 'dark'
    ? `theme-custom-seed-${seedSource}`
    : `theme-custom-seed-${seedSource} theme-${seedSource}`
}
