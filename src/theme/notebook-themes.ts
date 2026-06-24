import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  ThemePaletteOverrides,
} from '../types/app'

export type BuiltInAppTheme = Exclude<AppTheme, CustomThemeId>

export const BUILT_IN_THEME_IDS: BuiltInAppTheme[] = ['dark', 'light', 'cheese']
export const CUSTOM_THEME_IDS: CustomThemeId[] = ['custom1', 'custom2', 'custom3']
export const DEFAULT_CUSTOM_THEME_ID: CustomThemeId = 'custom1'
export const APP_THEME_IDS: AppTheme[] = [...BUILT_IN_THEME_IDS, ...CUSTOM_THEME_IDS]

export const CUSTOM_THEME_PALETTE_SLOTS: CustomThemePaletteSlot[] = [
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
]

export const CUSTOM_THEME_PALETTE_LABELS: Record<CustomThemePaletteSlot, string> = {
  canvas: 'App background',
  page: 'Page background',
  surface: 'Surface',
  surfaceRaised: 'Raised surface',
  text: 'Text',
  mutedText: 'Muted text',
  border: 'Border',
  primary: 'Primary',
  danger: 'Danger',
  warning: 'Warning',
  success: 'Success',
  tagText: 'Tag text',
  tagBg: 'Tag background',
  sidebar: 'Sidebar',
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
  danger: '#963442',
  warning: '#d9a441',
  success: '#2fb36d',
  tagText: '#06141a',
  tagBg: '#8fd1dc',
  sidebar: '#0f1b32',
}

export const BUILT_IN_THEME_PALETTE_SEEDS: Record<BuiltInAppTheme, CustomThemePalette> = {
  dark: DEFAULT_CUSTOM_THEME_PALETTE,
  light: {
    canvas: '#f2f5fa',
    page: '#dfe7f2',
    surface: '#f7f9fc',
    surfaceRaised: '#f3f6fb',
    text: '#1a2538',
    mutedText: '#4f668b',
    border: '#b9c8dd',
    primary: '#2f67de',
    danger: '#a33c4a',
    warning: '#b98220',
    success: '#26885f',
    tagText: '#1a2538',
    tagBg: '#d4e1f3',
    sidebar: '#e6edf6',
  },
  cheese: {
    canvas: '#ead890',
    page: '#f1d58a',
    surface: '#ecd8ac',
    surfaceRaised: '#ead4a9',
    text: '#243047',
    mutedText: '#615342',
    border: '#b18450',
    primary: '#3f715d',
    danger: '#a8554d',
    warning: '#a96f1f',
    success: '#3f7a5e',
    tagText: '#243047',
    tagBg: '#f2d47f',
    sidebar: '#e3cb68',
  },
}

export const CUSTOM_THEME_PALETTE_SEEDS: Record<CustomThemeId, CustomThemePalette> = {
  custom1: DEFAULT_CUSTOM_THEME_PALETTE,
  custom2: {
    ...DEFAULT_CUSTOM_THEME_PALETTE,
    canvas: '#111827',
    page: '#1f2937',
    surface: '#172033',
    surfaceRaised: '#202b42',
    primary: '#14b8a6',
    tagBg: '#83ecd2',
  },
  custom3: {
    ...DEFAULT_CUSTOM_THEME_PALETTE,
    canvas: '#201a25',
    page: '#2e2634',
    surface: '#261f2c',
    surfaceRaised: '#332a3a',
    primary: '#d946ef',
    tagBg: '#d574e2',
  },
}

export const THEME_PALETTE_SEEDS: Record<AppTheme, CustomThemePalette> = {
  ...BUILT_IN_THEME_PALETTE_SEEDS,
  ...CUSTOM_THEME_PALETTE_SEEDS,
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
  return APP_THEME_IDS.reduce((overrides, themeId) => {
    const rawPalette = (raw as Partial<Record<AppTheme, unknown>>)[themeId]
    if (rawPalette) {
      overrides[themeId] = normalizeCustomThemePalette(rawPalette, THEME_PALETTE_SEEDS[themeId])
    }
    return overrides
  }, {} as ThemePaletteOverrides)
}

export function getCustomThemePaletteSeed(theme: AppTheme): CustomThemePalette {
  return { ...THEME_PALETTE_SEEDS[theme] }
}

export function getThemePaletteForTheme(
  theme: AppTheme,
  palettes: ThemePaletteOverrides | null | undefined,
): CustomThemePalette {
  return normalizeCustomThemePalette(palettes?.[theme], THEME_PALETTE_SEEDS[theme])
}

export function getStoredCustomThemePalette(
  palettes: ThemePaletteOverrides | undefined,
  themeId: CustomThemeId,
): CustomThemePalette {
  return getThemePaletteForTheme(themeId, palettes)
}

function isExactThemePaletteSeed(seed: CustomThemePalette, palette: CustomThemePalette | null | undefined): boolean {
  if (!palette) return false
  return CUSTOM_THEME_PALETTE_SLOTS.every((slot) => normalizeHexColor(palette[slot], '') === seed[slot])
}

export function isThemePaletteSeed(theme: AppTheme, palette: CustomThemePalette | null | undefined): boolean {
  return isExactThemePaletteSeed(THEME_PALETTE_SEEDS[theme], palette)
}

export function setThemePaletteOverride(
  themePalettes: ThemePaletteOverrides | null | undefined,
  theme: AppTheme,
  palette: CustomThemePalette,
): ThemePaletteOverrides {
  return {
    ...(themePalettes ?? {}),
    [theme]: { ...palette },
  }
}

export function copyThemePaletteToCustomPalette(
  themePalettes: ThemePaletteOverrides | null | undefined,
  sourceTheme: AppTheme,
  targetTheme: CustomThemeId,
): ThemePaletteOverrides {
  const sourcePalette = getThemePaletteForTheme(sourceTheme, themePalettes)
  const targetPalette = normalizeCustomThemePalette(sourcePalette, getCustomThemePaletteSeed(targetTheme))
  return setThemePaletteOverride(themePalettes, targetTheme, targetPalette)
}

export function removeThemePaletteOverride(
  themePalettes: ThemePaletteOverrides | null | undefined,
  theme: AppTheme,
): ThemePaletteOverrides {
  const next = { ...(themePalettes ?? {}) }
  delete next[theme]
  return next
}

export function getCustomThemePaletteSeedMatch(
  palette: CustomThemePalette | null | undefined,
): BuiltInAppTheme | null {
  if (!palette) return null
  return (
    BUILT_IN_THEME_IDS.find((theme) =>
      CUSTOM_THEME_PALETTE_SLOTS.every(
        (slot) => normalizeHexColor(palette[slot], '') === BUILT_IN_THEME_PALETTE_SEEDS[theme][slot],
      ),
    ) ?? null
  )
}

export function getThemeClassName(theme: AppTheme): string {
  if (theme === 'light') return 'theme-light theme-palette-derived'
  if (theme === 'cheese') return 'theme-cheese theme-palette-derived'
  if (isCustomTheme(theme)) return 'theme-custom-derived theme-palette-derived'
  return 'theme-dark theme-palette-derived'
}

export function getThemePaletteVariables(
  state: Pick<AppState, 'theme'> & { ui: Pick<AppState['ui'], 'themePalettes'> },
): Record<string, string> {
  const palette = getThemePaletteForTheme(state.theme, state.ui.themePalettes)
  return {
    '--custom-theme-canvas': palette.canvas,
    '--custom-theme-page': palette.page,
    '--custom-theme-surface': palette.surface,
    '--custom-theme-surface-raised': palette.surfaceRaised,
    '--custom-theme-text': palette.text,
    '--custom-theme-muted-text': palette.mutedText,
    '--custom-theme-border': palette.border,
    '--custom-theme-primary': palette.primary,
    '--custom-theme-danger': palette.danger,
    '--custom-theme-warning': palette.warning,
    '--custom-theme-success': palette.success,
    '--custom-theme-tag-text': palette.tagText,
    '--custom-theme-tag-bg': palette.tagBg,
    '--custom-theme-sidebar': palette.sidebar,
  }
}

export const getCustomThemeVariables = getThemePaletteVariables
