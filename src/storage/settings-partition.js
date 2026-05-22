import { isRecord, normalizeStorageTheme } from './hybrid-storage-core.js'

export const STORAGE_PROFILE_SETTINGS_FILE = 'profile-settings.json'
export const PROFILE_SETTINGS_SCHEMA_VERSION = 1

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
  customThemePalette: null,
  toolbarLayouts: [],
  toolbarEditorShowNames: false,
  disabledTipIds: [],
}

function optionalBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function optionalString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function optionalArray(value, fallback) {
  return Array.isArray(value) ? value : fallback
}

export function extractSyncedUiSettings(rawUi) {
  const ui = isRecord(rawUi) ? rawUi : {}
  const alwaysShowSpaces = optionalBoolean(ui.alwaysShowSpaces, DEFAULT_SYNCED_UI_SETTINGS.alwaysShowSpaces)
  const alwaysShowDomains =
    alwaysShowSpaces && typeof ui.alwaysShowDomains === 'boolean'
      ? ui.alwaysShowDomains
      : DEFAULT_SYNCED_UI_SETTINGS.alwaysShowDomains

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
    customThemePalette: isRecord(ui.customThemePalette) ? ui.customThemePalette : null,
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
