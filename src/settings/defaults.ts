import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  DataSettingsSection,
  SettingsSection,
  TableControlTargetMode,
  TableOfContentsScope,
  ThemePaletteOverrides,
  VisualsSettingsSection,
} from '../types/app'
import { normalizeNoteCursorLocations } from '../notes/note-cursors'
import { normalizeAisleWidths } from '../notes/aisle-widths'
import { normalizeTipIds } from '../tips/tips'
import { normalizeHeadingCollapseState } from '../editor/heading-collapse-state'
import { normalizeToolbarLayouts } from '../editor/toolbar-layouts'
import { clampScratchpadAisleLimit, DEFAULT_SCRATCHPAD_AISLE_LIMIT } from '../state/scratchpad-limits'
import {
  DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  normalizeRegisteredSyncedUiSetting,
  normalizeRegisteredSyncedUiSettings,
} from './synced-ui-settings-registry.js'

export const DEFAULT_AUTO_REMOVE_DAYS = 7
export type BuiltInAppTheme = Exclude<AppTheme, CustomThemeId>
export const BUILT_IN_THEME_IDS: BuiltInAppTheme[] = ['dark', 'light', 'dawn']
export const CUSTOM_THEME_IDS: CustomThemeId[] = ['custom1', 'custom2', 'custom3']
export const DEFAULT_CUSTOM_THEME_ID: CustomThemeId = 'custom1'
export const APP_THEME_IDS: AppTheme[] = [...BUILT_IN_THEME_IDS, ...CUSTOM_THEME_IDS]
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
export const DEFAULT_DATA_SETTINGS_SECTION: DataSettingsSection = 'transfer'
export const DATA_SETTINGS_SECTIONS: DataSettingsSection[] = ['transfer', 'storage', 'trash']
export const DEFAULT_VISUALS_SETTINGS_SECTION: VisualsSettingsSection = 'theming'
export const VISUALS_SETTINGS_SECTIONS: VisualsSettingsSection[] = ['theming', 'otherVisuals']
export const MIN_AUTO_REMOVE_DAYS = 1
export const MAX_AUTO_REMOVE_DAYS = 365

export const DEFAULT_UI_SETTINGS: AppState['ui'] = {
  ...DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  showRegularNoteAisleAddButtons: false,
  showRegularNoteAisleDeleteButton: false,
  noteFilter: {
    active: false,
    kind: 'tags',
    tags: {
      selectedKeys: [],
      sortMode: 'az',
    },
    synced: {
      selectedKeys: [],
    },
    frontmatter: {
      selectedKeys: [],
    },
    media: {
      selectedKeys: [],
    },
  },
  noteFontScale: 1,
  toolbarButtonScale: 1,
  scratchpadAisleLimit: DEFAULT_SCRATCHPAD_AISLE_LIMIT,
  settingsSection: DEFAULT_SETTINGS_SECTION,
  dataSettingsSection: DEFAULT_DATA_SETTINGS_SECTION,
  visualsSettingsSection: DEFAULT_VISUALS_SETTINGS_SECTION,
  selectedCustomTheme: DEFAULT_CUSTOM_THEME_ID,
  themePalettes: {},
  noteCursorLocations: {},
  headingCollapseState: {},
  aisleWidths: {},
  toolbarLayouts: [],
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
  'tagText',
  'tagBg',
  'tooltipPrimary',
  'tooltipSecondary',
  'sidebar',
  'sidebarAccent',
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
  tagText: '#06141a',
  tagBg: '#22d3ee',
  tooltipPrimary: '#c8d0e1',
  tooltipSecondary: '#6f7f98',
  sidebar: '#0f1b32',
  sidebarAccent: '#2f67de',
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
    tagText: '#f8fafc',
    tagBg: '#0f766e',
    tooltipPrimary: '#555555',
    tooltipSecondary: '#9aa3b2',
    sidebar: '#eef4fb',
    sidebarAccent: '#3f7df0',
  },
  dawn: {
    canvas: '#d8c9a3',
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
    tagText: '#fff7ed',
    tagBg: '#0f766e',
    tooltipPrimary: '#555555',
    tooltipSecondary: '#8a744a',
    sidebar: '#b99a45',
    sidebarAccent: '#3f6f4f',
  },
}

export const MIN_NOTE_FONT_SCALE = 0.9
export const MAX_NOTE_FONT_SCALE = 1.8
export const NOTE_FONT_SCALE_STEP = 0.05
export const MIN_TOOLBAR_BUTTON_SCALE = 0.8
export const MAX_TOOLBAR_BUTTON_SCALE = 1.6
export const TOOLBAR_BUTTON_SCALE_STEP = 0.05

export function clampAutoRemoveDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REMOVE_DAYS
  return Math.min(MAX_AUTO_REMOVE_DAYS, Math.max(MIN_AUTO_REMOVE_DAYS, Math.floor(value)))
}

export function clampNoteFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.noteFontScale
  const rounded = Math.round(value / NOTE_FONT_SCALE_STEP) * NOTE_FONT_SCALE_STEP
  return Math.min(MAX_NOTE_FONT_SCALE, Math.max(MIN_NOTE_FONT_SCALE, Number(rounded.toFixed(2))))
}

export function clampToolbarButtonScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.toolbarButtonScale ?? 1
  const rounded = Math.round(value / TOOLBAR_BUTTON_SCALE_STEP) * TOOLBAR_BUTTON_SCALE_STEP
  return Math.min(MAX_TOOLBAR_BUTTON_SCALE, Math.max(MIN_TOOLBAR_BUTTON_SCALE, Number(rounded.toFixed(2))))
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

export function isCustomTheme(theme: AppTheme): theme is CustomThemeId {
  return CUSTOM_THEME_IDS.includes(theme as CustomThemeId)
}

export function normalizeCustomThemeId(
  value: unknown,
  fallback: CustomThemeId = DEFAULT_CUSTOM_THEME_ID,
): CustomThemeId {
  return typeof value === 'string' && CUSTOM_THEME_IDS.includes(value as CustomThemeId)
    ? (value as CustomThemeId)
    : fallback
}

function isExactThemePaletteSeed(seed: CustomThemePalette, palette: CustomThemePalette | null | undefined): boolean {
  if (!palette) return false
  return CUSTOM_THEME_PALETTE_SLOTS.every((slot) => normalizeHexColor(palette[slot]) === seed[slot])
}

export function normalizeThemePalettes(raw: unknown): ThemePaletteOverrides {
  const palettes: ThemePaletteOverrides = {}
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    APP_THEME_IDS.forEach((theme) => {
      const palette = normalizeCustomThemePalette(obj[theme])
      if (palette) palettes[theme] = palette
    })
  }
  return palettes
}

export function getCustomThemePaletteSeed(theme: AppTheme): CustomThemePalette {
  if (isCustomTheme(theme)) return { ...DEFAULT_CUSTOM_THEME_PALETTE }
  return { ...BUILT_IN_THEME_PALETTE_SEEDS[theme] }
}

export function getThemePaletteForTheme(
  theme: AppTheme,
  themePalettes: ThemePaletteOverrides | null | undefined,
): CustomThemePalette {
  const override = themePalettes?.[theme] ?? null
  return { ...(override ?? getCustomThemePaletteSeed(theme)) }
}

export function isThemePaletteSeed(theme: AppTheme, palette: CustomThemePalette | null | undefined): boolean {
  const seed = getCustomThemePaletteSeed(theme)
  return isExactThemePaletteSeed(seed, palette)
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

export function removeThemePaletteOverride(
  themePalettes: ThemePaletteOverrides | null | undefined,
  theme: AppTheme,
): ThemePaletteOverrides {
  const next = { ...(themePalettes ?? {}) }
  delete next[theme]
  return next
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

export function normalizeVisualsSettingsSection(
  value: unknown,
  fallback: VisualsSettingsSection = DEFAULT_VISUALS_SETTINGS_SECTION,
): VisualsSettingsSection {
  return typeof value === 'string' && VISUALS_SETTINGS_SECTIONS.includes(value as VisualsSettingsSection)
    ? (value as VisualsSettingsSection)
    : fallback
}

export function normalizeDataSettingsSection(
  value: unknown,
  fallback: DataSettingsSection = DEFAULT_DATA_SETTINGS_SECTION,
): DataSettingsSection {
  return typeof value === 'string' && DATA_SETTINGS_SECTIONS.includes(value as DataSettingsSection)
    ? (value as DataSettingsSection)
    : fallback
}

export function normalizeLinkInsertMode(value: unknown): AppState['ui']['lastLinkInsertMode'] {
  return normalizeRegisteredSyncedUiSetting('lastLinkInsertMode', value)
}

export function normalizeNoteCopyMode(value: unknown): AppState['ui']['lastNoteCopyMode'] {
  return normalizeRegisteredSyncedUiSetting('lastNoteCopyMode', value)
}

export function normalizeTableControlTargetMode(value: unknown): TableControlTargetMode {
  return normalizeRegisteredSyncedUiSetting('tableAddTargetMode', value)
}

export function normalizeTableOfContentsScope(value: unknown): TableOfContentsScope {
  return normalizeRegisteredSyncedUiSetting('tableOfContentsScope', value)
}

export function normalizeScratchpadNewAisleSide(value: unknown): AppState['ui']['scratchpadNewAisleSide'] {
  return normalizeRegisteredSyncedUiSetting('scratchpadNewAisleSide', value)
}

export function normalizeFindReplaceMode(value: unknown): AppState['ui']['findReplaceMode'] {
  return normalizeRegisteredSyncedUiSetting('findReplaceMode', value)
}

export function normalizeFindReplaceScope(value: unknown): AppState['ui']['findReplaceScope'] {
  return normalizeRegisteredSyncedUiSetting('findReplaceScope', value)
}

function normalizeNoteFilterSelectedKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  )
}

export function normalizeNoteFilterSettings(value: unknown): NonNullable<AppState['ui']['noteFilter']> {
  const defaults = DEFAULT_UI_SETTINGS.noteFilter
  if (!defaults) {
    return {
      active: false,
      kind: 'tags',
      tags: { selectedKeys: [], sortMode: 'az' },
      synced: { selectedKeys: [] },
      frontmatter: { selectedKeys: [] },
      media: { selectedKeys: [] },
    }
  }
  if (!value || typeof value !== 'object') return defaults
  const obj = value as Record<string, unknown>
  const kind = obj.kind === 'synced' || obj.kind === 'frontmatter' || obj.kind === 'media' || obj.kind === 'tags'
    ? obj.kind
    : defaults.kind
  const tagSettings = obj.tags && typeof obj.tags === 'object' ? obj.tags as Record<string, unknown> : {}
  const syncedSettings = obj.synced && typeof obj.synced === 'object' ? obj.synced as Record<string, unknown> : {}
  const frontmatterSettings = obj.frontmatter && typeof obj.frontmatter === 'object'
    ? obj.frontmatter as Record<string, unknown>
    : {}
  const mediaSettings = obj.media && typeof obj.media === 'object' ? obj.media as Record<string, unknown> : {}
  return {
    active: typeof obj.active === 'boolean' ? obj.active : defaults.active,
    kind,
    tags: {
      selectedKeys: normalizeNoteFilterSelectedKeys(tagSettings.selectedKeys),
      sortMode: tagSettings.sortMode === 'occurrences' ? 'occurrences' : 'az',
    },
    synced: {
      selectedKeys: normalizeNoteFilterSelectedKeys(syncedSettings.selectedKeys),
    },
    frontmatter: {
      selectedKeys: normalizeNoteFilterSelectedKeys(frontmatterSettings.selectedKeys),
    },
    media: {
      selectedKeys: normalizeNoteFilterSelectedKeys(mediaSettings.selectedKeys),
    },
  }
}

export function normalizeUiSettings(raw: unknown): AppState['ui'] {
  if (!raw || typeof raw !== 'object') return DEFAULT_UI_SETTINGS
  const obj = raw as Record<string, unknown>
  const registeredSettings = normalizeRegisteredSyncedUiSettings(obj)
  const themePalettes = normalizeThemePalettes(obj.themePalettes)
  const showRegularNoteAisleAddButtons =
    typeof obj.showRegularNoteAisleAddButtons === 'boolean'
      ? obj.showRegularNoteAisleAddButtons
      : DEFAULT_UI_SETTINGS.showRegularNoteAisleAddButtons
  const showRegularNoteAisleDeleteButton =
    typeof obj.showRegularNoteAisleDeleteButton === 'boolean'
      ? obj.showRegularNoteAisleDeleteButton
      : DEFAULT_UI_SETTINGS.showRegularNoteAisleDeleteButton
  return {
    ...registeredSettings,
    showRegularNoteAisleAddButtons,
    showRegularNoteAisleDeleteButton,
    noteFontScale:
      typeof obj.noteFontScale === 'number'
        ? clampNoteFontScale(obj.noteFontScale)
        : DEFAULT_UI_SETTINGS.noteFontScale,
    toolbarButtonScale:
      typeof obj.toolbarButtonScale === 'number'
        ? clampToolbarButtonScale(obj.toolbarButtonScale)
        : DEFAULT_UI_SETTINGS.toolbarButtonScale,
    scratchpadAisleLimit:
      typeof obj.scratchpadAisleLimit === 'number' || typeof obj.scratchpadAisleLimit === 'string'
        ? clampScratchpadAisleLimit(obj.scratchpadAisleLimit)
        : DEFAULT_SCRATCHPAD_AISLE_LIMIT,
    noteFilter: normalizeNoteFilterSettings(obj.noteFilter),
    settingsSection: normalizeSettingsSection(obj.settingsSection),
    visualsSettingsSection: normalizeVisualsSettingsSection(
      obj.visualsSettingsSection,
      DEFAULT_UI_SETTINGS.visualsSettingsSection,
    ),
    dataSettingsSection: normalizeDataSettingsSection(obj.dataSettingsSection),
    selectedCustomTheme: normalizeCustomThemeId(obj.selectedCustomTheme),
    themePalettes,
    noteCursorLocations: normalizeNoteCursorLocations(obj.noteCursorLocations),
    headingCollapseState: normalizeHeadingCollapseState(obj.headingCollapseState),
    aisleWidths: normalizeAisleWidths(obj.aisleWidths),
    toolbarLayouts: normalizeToolbarLayouts(obj.toolbarLayouts),
    seenTipIds: normalizeTipIds(obj.seenTipIds),
    disabledTipIds: normalizeTipIds(obj.disabledTipIds),
  }
}
