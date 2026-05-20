import type {
  AppState,
  AppTheme,
  CustomThemePalette,
  CustomThemePaletteSlot,
  SettingsSection,
  TableControlTargetMode,
} from '../types/app'
import { normalizeNoteCursorLocations } from '../notes/note-cursors'
import { normalizeTipIds } from '../tips/tips'
import { normalizeHeadingCollapseState } from '../editor/heading-collapse-state'

export const DEFAULT_AUTO_REMOVE_DAYS = 7
export type BuiltInAppTheme = Exclude<AppTheme, 'custom'>
export const BUILT_IN_THEME_IDS: BuiltInAppTheme[] = ['dark', 'light', 'dawn', 'blues']
export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'hotkeys'
export const SETTINGS_SECTIONS: SettingsSection[] = [
  'data',
  'frontmatter',
  'hotkeys',
  'misc',
  'shortcuts',
  'tips',
  'toolbar',
  'visuals',
]
export const MIN_AUTO_REMOVE_DAYS = 1
export const MAX_AUTO_REMOVE_DAYS = 365

export const DEFAULT_UI_SETTINGS: AppState['ui'] = {
  showParentHomeTab: true,
  stageManagerOpenDestinationAfterApply: true,
  lastLinkInsertMode: 'note',
  tableAddTargetMode: 'bottom-right',
  tableDeleteTargetMode: 'bottom-right',
  tabButtonScale: 1,
  noteFontScale: 1,
  settingsSection: DEFAULT_SETTINGS_SECTION,
  customThemePalette: null,
  noteCursorLocations: {},
  headingCollapseState: {},
  seenTipIds: [],
  disabledTipIds: [],
}

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
]

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
}

export const BUILT_IN_THEME_PALETTE_SEEDS: Record<BuiltInAppTheme, CustomThemePalette> = {
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
    secondary: '#27a96f',
    danger: '#c64053',
    warning: '#c7792f',
    success: '#2fb36d',
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
    secondary: '#86612f',
    danger: '#8a4d44',
    warning: '#9b6726',
    success: '#3f6f4f',
  },
  blues: {
    canvas: '#25324d',
    page: '#314563',
    surface: '#aeb8c6',
    surfaceRaised: '#bcc4cd',
    text: '#17223a',
    mutedText: '#4f5f7a',
    border: '#61728f',
    primary: '#38568f',
    secondary: '#617692',
    danger: '#653f50',
    warning: '#a99a5d',
    success: '#38568f',
  },
}

export const MIN_TAB_BUTTON_SCALE = 1
export const MAX_TAB_BUTTON_SCALE = 1.6
export const TAB_BUTTON_SCALE_STEP = 0.05
export const MIN_NOTE_FONT_SCALE = 0.9
export const MAX_NOTE_FONT_SCALE = 1.8
export const NOTE_FONT_SCALE_STEP = 0.05

export function clampAutoRemoveDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REMOVE_DAYS
  return Math.min(MAX_AUTO_REMOVE_DAYS, Math.max(MIN_AUTO_REMOVE_DAYS, Math.floor(value)))
}

export function clampTabButtonScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.tabButtonScale
  const rounded = Math.round(value / TAB_BUTTON_SCALE_STEP) * TAB_BUTTON_SCALE_STEP
  return Math.min(MAX_TAB_BUTTON_SCALE, Math.max(MIN_TAB_BUTTON_SCALE, Number(rounded.toFixed(2))))
}

export function clampNoteFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.noteFontScale
  const rounded = Math.round(value / NOTE_FONT_SCALE_STEP) * NOTE_FONT_SCALE_STEP
  return Math.min(MAX_NOTE_FONT_SCALE, Math.max(MIN_NOTE_FONT_SCALE, Number(rounded.toFixed(2))))
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1].toLowerCase()
  const normalized = hex.length === 3
    ? hex.split('').map((character) => `${character}${character}`).join('')
    : hex
  return `#${normalized}`
}

export function normalizeCustomThemePalette(raw: unknown): CustomThemePalette | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  return CUSTOM_THEME_PALETTE_SLOTS.reduce<CustomThemePalette>((palette, slot) => {
    palette[slot] = normalizeHexColor(obj[slot]) ?? DEFAULT_CUSTOM_THEME_PALETTE[slot]
    return palette
  }, { ...DEFAULT_CUSTOM_THEME_PALETTE })
}

export function getCustomThemePaletteSeed(theme: AppTheme): CustomThemePalette {
  if (theme === 'custom') return { ...DEFAULT_CUSTOM_THEME_PALETTE }
  return { ...BUILT_IN_THEME_PALETTE_SEEDS[theme] }
}

export function getCustomThemePaletteSeedMatch(palette: CustomThemePalette | null | undefined): BuiltInAppTheme | null {
  if (!palette) return null
  return (
    BUILT_IN_THEME_IDS.find((theme) =>
      CUSTOM_THEME_PALETTE_SLOTS.every(
        (slot) => normalizeHexColor(palette[slot]) === BUILT_IN_THEME_PALETTE_SEEDS[theme][slot],
      ),
    ) ?? null
  )
}

export function normalizeSettingsSection(value: unknown): SettingsSection {
  return typeof value === 'string' && SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? (value as SettingsSection)
    : DEFAULT_SETTINGS_SECTION
}

export function normalizeLinkInsertMode(value: unknown): AppState['ui']['lastLinkInsertMode'] {
  return value === 'url' || value === 'note' ? value : DEFAULT_UI_SETTINGS.lastLinkInsertMode
}

export function normalizeTableControlTargetMode(value: unknown): TableControlTargetMode {
  return value === 'active-cell' || value === 'bottom-right' ? value : 'bottom-right'
}

export function normalizeUiSettings(raw: unknown): AppState['ui'] {
  if (!raw || typeof raw !== 'object') return DEFAULT_UI_SETTINGS
  const obj = raw as Record<string, unknown>
  return {
    showParentHomeTab:
      typeof obj.showParentHomeTab === 'boolean' ? obj.showParentHomeTab : DEFAULT_UI_SETTINGS.showParentHomeTab,
    stageManagerOpenDestinationAfterApply:
      typeof obj.stageManagerOpenDestinationAfterApply === 'boolean'
        ? obj.stageManagerOpenDestinationAfterApply
        : DEFAULT_UI_SETTINGS.stageManagerOpenDestinationAfterApply,
    lastLinkInsertMode: normalizeLinkInsertMode(obj.lastLinkInsertMode),
    tableAddTargetMode: normalizeTableControlTargetMode(obj.tableAddTargetMode),
    tableDeleteTargetMode: normalizeTableControlTargetMode(obj.tableDeleteTargetMode),
    tabButtonScale:
      typeof obj.tabButtonScale === 'number'
        ? clampTabButtonScale(obj.tabButtonScale)
        : DEFAULT_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof obj.noteFontScale === 'number'
        ? clampNoteFontScale(obj.noteFontScale)
        : DEFAULT_UI_SETTINGS.noteFontScale,
    settingsSection: normalizeSettingsSection(obj.settingsSection),
    customThemePalette: normalizeCustomThemePalette(obj.customThemePalette),
    noteCursorLocations: normalizeNoteCursorLocations(obj.noteCursorLocations),
    headingCollapseState: normalizeHeadingCollapseState(obj.headingCollapseState),
    seenTipIds: normalizeTipIds(obj.seenTipIds),
    disabledTipIds: normalizeTipIds(obj.disabledTipIds),
  }
}
