import type {
  AppState,
  CustomThemeId,
  DataSettingsSection,
  SettingsSection,
  TableControlTargetMode,
  TableOfContentsScope,
  VisualsSettingsSection,
} from '../types/app'
import { normalizeNoteCursorLocations } from '../notes/note-cursors'
import { normalizeAisleWidths } from '../notes/aisle-widths'
import { normalizeTipIds } from '../tips/tips'
import { normalizeHeadingCollapseState } from '../editor/heading-collapse-state'
import { normalizeToolbarLayouts } from '../editor/toolbar-layouts'
import {
  DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  normalizeRegisteredSyncedUiSetting,
  normalizeRegisteredSyncedUiSettings,
} from './synced-ui-settings-registry.js'
import {
  APP_THEME_IDS,
  BUILT_IN_THEME_IDS,
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_IDS,
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_THEME_PALETTE,
  getCustomThemePaletteSeed,
  getCustomThemePaletteSeedMatch,
  getThemePaletteForTheme,
  isCustomTheme,
  isThemePaletteSeed,
  normalizeThemePaletteOverrides,
  removeThemePaletteOverride,
  setThemePaletteOverride,
  type BuiltInAppTheme,
} from '../theme/notebook-themes'

export {
  APP_THEME_IDS,
  BUILT_IN_THEME_IDS,
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_IDS,
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_THEME_PALETTE,
  getCustomThemePaletteSeed,
  getCustomThemePaletteSeedMatch,
  getThemePaletteForTheme,
  isCustomTheme,
  isThemePaletteSeed,
  removeThemePaletteOverride,
  setThemePaletteOverride,
}
export type { BuiltInAppTheme }

export const DEFAULT_AUTO_REMOVE_DAYS = 7
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
  sidebarCollapsed: false,
  sidebarWidth: 212,
  collapsedFolderIds: [],
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
  toolbarButtonScale: 1.2,
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

export function normalizeCustomThemeId(
  value: unknown,
  fallback: CustomThemeId = DEFAULT_CUSTOM_THEME_ID,
): CustomThemeId {
  return typeof value === 'string' && CUSTOM_THEME_IDS.includes(value as CustomThemeId)
    ? (value as CustomThemeId)
    : fallback
}

export function normalizeThemePalettes(raw: unknown) {
  return normalizeThemePaletteOverrides(raw)
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
  return {
    ...registeredSettings,
    sidebarCollapsed:
      typeof obj.sidebarCollapsed === 'boolean'
        ? obj.sidebarCollapsed
        : DEFAULT_UI_SETTINGS.sidebarCollapsed,
    sidebarWidth:
      typeof obj.sidebarWidth === 'number'
        ? obj.sidebarWidth
        : DEFAULT_UI_SETTINGS.sidebarWidth,
    collapsedFolderIds: Array.isArray(obj.collapsedFolderIds)
      ? obj.collapsedFolderIds.filter((item): item is string => typeof item === 'string')
      : DEFAULT_UI_SETTINGS.collapsedFolderIds,
    noteFontScale:
      typeof obj.noteFontScale === 'number'
        ? clampNoteFontScale(obj.noteFontScale)
        : DEFAULT_UI_SETTINGS.noteFontScale,
    toolbarButtonScale:
      typeof obj.toolbarButtonScale === 'number'
        ? clampToolbarButtonScale(obj.toolbarButtonScale)
        : DEFAULT_UI_SETTINGS.toolbarButtonScale,
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
