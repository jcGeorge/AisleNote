import {
  DEFAULT_DOMAIN_ID,
  collectReferencedNoteBodyIdsFromAppState,
  ensureArray,
  getNoteBodiesFromAppState,
  isRecord,
  normalizeStorageTheme,
} from './hybrid-storage-core.js'
import {
  DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  normalizeRegisteredSyncedUiSettings,
  pickRegisteredSyncedUiSettings,
} from '../settings/synced-ui-settings-registry.js'

export const MAX_NOTE_CURSOR_LOCATIONS = 500
export const USER_SETTINGS_DIR = 'settings'
export const USER_SETTINGS_FILE = 'app-settings.json'
export const USER_SETTINGS_FILE_PATH = `${USER_SETTINGS_DIR}/${USER_SETTINGS_FILE}`
export const ROOT_SPLIT_FILES = Object.freeze({
  workspaceIndex: 'workspace-index.json',
  navigationState: 'navigation-state.json',
  frontmatterSettings: 'frontmatter-settings.json',
  editorState: 'editor-state.json',
  messages: 'messages.json',
  deletedWorkspace: 'deleted-workspace.json',
  noteRegistry: 'note-registry.json',
})

export const REQUIRED_ROOT_SPLIT_FILE_KEYS = Object.freeze([
  'workspaceIndex',
  'navigationState',
  'frontmatterSettings',
  'deletedWorkspace',
  'noteRegistry',
])

const DEFAULT_COMMAND_SHORTCUTS = {
  openSettings: 'Mod+,',
  toggleNotesTrash: 'Mod+T',
  toggleNotesScratchpad: 'Mod+/',
  toggleNotesFilter: '',
  openDomains: 'Mod+D',
  openSpaces: 'Mod+S',
  newNote: 'Mod+N',
  newFolder: 'Mod+Shift+N',
  newTab: 'Mod+Shift+N',
  newSubTab: 'Mod+N',
  formatStrikethrough: '',
  cycleParentTabNext: '',
  cycleParentTabPrev: '',
  cycleSubTabNext: 'Ctrl+Tab',
  cycleSubTabPrev: 'Ctrl+Shift+Tab',
  cycleAislePrev: 'Alt+[',
  cycleAisleNext: 'Alt+]',
}

const DEFAULT_NEWLINE_SHORTCUT_SETTINGS = {
  shortcuts: {
    controlEnter: 'operationsMenu',
    shiftEnter: 'task',
    commandEnter: 'aisleRight',
  },
  menuOperations: [
    'task',
    'aisleLeft',
    'aisleRight',
    'horizontalLine',
    'codeBlock',
    'inlineCode',
    'blockQuote',
    'strikethrough',
  ],
}

const NEWLINE_OPERATION_IDS = new Set([
  'normalNewLine',
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'aisleLeft',
  'aisleRight',
  'horizontalLine',
  'codeBlock',
  'inlineCode',
  'blockQuote',
  'blockIndent',
  'strikethrough',
  'operationsMenu',
])

const SHORTCUT_MENU_ELIGIBLE_OPERATION_IDS = new Set([
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'aisleLeft',
  'aisleRight',
  'horizontalLine',
  'codeBlock',
  'inlineCode',
  'blockQuote',
  'blockIndent',
  'strikethrough',
])

const DEFAULT_SYNCED_UI_SETTINGS = {
  ...DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  alwaysShowSpaces: false,
  alwaysShowDomains: false,
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
  selectedCustomTheme: 'custom1',
  themePalettes: {},
  toolbarLayouts: [],
  settingsSection: 'hotkeys',
  dataSettingsSection: 'transfer',
  visualsSettingsSection: 'theming',
  tabButtonScale: 1,
  noteFontScale: 1,
  toolbarButtonScale: 1,
  scratchpadAisleLimit: 16,
  noteCursorLocations: {},
  headingCollapseState: {},
  aisleWidths: {},
  seenTipIds: [],
  disabledTipIds: [],
}

const MIN_AISLE_WIDTH_PX = 160
const MAX_AISLE_WIDTH_PX = 1200
const MIN_SCRATCHPAD_AISLE_LIMIT = 8
const MAX_SCRATCHPAD_AISLE_LIMIT = 40
const THEME_PALETTE_IDS = ['dark', 'light', 'dawn', 'custom1', 'custom2', 'custom3']
const CUSTOM_THEME_IDS = ['custom1', 'custom2', 'custom3']
const DATA_SETTINGS_SECTIONS = ['transfer', 'storage', 'trash']
const CURRENT_APP_SETTING_THEME_IDS = ['dark', 'light', 'dawn', 'custom1', 'custom2', 'custom3']

function optionalBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function optionalString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function optionalDataSettingsSection(value, fallback) {
  return DATA_SETTINGS_SECTIONS.includes(value) ? value : fallback
}

function optionalArray(value, fallback) {
  return Array.isArray(value) ? value : fallback
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)))
}

function normalizeNoteFilterSettings(value) {
  const fallback = DEFAULT_SYNCED_UI_SETTINGS.noteFilter
  if (!isRecord(value)) return fallback
  const tags = isRecord(value.tags) ? value.tags : {}
  const synced = isRecord(value.synced) ? value.synced : {}
  const frontmatter = isRecord(value.frontmatter) ? value.frontmatter : {}
  const media = isRecord(value.media) ? value.media : {}
  return {
    active: typeof value.active === 'boolean' ? value.active : fallback.active,
    kind: ['tags', 'synced', 'frontmatter', 'media'].includes(value.kind) ? value.kind : fallback.kind,
    tags: {
      selectedKeys: normalizeStringList(tags.selectedKeys),
      sortMode: tags.sortMode === 'occurrences' ? 'occurrences' : 'az',
    },
    synced: {
      selectedKeys: normalizeStringList(synced.selectedKeys),
    },
    frontmatter: {
      selectedKeys: normalizeStringList(frontmatter.selectedKeys),
    },
    media: {
      selectedKeys: normalizeStringList(media.selectedKeys),
    },
  }
}

function normalizeShortcutValue(raw, fallback) {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function getRawShortcutValue(rawShortcuts, shortcutId) {
  if (shortcutId === 'toggleNotesTrash') {
    return rawShortcuts.toggleNotesTrash ?? rawShortcuts.toggleTabsTarget
  }
  return rawShortcuts[shortcutId]
}

function normalizeNewlineOperation(value, fallback) {
  return typeof value === 'string' && NEWLINE_OPERATION_IDS.has(value) ? value : fallback
}

function normalizeShortcutMenuOperation(value) {
  return typeof value === 'string' && SHORTCUT_MENU_ELIGIBLE_OPERATION_IDS.has(value) ? value : null
}

function normalizeNewlineShortcutSettings(raw) {
  if (!isRecord(raw)) return DEFAULT_NEWLINE_SHORTCUT_SETTINGS
  const rawShortcutMap = isRecord(raw.shortcuts) ? raw.shortcuts : {}
  const rawMenuOperations = Array.isArray(raw.menuOperations) ? raw.menuOperations : []
  const menuOperations = rawMenuOperations.map(normalizeShortcutMenuOperation).filter(Boolean)
  const dedupedMenuOperations = Array.from(new Set(menuOperations)).slice(0, 10)
  const normalizedMenuOperations =
    dedupedMenuOperations.length > 0
      ? [...dedupedMenuOperations]
      : [...DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations]
  if (!normalizedMenuOperations.includes('strikethrough') && normalizedMenuOperations.length < 10) {
    normalizedMenuOperations.push('strikethrough')
  }

  return {
    shortcuts: {
      controlEnter: normalizeNewlineOperation(
        rawShortcutMap.controlEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.controlEnter,
      ),
      shiftEnter: normalizeNewlineOperation(
        rawShortcutMap.shiftEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.shiftEnter,
      ),
      commandEnter: normalizeNewlineOperation(
        rawShortcutMap.commandEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.commandEnter,
      ),
    },
    menuOperations: normalizedMenuOperations,
  }
}

function normalizeShortcutSettings(raw) {
  const source = isRecord(raw) ? raw : {}
  const rawShortcuts = isRecord(source.shortcuts) ? source.shortcuts : {}
  const shortcuts = Object.fromEntries(
    Object.entries(DEFAULT_COMMAND_SHORTCUTS).map(([key, value]) => [
      key,
      normalizeShortcutValue(getRawShortcutValue(rawShortcuts, key), value),
    ]),
  )

  return {
    shortcuts,
    newlineShortcuts: normalizeNewlineShortcutSettings(source.newlineShortcuts),
  }
}

function optionalScratchpadAisleLimit(value, fallback) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_SCRATCHPAD_AISLE_LIMIT, Math.max(MIN_SCRATCHPAD_AISLE_LIMIT, Math.floor(parsed)))
}

function isPortableSettingsRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function clampAisleWidth(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return null
  return Math.min(MAX_AISLE_WIDTH_PX, Math.max(MIN_AISLE_WIDTH_PX, Math.round(parsed)))
}

function normalizeAisleWidths(raw) {
  if (!isRecord(raw)) return {}
  const normalized = {}
  Object.entries(raw).forEach(([locationKey, rawAisles]) => {
    const trimmedLocationKey = typeof locationKey === 'string' ? locationKey.trim() : ''
    if (!trimmedLocationKey || !isRecord(rawAisles)) return
    const aisleWidths = {}
    Object.entries(rawAisles).forEach(([aisleId, rawWidth]) => {
      const trimmedAisleId = typeof aisleId === 'string' ? aisleId.trim() : ''
      const width = clampAisleWidth(rawWidth)
      if (!trimmedAisleId || width === null) return
      aisleWidths[trimmedAisleId] = width
    })
    if (Object.keys(aisleWidths).length > 0) normalized[trimmedLocationKey] = aisleWidths
  })
  return normalized
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
  if (isRecord(appState?.scratchpad) && typeof appState.scratchpad.noteBodyId === 'string') {
    keys.add('scratchpad')
  }
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

function getNoteBodyMap(appState) {
  return new Map(
    getNoteBodiesFromAppState(isRecord(appState) ? appState : {}).map((body) => [
      typeof body.id === 'string' ? body.id : '',
      body,
    ]),
  )
}

function addAisleWidthLocation(result, locationKey, body) {
  const aisles = ensureArray(body?.aisles).filter(isRecord)
  if (!locationKey || aisles.length <= 1) return
  const aisleIds = new Set()
  aisles.forEach((aisle) => {
    if (typeof aisle.id === 'string' && aisle.id) aisleIds.add(aisle.id)
  })
  if (aisleIds.size > 1) result.set(locationKey, aisleIds)
}

function buildLiveAisleWidthLocationMap(appState) {
  const result = new Map()
  const bodiesById = getNoteBodyMap(appState)
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
            const tabBodyId = typeof tab.noteBodyId === 'string' ? tab.noteBodyId : ''
            addAisleWidthLocation(result, buildNoteCursorLocationKey(domainId, spaceId, tabId), bodiesById.get(tabBodyId))
            ensureArray(tab.subTabs)
              .filter(isRecord)
              .forEach((subTab) => {
                const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
                if (!subTabId) return
                const subTabBodyId = typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : ''
                addAisleWidthLocation(
                  result,
                  buildNoteCursorLocationKey(domainId, spaceId, tabId, subTabId),
                  bodiesById.get(subTabBodyId),
                )
              })
          })
      })
  })
  if (isRecord(appState?.scratchpad) && typeof appState.scratchpad.noteBodyId === 'string') {
    addAisleWidthLocation(result, 'scratchpad', bodiesById.get(appState.scratchpad.noteBodyId))
  }
  return result
}

export function pruneAisleWidthsForLiveNotes(aisleWidths, appState) {
  const normalized = normalizeAisleWidths(aisleWidths)
  const liveLocations = buildLiveAisleWidthLocationMap(appState)
  const pruned = {}
  Object.entries(normalized).forEach(([locationKey, widthsByAisle]) => {
    const liveAisleIds = liveLocations.get(locationKey)
    if (!liveAisleIds) return
    const nextAisleWidths = {}
    Object.entries(widthsByAisle).forEach(([aisleId, width]) => {
      if (liveAisleIds.has(aisleId)) nextAisleWidths[aisleId] = width
    })
    if (Object.keys(nextAisleWidths).length > 0) pruned[locationKey] = nextAisleWidths
  })
  return pruned
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
      aisleWidths: pruneAisleWidthsForLiveNotes(ui.aisleWidths, appState),
    },
  }
}

function normalizeSelectedCustomTheme(value) {
  return CUSTOM_THEME_IDS.includes(value) ? value : DEFAULT_SYNCED_UI_SETTINGS.selectedCustomTheme
}

function normalizeThemePalettes(value) {
  if (!isRecord(value)) return DEFAULT_SYNCED_UI_SETTINGS.themePalettes
  const themePalettes = {}
  THEME_PALETTE_IDS.forEach((theme) => {
    if (isRecord(value[theme])) themePalettes[theme] = value[theme]
  })
  return themePalettes
}

export function extractSyncedUiSettings(rawUi) {
  const ui = isRecord(rawUi) ? rawUi : {}
  const registeredUi = normalizeRegisteredSyncedUiSettings(ui)
  const alwaysShowSpaces = optionalBoolean(ui.alwaysShowSpaces, DEFAULT_SYNCED_UI_SETTINGS.alwaysShowSpaces)
  const alwaysShowDomains =
    alwaysShowSpaces && typeof ui.alwaysShowDomains === 'boolean'
      ? ui.alwaysShowDomains
      : DEFAULT_SYNCED_UI_SETTINGS.alwaysShowDomains
  const showRegularNoteAisleAddButtons = optionalBoolean(
    ui.showRegularNoteAisleAddButtons,
    DEFAULT_SYNCED_UI_SETTINGS.showRegularNoteAisleAddButtons,
  )
  const showRegularNoteAisleDeleteButton = optionalBoolean(
    ui.showRegularNoteAisleDeleteButton,
    DEFAULT_SYNCED_UI_SETTINGS.showRegularNoteAisleDeleteButton,
  )
  const themePalettes = normalizeThemePalettes(ui.themePalettes)

  return {
    ...registeredUi,
    alwaysShowSpaces,
    alwaysShowDomains,
    showRegularNoteAisleAddButtons,
    showRegularNoteAisleDeleteButton,
    noteFilter: normalizeNoteFilterSettings(ui.noteFilter),
    dataSettingsSection: optionalDataSettingsSection(ui.dataSettingsSection, DEFAULT_SYNCED_UI_SETTINGS.dataSettingsSection),
    selectedCustomTheme: normalizeSelectedCustomTheme(ui.selectedCustomTheme),
    themePalettes,
    toolbarLayouts: optionalArray(ui.toolbarLayouts, DEFAULT_SYNCED_UI_SETTINGS.toolbarLayouts),
    scratchpadAisleLimit: optionalScratchpadAisleLimit(
      ui.scratchpadAisleLimit,
      DEFAULT_SYNCED_UI_SETTINGS.scratchpadAisleLimit,
    ),
    disabledTipIds: optionalArray(ui.disabledTipIds, DEFAULT_SYNCED_UI_SETTINGS.disabledTipIds),
  }
}

export function extractSyncedGlobalSettings(appState) {
  return {
    theme: normalizeStorageTheme(appState?.theme),
    hotkeys: normalizeShortcutSettings(appState?.hotkeys),
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
    themePalettes: syncedUi.themePalettes,
    tabButtonScale:
      typeof ui.tabButtonScale === 'number'
        ? ui.tabButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof ui.noteFontScale === 'number'
        ? ui.noteFontScale
        : DEFAULT_SYNCED_UI_SETTINGS.noteFontScale,
    toolbarButtonScale:
      typeof ui.toolbarButtonScale === 'number'
        ? ui.toolbarButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.toolbarButtonScale,
    scratchpadAisleLimit: optionalScratchpadAisleLimit(
      ui.scratchpadAisleLimit,
      DEFAULT_SYNCED_UI_SETTINGS.scratchpadAisleLimit,
    ),
  }
}

export function extractShortcutSettings(appState) {
  return normalizeShortcutSettings(appState?.hotkeys)
}

export function extractFrontmatterSettings(appState) {
  return isRecord(appState?.frontmatter) ? appState.frontmatter : {}
}

export function extractUiPreferences(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  const syncedUi = extractSyncedUiSettings(ui)
  return {
    ...pickRegisteredSyncedUiSettings(syncedUi),
    alwaysShowSpaces: syncedUi.alwaysShowSpaces,
    alwaysShowDomains: syncedUi.alwaysShowDomains,
    showRegularNoteAisleAddButtons: syncedUi.showRegularNoteAisleAddButtons,
    showRegularNoteAisleDeleteButton: syncedUi.showRegularNoteAisleDeleteButton,
    noteFilter: syncedUi.noteFilter,
    dataSettingsSection: syncedUi.dataSettingsSection,
    settingsSection: optionalString(ui.settingsSection, DEFAULT_SYNCED_UI_SETTINGS.settingsSection),
    visualsSettingsSection: optionalString(
      ui.visualsSettingsSection,
      DEFAULT_SYNCED_UI_SETTINGS.visualsSettingsSection,
    ),
    toolbarLayouts: syncedUi.toolbarLayouts,
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

export function normalizePortableAppSettings(rawSettings) {
  const appSettings = isPortableSettingsRecord(rawSettings) ? rawSettings : {}
  const uiPreferences = isPortableSettingsRecord(appSettings.ui) ? appSettings.ui : {}
  const uiSource = {
    ...appSettings,
    ...uiPreferences,
  }
  return extractAppSettings({
    theme: appSettings.theme,
    hotkeys: appSettings.hotkeys,
    ui: uiSource,
  })
}

export function stringifyPortableAppSettings(appState) {
  return `${JSON.stringify(extractAppSettings(appState), null, 2)}\n`
}

export function createDefaultPortableAppSettings() {
  return normalizePortableAppSettings({})
}

export function stringifyDefaultPortableAppSettings() {
  return `${JSON.stringify(createDefaultPortableAppSettings(), null, 2)}\n`
}

export function parsePortableAppSettingsJson(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'Settings file is empty.' }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isPortableSettingsRecord(parsed)) {
      return { ok: false, error: 'Settings file must contain a JSON object.' }
    }
    return { ok: true, settings: normalizePortableAppSettings(parsed) }
  } catch {
    return { ok: false, error: 'Settings file is not valid JSON.' }
  }
}

function hasCurrentPortableAppSettingsShape(value) {
  return Boolean(
    isPortableSettingsRecord(value) &&
      CURRENT_APP_SETTING_THEME_IDS.includes(value.theme) &&
      isPortableSettingsRecord(value.hotkeys) &&
      isPortableSettingsRecord(value.ui),
  )
}

export function parseStrictPortableAppSettingsJson(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'Settings file does not match app-settings.json structure.' }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!hasCurrentPortableAppSettingsShape(parsed)) {
      return { ok: false, error: 'Settings file does not match app-settings.json structure.' }
    }
    return { ok: true, settings: normalizePortableAppSettings(parsed) }
  } catch {
    return { ok: false, error: 'Settings file does not match app-settings.json structure.' }
  }
}

export function applyPortableAppSettings(appState, rawSettings) {
  const appSettings = normalizePortableAppSettings(rawSettings)
  const currentUi = isRecord(appState?.ui) ? appState.ui : {}
  const syncedSettings = buildSyncedSettingsFromSplitFiles({
    appSettings,
    frontmatterSettings: isRecord(appState?.frontmatter) ? appState.frontmatter : {},
    editorState: extractEditorState(appState),
  })
  return {
    ...appState,
    theme: syncedSettings.theme,
    hotkeys: syncedSettings.hotkeys,
    ui: {
      ...syncedSettings.ui,
      noteCursorLocations: isRecord(currentUi.noteCursorLocations)
        ? currentUi.noteCursorLocations
        : DEFAULT_SYNCED_UI_SETTINGS.noteCursorLocations,
      headingCollapseState: isRecord(currentUi.headingCollapseState)
        ? currentUi.headingCollapseState
        : DEFAULT_SYNCED_UI_SETTINGS.headingCollapseState,
      aisleWidths: isRecord(currentUi.aisleWidths)
        ? normalizeAisleWidths(currentUi.aisleWidths)
        : DEFAULT_SYNCED_UI_SETTINGS.aisleWidths,
    },
  }
}

export function extractEditorState(appState) {
  const ui = isRecord(appState?.ui) ? appState.ui : {}
  return {
    noteCursorLocations: pruneNoteCursorLocationsForLiveNotes(ui.noteCursorLocations, appState),
    headingCollapseState: pruneHeadingCollapseStateForReferencedNotes(ui.headingCollapseState, appState),
    aisleWidths: pruneAisleWidthsForLiveNotes(ui.aisleWidths, appState),
  }
}

export function buildSyncedSettingsFromSplitFiles(parts) {
  const appSettings = normalizePortableAppSettings(parts?.appSettings)
  const shortcutSettings = normalizeShortcutSettings(appSettings.hotkeys)
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
    toolbarButtonScale:
      typeof appSettings.toolbarButtonScale === 'number'
        ? appSettings.toolbarButtonScale
        : DEFAULT_SYNCED_UI_SETTINGS.toolbarButtonScale,
    dataSettingsSection: optionalDataSettingsSection(
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
    aisleWidths: normalizeAisleWidths(editorState.aisleWidths),
    seenTipIds: optionalArray(uiPreferences.seenTipIds, DEFAULT_SYNCED_UI_SETTINGS.seenTipIds),
  }

  return {
    theme: normalizeStorageTheme(appSettings.theme),
    hotkeys: shortcutSettings,
    frontmatter: frontmatterSettings,
    ui,
  }
}
