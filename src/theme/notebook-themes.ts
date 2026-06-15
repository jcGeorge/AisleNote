import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  ThemePaletteOverrides,
} from '../types/app'

export const CUSTOM_THEME_IDS: CustomThemeId[] = ['custom1', 'custom2', 'custom3']

export const CUSTOM_THEME_PALETTE_SLOTS: CustomThemePaletteSlot[] = [
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
]

export const CUSTOM_THEME_PALETTE_LABELS: Record<CustomThemePaletteSlot, string> = {
  canvas: 'Canvas',
  page: 'Page',
  surface: 'Surface',
  surfaceRaised: 'Raised surface',
  text: 'Text',
  mutedText: 'Muted text',
  border: 'Border',
  primary: 'Primary',
  secondary: 'Secondary',
  danger: 'Danger',
  warning: 'Warning',
  success: 'Success',
  tagText: 'Tag text',
  tagBg: 'Tag background',
  tooltipPrimary: 'Tooltip primary',
  tooltipSecondary: 'Tooltip secondary',
  sidebar: 'Sidebar',
  sidebarAccent: 'Sidebar accent',
}

export const DEFAULT_CUSTOM_THEME_PALETTE: CustomThemePalette = {
  canvas: '#0b1528',
  page: '#142642',
  surface: '#0f1b32',
  surfaceRaised: '#101d34',
  text: '#e9ecef',
  mutedText: '#9fb3d7',
  border: '#2f4672',
  primary: '#2f67de',
  secondary: '#1f9b67',
  danger: '#963442',
  warning: '#d9a441',
  success: '#2fb36d',
  tagText: '#06141a',
  tagBg: '#22d3ee',
  tooltipPrimary: '#c8d0e1',
  tooltipSecondary: '#6f7f98',
  sidebar: '#0f1b32',
  sidebarAccent: '#2f67de',
}

export const BUILT_IN_THEME_PALETTE_SEEDS: Record<AppTheme, CustomThemePalette> = {
  dark: DEFAULT_CUSTOM_THEME_PALETTE,
  light: {
    canvas: '#ffffff',
    page: '#e8eef8',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    text: '#1a2538',
    mutedText: '#536d95',
    border: '#c8d4e8',
    primary: '#2f67de',
    secondary: '#297b63',
    danger: '#a33c4a',
    warning: '#b98220',
    success: '#26885f',
    tagText: '#1a2538',
    tagBg: '#dbe8f9',
    tooltipPrimary: '#315179',
    tooltipSecondary: '#6c7f9d',
    sidebar: '#eef4fb',
    sidebarAccent: '#3f7df0',
  },
  dawn: {
    canvas: '#776238',
    page: '#8a744a',
    surface: '#d4c39a',
    surfaceRaised: '#decea8',
    text: '#253047',
    mutedText: '#705d39',
    border: '#8a744a',
    primary: '#3f6f4f',
    secondary: '#805f32',
    danger: '#8a4d44',
    warning: '#9d6d2d',
    success: '#3f6f4f',
    tagText: '#253047',
    tagBg: '#cbb987',
    tooltipPrimary: '#253047',
    tooltipSecondary: '#705d39',
    sidebar: '#b99a45',
    sidebarAccent: '#3f6f4f',
  },
  custom1: DEFAULT_CUSTOM_THEME_PALETTE,
  custom2: {
    ...DEFAULT_CUSTOM_THEME_PALETTE,
    canvas: '#111827',
    page: '#1f2937',
    surface: '#172033',
    surfaceRaised: '#202b42',
    primary: '#14b8a6',
    secondary: '#f59e0b',
    sidebarAccent: '#14b8a6',
  },
  custom3: {
    ...DEFAULT_CUSTOM_THEME_PALETTE,
    canvas: '#201a25',
    page: '#2e2634',
    surface: '#261f2c',
    surfaceRaised: '#332a3a',
    primary: '#d946ef',
    secondary: '#22c55e',
    sidebarAccent: '#d946ef',
  },
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isCustomTheme(theme: AppTheme): theme is CustomThemeId {
  return CUSTOM_THEME_IDS.includes(theme as CustomThemeId)
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toLowerCase()
  const withoutHash = trimmed.replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(withoutHash) ? `#${withoutHash.toLowerCase()}` : fallback
}

export function normalizeCustomThemePalette(raw: unknown, seed = DEFAULT_CUSTOM_THEME_PALETTE): CustomThemePalette {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<Record<CustomThemePaletteSlot, unknown>> : {}
  return CUSTOM_THEME_PALETTE_SLOTS.reduce((palette, slot) => {
    palette[slot] = normalizeHexColor(source[slot], seed[slot])
    return palette
  }, {} as CustomThemePalette)
}

export function normalizeThemePaletteOverrides(raw: unknown): ThemePaletteOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return CUSTOM_THEME_IDS.reduce((overrides, themeId) => {
    const rawPalette = (raw as Partial<Record<CustomThemeId, unknown>>)[themeId]
    if (rawPalette) {
      overrides[themeId] = normalizeCustomThemePalette(rawPalette, BUILT_IN_THEME_PALETTE_SEEDS[themeId])
    }
    return overrides
  }, {} as ThemePaletteOverrides)
}

export function getStoredCustomThemePalette(
  palettes: ThemePaletteOverrides | undefined,
  themeId: CustomThemeId,
): CustomThemePalette {
  return normalizeCustomThemePalette(palettes?.[themeId], BUILT_IN_THEME_PALETTE_SEEDS[themeId])
}

export function getThemeClassName(theme: AppTheme): string {
  if (theme === 'light') return 'theme-light'
  if (theme === 'dawn') return 'theme-dawn'
  if (isCustomTheme(theme)) return 'theme-custom-derived'
  return 'theme-dark'
}

export function getCustomThemeVariables(state: Pick<AppState, 'theme' | 'ui'>): Record<string, string> {
  if (!isCustomTheme(state.theme)) return {}
  const palette = getStoredCustomThemePalette(state.ui.themePalettes, state.theme)
  return {
    '--custom-theme-canvas': palette.canvas,
    '--custom-theme-page': palette.page,
    '--custom-theme-surface': palette.surface,
    '--custom-theme-surface-raised': palette.surfaceRaised,
    '--custom-theme-text': palette.text,
    '--custom-theme-muted-text': palette.mutedText,
    '--custom-theme-border': palette.border,
    '--custom-theme-primary': palette.primary,
    '--custom-theme-secondary': palette.secondary,
    '--custom-theme-danger': palette.danger,
    '--custom-theme-warning': palette.warning,
    '--custom-theme-success': palette.success,
    '--custom-theme-tag-text': palette.tagText,
    '--custom-theme-tag-bg': palette.tagBg,
    '--custom-theme-tooltip-primary': palette.tooltipPrimary,
    '--custom-theme-tooltip-secondary': palette.tooltipSecondary,
    '--custom-theme-sidebar': palette.sidebar,
    '--custom-theme-sidebar-accent': palette.sidebarAccent,
  }
}
