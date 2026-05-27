import {
  DEFAULT_DOMAIN_ID,
  collectReferencedNoteBodyIdsFromAppState,
  ensureArray,
  getNoteBodiesFromAppState,
  isRecord,
  normalizeStorageTheme,
} from './hybrid-storage-core.js'

export const MAX_NOTE_CURSOR_LOCATIONS = 500
export const ROOT_SPLIT_FILES = Object.freeze({
  workspaceIndex: 'workspace-index.json',
  navigationState: 'navigation-state.json',
  appSettings: 'app-settings.json',
  frontmatterSettings: 'frontmatter-settings.json',
  editorState: 'editor-state.json',
  deletedWorkspace: 'deleted-workspace.json',
  noteRegistry: 'note-registry.json',
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
}

const DEFAULT_SYNCED_UI_SETTINGS = {
  showParentHomeTab: true,
  alwaysShowSpaces: false,
  alwaysShowDomains: false,
  stageManagerOpenDestinationAfterApply: true,
  lastLinkInsertMode: 'note',
  lastNoteCopyMode: 'independent',
  findCaseSensitive: false,
  findWholeWord: false,
  findRegex: false,
  findReplaceMode: 'find',
  removeNoteReferencesOnTrash: true,
  decoupledItemsKeepData: true,
  tableAddTargetMode: 'bottom-right',
  tableDeleteTargetMode: 'bottom-right',
  tableOfContentsScope: 'all-aisles',
  newAislePlacement: 'end',
  selectedCustomTheme: 'custom1',
  customThemePalette: null,
  themePalettes: {},
  toolbarLayouts: [],
  toolbarEditorShowNames: false,
  settingsSection: 'hotkeys',
  dataSettingsSection: 'cloud',
  visualsSettingsSection: 'theming',
  tabButtonScale: 1,
  noteFontScale: 1,
  tooltipScale: 1,
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

function normalizeNewAislePlacement(value) {
  return value === 'right-of-focus' || value === 'end' ? value : DEFAULT_SYNCED_UI_SETTINGS.newAislePlacement
}

function normalizeFindReplaceMode(value) {
  return value === 'replace' || value === 'find' ? value : DEFAULT_SYNCED_UI_SETTINGS.findReplaceMode
}

function optionalArray(value, fallback) {
  return Array.isArray(value) ? value : fallback
}

function normalizeTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function buildNoteCursorLocationKey(domainId, spaceId, tabId, subTabId = null) {
  return [domainId, spaceId, tabId, subTabId ?? '__home__'].join('::')
}

function getProjectedDomainsForStorage(appState) {
  const domains = ensureArray(appState?.domains).filter(isRecord)
  const spaces = ensureArray(appState?.spaces).filter(isRecord)

  if (domains.length === 0) {
    return spaces.length > 0
      ? [
          {
            id: DEFAULT_DOMAIN_ID,
            spaces,
          },
        ]
      : []
  }

  if (spaces.length === 0) return domains

  const activeDomainId = typeof appState?.activeDomainId === 'string' ? appState.activeDomainId : ''
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const projectedDomain = {
    ...activeDomain,
    spaces,
  }
  return domains.map((domain) => (domain === activeDomain ? projectedDomain : domain))
}

export function buildLiveNoteCursorLocationKeys(appState) {
  const keys = new Set()
  getProjectedDomainsForStorage(appState).forEach((domain) => {
    const domainId = typeof domain.id === 'string' && domain.id ? domain.id : DEFAULT_DOMAIN_ID
    ensureArray(domain.spaces)
      .filter(isRecord)
      .forEach((space) => {
        const spaceId = typeof space.id === 'string' ? space.id : ''
        if (!spaceId) return
        const data = isRecord(space.data) ? space.data : {}
        ensureArray(data.tabs)
          .filter(isRecord)
          .forEach((tab) => {
            const tabId = typeof tab.id === 'string' ? tab.id : ''
            if (!tabId) return
            keys.add(buildNoteCursorLocationKey(domainId, spaceId, tabId))
            ensureArray(tab.subTabs)
              .filter(isRecord)
              .forEach((subTab) => {
                const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
                if (subTabId) keys.add(buildNoteCursorLocationKey(domainId, spaceId, tabId, subTabId))
              })
          })
      })
  })
  return keys
}

export function pruneNoteCursorLocationsForLiveNotes(noteCursorLocations, appState, maxEntries = MAX_NOTE_CURSOR_LOCATIONS) {
  if (!isRecord(noteCursorLocations)) return {}
  const liveKeys = buildLiveNoteCursorLocationKeys(appState)
  if (liveKeys.size === 0) return {}
  const entries = Object.entries(noteCursorLocations).filter(([locationKey]) => liveKeys.has(locationKey))
  const entryLimit = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : MAX_NOTE_CURSOR_LOCATIONS
  const prunedEntries =
    entries.length > entryLimit
      ? entries
          .sort(([, left], [, right]) => normalizeTimestamp(right?.updatedAt) - normalizeTimestamp(left?.updatedAt))
          .slice(0, entryLimit)
      : entries
  return Object.fromEntries(prunedEntries)
}

function normalizeHeadingId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHeadingKeys(value) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)),
  )
}

function buildReferencedNoteBodyAisleIds(appState) {
  const referencedBodyIds = collectReferencedNoteBodyIdsFromAppState(isRecord(appState) ? appState : {})
  if (referencedBodyIds.size === 0) return new Map()

  const aisleIdsByBodyId = new Map()
  getNoteBodiesFromAppState(isRecord(appState) ? appState : {}).forEach((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    if (!bodyId || !referencedBodyIds.has(bodyId)) return
    const aisleIds = new Set()
    ensureArray(body.aisles)
      .filter(isRecord)
      .forEach((aisle) => {
        if (typeof aisle.id === 'string' && aisle.id) aisleIds.add(aisle.id)
      })
    if (aisleIds.size > 0) aisleIdsByBodyId.set(bodyId, aisleIds)
  })
  return aisleIdsByBodyId
}

export function pruneHeadingCollapseStateForReferencedNotes(headingCollapseState, appState) {
  if (!isRecord(headingCollapseState)) return {}
  const aisleIdsByBodyId = buildReferencedNoteBodyAisleIds(appState)
  if (aisleIdsByBodyId.size === 0) return {}

  const nextState = {}
  Object.entries(headingCollapseState).forEach(([rawBodyId, rawAisles]) => {
    const bodyId = normalizeHeadingId(rawBodyId)
    const liveAisleIds = aisleIdsByBodyId.get(bodyId)
    if (!bodyId || !liveAisleIds || !isRecord(rawAisles)) return

    const nextAisles = {}
    Object.entries(rawAisles).forEach(([rawAisleId, rawKeys]) => {
      const aisleId = normalizeHeadingId(rawAisleId)
      if (!aisleId || !liveAisleIds.has(aisleId)) return
      const keys = normalizeHeadingKeys(rawKeys)
      if (keys.length > 0) nextAisles[aisleId] = keys
    })
    if (Object.keys(nextAisles).length > 0) nextState[bodyId] = nextAisles
  })

  return nextState
}

export function pruneAppStateEditorLocations(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  return {
    ...appState,
    ui: {
      ...ui,
      noteCursorLocations: pruneNoteCursorLocationsForLiveNotes(ui.noteCursorLocations, appState),
      headingCollapseState: pruneHeadingCollapseStateForReferencedNotes(ui.headingCollapseState, appState),
    },
  }
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
    findCaseSensitive: optionalBoolean(ui.findCaseSensitive, DEFAULT_SYNCED_UI_SETTINGS.findCaseSensitive),
    findWholeWord: optionalBoolean(ui.findWholeWord, DEFAULT_SYNCED_UI_SETTINGS.findWholeWord),
    findRegex: optionalBoolean(ui.findRegex, DEFAULT_SYNCED_UI_SETTINGS.findRegex),
    findReplaceMode: normalizeFindReplaceMode(ui.findReplaceMode),
    removeNoteReferencesOnTrash: optionalBoolean(
      ui.removeNoteReferencesOnTrash,
      DEFAULT_SYNCED_UI_SETTINGS.removeNoteReferencesOnTrash,
    ),
    decoupledItemsKeepData: optionalBoolean(ui.decoupledItemsKeepData, DEFAULT_SYNCED_UI_SETTINGS.decoupledItemsKeepData),
    tableAddTargetMode: optionalString(ui.tableAddTargetMode, DEFAULT_SYNCED_UI_SETTINGS.tableAddTargetMode),
    tableDeleteTargetMode: optionalString(ui.tableDeleteTargetMode, DEFAULT_SYNCED_UI_SETTINGS.tableDeleteTargetMode),
    tableOfContentsScope: optionalString(ui.tableOfContentsScope, DEFAULT_SYNCED_UI_SETTINGS.tableOfContentsScope),
    newAislePlacement: normalizeNewAislePlacement(ui.newAislePlacement),
    dataSettingsSection: optionalString(ui.dataSettingsSection, DEFAULT_SYNCED_UI_SETTINGS.dataSettingsSection),
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
    tooltipScale:
      typeof ui.tooltipScale === 'number'
        ? ui.tooltipScale
        : DEFAULT_SYNCED_UI_SETTINGS.tooltipScale,
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
    findCaseSensitive: syncedUi.findCaseSensitive,
    findWholeWord: syncedUi.findWholeWord,
    findRegex: syncedUi.findRegex,
    findReplaceMode: syncedUi.findReplaceMode,
    removeNoteReferencesOnTrash: syncedUi.removeNoteReferencesOnTrash,
    decoupledItemsKeepData: syncedUi.decoupledItemsKeepData,
    tableAddTargetMode: syncedUi.tableAddTargetMode,
    tableDeleteTargetMode: syncedUi.tableDeleteTargetMode,
    tableOfContentsScope: syncedUi.tableOfContentsScope,
    newAislePlacement: syncedUi.newAislePlacement,
    dataSettingsSection: syncedUi.dataSettingsSection,
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
    noteCursorLocations: pruneNoteCursorLocationsForLiveNotes(ui.noteCursorLocations, appState),
    headingCollapseState: pruneHeadingCollapseStateForReferencedNotes(ui.headingCollapseState, appState),
  }
}

export function buildSyncedSettingsFromSplitFiles(parts) {
  const appSettings = isRecord(parts?.appSettings) ? parts.appSettings : {}
  const shortcutSettings = isRecord(appSettings.hotkeys)
    ? appSettings.hotkeys
    : DEFAULT_HOTKEY_SETTINGS
  const frontmatterSettings = isRecord(parts?.frontmatterSettings) ? parts.frontmatterSettings : {}
  const uiPreferences = isRecord(appSettings.ui)
    ? appSettings.ui
    : {}
  const editorState = isRecord(parts?.editorState) ? parts.editorState : {}
  const ui = {
    ...extractSyncedUiSettings({
      ...appSettings,
      ...uiPreferences,
    }),
    tabButtonScale:
      typeof appSettings.tabButtonScale === 'number'
        ? appSettings.tabButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof appSettings.noteFontScale === 'number'
        ? appSettings.noteFontScale
        : DEFAULT_SYNCED_UI_SETTINGS.noteFontScale,
    tooltipScale:
      typeof appSettings.tooltipScale === 'number'
        ? appSettings.tooltipScale
        : DEFAULT_SYNCED_UI_SETTINGS.tooltipScale,
    dataSettingsSection: optionalString(
      uiPreferences.dataSettingsSection,
      DEFAULT_SYNCED_UI_SETTINGS.dataSettingsSection,
    ),
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
    theme: normalizeStorageTheme(appSettings.theme),
    hotkeys: shortcutSettings,
    frontmatter: frontmatterSettings,
    ui,
  }
}
