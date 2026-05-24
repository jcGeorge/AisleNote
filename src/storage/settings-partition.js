import { isRecord, normalizeStorageTheme } from './hybrid-storage-core.js'

export const STORAGE_PROFILE_SETTINGS_FILE = 'profile-settings.json'
export const PROFILE_SETTINGS_SCHEMA_VERSION = 1
export const ROOT_SPLIT_FILES = Object.freeze({
  workspaceIndex: 'workspace-index.json',
  navigationState: 'navigation-state.json',
  appSettings: 'app-settings.json',
  frontmatterSettings: 'frontmatter-settings.json',
  editorState: 'editor-state.json',
  deletedWorkspace: 'deleted-workspace.json',
  noteRegistry: 'note-registry.json',
})

export const LEGACY_ROOT_SPLIT_FILES = Object.freeze({
  appearanceSettings: 'appearance-settings.json',
  shortcutSettings: 'shortcut-settings.json',
  uiPreferences: 'ui-preferences.json',
  noteBodies: 'note-bodies.json',
  aisleBodies: 'aisle-bodies.json',
  orphanNoteBodies: 'orphan-note-bodies.json',
  orphanAisleBodies: 'orphan-aisle-bodies.json',
})

export const REQUIRED_ROOT_SPLIT_FILE_KEYS = Object.freeze([
  'workspaceIndex',
  'navigationState',
  'appSettings',
  'frontmatterSettings',
  'deletedWorkspace',
  'noteRegistry',
])

export const OPTIONAL_ROOT_SPLIT_FILE_KEYS = Object.freeze([
  'uiPreferences',
  'editorState',
])

const DEFAULT_HOTKEY_SETTINGS = {
  shortcuts: {},
  enableMouseBackForward: true,
  enableGenericHistoryHotkeys: true,
}

const DEFAULT_SYNCED_UI_SETTINGS = {
  showParentHomeTab: true,
  alwaysShowSpaces: false,
  alwaysShowDomains: false,
  stageManagerOpenDestinationAfterApply: true,
  lastLinkInsertMode: 'note',
  lastNoteCopyMode: 'independent',
  decoupledItemsKeepData: true,
  tableAddTargetMode: 'bottom-right',
  tableDeleteTargetMode: 'bottom-right',
  selectedCustomTheme: 'custom1',
  customThemePalette: null,
  themePalettes: {},
  toolbarLayouts: [],
  toolbarEditorShowNames: false,
  settingsSection: 'hotkeys',
  visualsSettingsSection: 'theming',
  tabButtonScale: 1,
  noteFontScale: 1,
  noteCursorLocations: {},
  headingCollapseState: {},
  seenTipIds: [],
  disabledTipIds: [],
}

const THEME_PALETTE_IDS = ['dark', 'light', 'dawn', 'blues', 'custom1', 'custom2', 'custom3']
const CUSTOM_THEME_IDS = ['custom1', 'custom2', 'custom3']

function optionalBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function optionalString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function optionalArray(value, fallback) {
  return Array.isArray(value) ? value : fallback
}

function normalizeSelectedCustomTheme(value) {
  return CUSTOM_THEME_IDS.includes(value) ? value : DEFAULT_SYNCED_UI_SETTINGS.selectedCustomTheme
}

function normalizeThemePalettes(value, legacyCustomPalette) {
  if (!isRecord(value)) {
    return legacyCustomPalette ? { custom1: legacyCustomPalette } : DEFAULT_SYNCED_UI_SETTINGS.themePalettes
  }
  const themePalettes = {}
  THEME_PALETTE_IDS.forEach((theme) => {
    if (isRecord(value[theme])) themePalettes[theme] = value[theme]
  })
  if (!themePalettes.custom1 && isRecord(value.custom)) themePalettes.custom1 = value.custom
  if (!themePalettes.custom1 && legacyCustomPalette) themePalettes.custom1 = legacyCustomPalette
  return themePalettes
}

export function extractSyncedUiSettings(rawUi) {
  const ui = isRecord(rawUi) ? rawUi : {}
  const alwaysShowSpaces = optionalBoolean(ui.alwaysShowSpaces, DEFAULT_SYNCED_UI_SETTINGS.alwaysShowSpaces)
  const alwaysShowDomains =
    alwaysShowSpaces && typeof ui.alwaysShowDomains === 'boolean'
      ? ui.alwaysShowDomains
      : DEFAULT_SYNCED_UI_SETTINGS.alwaysShowDomains
  const legacyCustomPalette = isRecord(ui.customThemePalette) ? ui.customThemePalette : null
  const themePalettes = normalizeThemePalettes(ui.themePalettes, legacyCustomPalette)

  return {
    showParentHomeTab: optionalBoolean(ui.showParentHomeTab, DEFAULT_SYNCED_UI_SETTINGS.showParentHomeTab),
    alwaysShowSpaces,
    alwaysShowDomains,
    stageManagerOpenDestinationAfterApply: optionalBoolean(
      ui.stageManagerOpenDestinationAfterApply,
      DEFAULT_SYNCED_UI_SETTINGS.stageManagerOpenDestinationAfterApply,
    ),
    lastLinkInsertMode: optionalString(ui.lastLinkInsertMode, DEFAULT_SYNCED_UI_SETTINGS.lastLinkInsertMode),
    lastNoteCopyMode: optionalString(ui.lastNoteCopyMode, DEFAULT_SYNCED_UI_SETTINGS.lastNoteCopyMode),
    decoupledItemsKeepData: optionalBoolean(ui.decoupledItemsKeepData, DEFAULT_SYNCED_UI_SETTINGS.decoupledItemsKeepData),
    tableAddTargetMode: optionalString(ui.tableAddTargetMode, DEFAULT_SYNCED_UI_SETTINGS.tableAddTargetMode),
    tableDeleteTargetMode: optionalString(ui.tableDeleteTargetMode, DEFAULT_SYNCED_UI_SETTINGS.tableDeleteTargetMode),
    selectedCustomTheme: normalizeSelectedCustomTheme(ui.selectedCustomTheme),
    customThemePalette: isRecord(themePalettes.custom1) ? themePalettes.custom1 : legacyCustomPalette,
    themePalettes,
    toolbarLayouts: optionalArray(ui.toolbarLayouts, DEFAULT_SYNCED_UI_SETTINGS.toolbarLayouts),
    toolbarEditorShowNames: optionalBoolean(ui.toolbarEditorShowNames, DEFAULT_SYNCED_UI_SETTINGS.toolbarEditorShowNames),
    disabledTipIds: optionalArray(ui.disabledTipIds, DEFAULT_SYNCED_UI_SETTINGS.disabledTipIds),
  }
}

export function extractSyncedGlobalSettings(appState) {
  return {
    theme: normalizeStorageTheme(appState?.theme),
    hotkeys: isRecord(appState?.hotkeys) ? appState.hotkeys : DEFAULT_HOTKEY_SETTINGS,
    ui: extractSyncedUiSettings(appState?.ui),
    frontmatter: isRecord(appState?.frontmatter) ? appState.frontmatter : undefined,
  }
}

export function extractAppearanceSettings(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  const syncedUi = extractSyncedUiSettings(ui)
  return {
    theme: normalizeStorageTheme(appState?.theme),
    selectedCustomTheme: syncedUi.selectedCustomTheme,
    customThemePalette: syncedUi.customThemePalette,
    themePalettes: syncedUi.themePalettes,
    tabButtonScale:
      typeof ui.tabButtonScale === 'number'
        ? ui.tabButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof ui.noteFontScale === 'number'
        ? ui.noteFontScale
        : DEFAULT_SYNCED_UI_SETTINGS.noteFontScale,
  }
}

export function extractShortcutSettings(appState) {
  return isRecord(appState?.hotkeys) ? appState.hotkeys : DEFAULT_HOTKEY_SETTINGS
}

export function extractFrontmatterSettings(appState) {
  return isRecord(appState?.frontmatter) ? appState.frontmatter : {}
}

export function extractUiPreferences(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  const syncedUi = extractSyncedUiSettings(ui)
  return {
    showParentHomeTab: syncedUi.showParentHomeTab,
    alwaysShowSpaces: syncedUi.alwaysShowSpaces,
    alwaysShowDomains: syncedUi.alwaysShowDomains,
    stageManagerOpenDestinationAfterApply: syncedUi.stageManagerOpenDestinationAfterApply,
    lastLinkInsertMode: syncedUi.lastLinkInsertMode,
    lastNoteCopyMode: syncedUi.lastNoteCopyMode,
    decoupledItemsKeepData: syncedUi.decoupledItemsKeepData,
    tableAddTargetMode: syncedUi.tableAddTargetMode,
    tableDeleteTargetMode: syncedUi.tableDeleteTargetMode,
    settingsSection: optionalString(ui.settingsSection, DEFAULT_SYNCED_UI_SETTINGS.settingsSection),
    visualsSettingsSection: optionalString(
      ui.visualsSettingsSection,
      DEFAULT_SYNCED_UI_SETTINGS.visualsSettingsSection,
    ),
    toolbarLayouts: syncedUi.toolbarLayouts,
    toolbarEditorShowNames: syncedUi.toolbarEditorShowNames,
    seenTipIds: optionalArray(ui.seenTipIds, DEFAULT_SYNCED_UI_SETTINGS.seenTipIds),
    disabledTipIds: syncedUi.disabledTipIds,
  }
}

export function extractAppSettings(appState) {
  return {
    ...extractAppearanceSettings(appState),
    hotkeys: extractShortcutSettings(appState),
    ui: extractUiPreferences(appState),
  }
}

export function extractEditorState(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  return {
    noteCursorLocations: isRecord(ui.noteCursorLocations)
      ? ui.noteCursorLocations
      : DEFAULT_SYNCED_UI_SETTINGS.noteCursorLocations,
    headingCollapseState: isRecord(ui.headingCollapseState)
      ? ui.headingCollapseState
      : DEFAULT_SYNCED_UI_SETTINGS.headingCollapseState,
  }
}

export function buildSyncedSettingsFromSplitFiles(parts) {
  const appSettings = isRecord(parts?.appSettings) ? parts.appSettings : {}
  const hasAppSettings = Object.keys(appSettings).length > 0
  const appearanceSettings = hasAppSettings
    ? appSettings
    : isRecord(parts?.appearanceSettings)
      ? parts.appearanceSettings
      : {}
  const shortcutSettings = hasAppSettings && isRecord(appSettings.hotkeys)
    ? appSettings.hotkeys
    : isRecord(parts?.shortcutSettings)
      ? parts.shortcutSettings
      : DEFAULT_HOTKEY_SETTINGS
  const frontmatterSettings = isRecord(parts?.frontmatterSettings) ? parts.frontmatterSettings : {}
  const uiPreferences = hasAppSettings && isRecord(appSettings.ui)
    ? appSettings.ui
    : isRecord(parts?.uiPreferences)
      ? parts.uiPreferences
      : {}
  const editorState = isRecord(parts?.editorState) ? parts.editorState : {}
  const ui = {
    ...extractSyncedUiSettings({
      ...appearanceSettings,
      ...uiPreferences,
    }),
    tabButtonScale:
      typeof appearanceSettings.tabButtonScale === 'number'
        ? appearanceSettings.tabButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof appearanceSettings.noteFontScale === 'number'
        ? appearanceSettings.noteFontScale
        : DEFAULT_SYNCED_UI_SETTINGS.noteFontScale,
    settingsSection: optionalString(uiPreferences.settingsSection, DEFAULT_SYNCED_UI_SETTINGS.settingsSection),
    visualsSettingsSection: optionalString(
      uiPreferences.visualsSettingsSection,
      DEFAULT_SYNCED_UI_SETTINGS.visualsSettingsSection,
    ),
    noteCursorLocations: isRecord(editorState.noteCursorLocations)
      ? editorState.noteCursorLocations
      : DEFAULT_SYNCED_UI_SETTINGS.noteCursorLocations,
    headingCollapseState: isRecord(editorState.headingCollapseState)
      ? editorState.headingCollapseState
      : DEFAULT_SYNCED_UI_SETTINGS.headingCollapseState,
    seenTipIds: optionalArray(uiPreferences.seenTipIds, DEFAULT_SYNCED_UI_SETTINGS.seenTipIds),
  }

  return {
    theme: normalizeStorageTheme(appearanceSettings.theme),
    hotkeys: shortcutSettings,
    frontmatter: frontmatterSettings,
    ui,
  }
}

export function extractSyncedProfileSettings(appState) {
  return {
    schemaVersion: PROFILE_SETTINGS_SCHEMA_VERSION,
    settings: extractSyncedGlobalSettings(appState),
  }
}

export function getSyncedProfileSettingsForLoad(rootManifest, profileSettings) {
  if (isRecord(profileSettings) && profileSettings.schemaVersion === PROFILE_SETTINGS_SCHEMA_VERSION && isRecord(profileSettings.settings)) {
    return profileSettings.settings
  }
  if (isRecord(profileSettings) && isRecord(profileSettings.settings)) {
    return profileSettings.settings
  }
  return isRecord(rootManifest?.globalSettings) ? rootManifest.globalSettings : {}
}
