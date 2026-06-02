import { DEFAULT_TOOLBAR_LAYOUT_ID } from '../editor/toolbar-layouts'
import { normalizeHeadingCollapseState } from '../editor/heading-collapse-state'
import { normalizeNoteCursorLocations } from '../notes/note-cursors'
import { normalizeTagAutocompleteRecentKeys } from '../tags/tag-autocomplete'
import {
  DEFAULT_DATA_SETTINGS_SECTION,
  DEFAULT_UI_SETTINGS,
  DEFAULT_VISUALS_SETTINGS_SECTION,
  clampNoteFontScale,
  clampTabButtonScale,
  clampTooltipScale,
  normalizeDataSettingsSection,
  normalizeSettingsSection,
  normalizeVisualsSettingsSection,
} from '../settings/defaults'
import { projectActiveDomainState } from '../state/domains'
import { normalizeTipIds } from '../tips/tips'
import type { AppState, DataSettingsSection, ViewMode, VisualsSettingsSection } from '../types/app'

export const DEVICE_SETTINGS_STORAGE_KEY = 'tabs:device-settings:v1'

const VIEW_MODES: ViewMode[] = ['main', 'trash', 'settings', 'stage-manager', 'messages', 'visualizer', 'about']

export type DeviceLastOpened = {
  domainId: string
  spaceId: string
  primeTabId: string | null
  subTabId: string | null
  viewMode: ViewMode
  scratchpadActive?: boolean
}

export type DeviceSettings = {
  activeToolbarLayoutId: string
  lastOpened: DeviceLastOpened | null
  noteCursorLocations: AppState['ui']['noteCursorLocations']
  headingCollapseState: AppState['ui']['headingCollapseState']
  settingsSection: AppState['ui']['settingsSection']
  dataSettingsSection: DataSettingsSection
  visualsSettingsSection: VisualsSettingsSection
  seenTipIds: AppState['ui']['seenTipIds']
  tabButtonScale: number
  noteFontScale: number
  tooltipScale: number
  lastFindQuery: string
  tagAutocompleteRecentKeys: string[]
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  activeToolbarLayoutId: DEFAULT_TOOLBAR_LAYOUT_ID,
  lastOpened: null,
  noteCursorLocations: DEFAULT_UI_SETTINGS.noteCursorLocations,
  headingCollapseState: DEFAULT_UI_SETTINGS.headingCollapseState,
  settingsSection: DEFAULT_UI_SETTINGS.settingsSection,
  dataSettingsSection: DEFAULT_DATA_SETTINGS_SECTION,
  visualsSettingsSection: DEFAULT_VISUALS_SETTINGS_SECTION,
  seenTipIds: DEFAULT_UI_SETTINGS.seenTipIds,
  tabButtonScale: DEFAULT_UI_SETTINGS.tabButtonScale,
  noteFontScale: DEFAULT_UI_SETTINGS.noteFontScale,
  tooltipScale: DEFAULT_UI_SETTINGS.tooltipScale ?? 1,
  lastFindQuery: '',
  tagAutocompleteRecentKeys: [],
}

export type DeviceSettingsLoadResult = {
  settings: DeviceSettings
  hasStoredSettings: boolean
}

function normalizeDeviceLastOpened(raw: unknown): DeviceLastOpened | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const domainId = typeof obj.domainId === 'string' && obj.domainId.trim() ? obj.domainId.trim() : ''
  const spaceId = typeof obj.spaceId === 'string' && obj.spaceId.trim() ? obj.spaceId.trim() : ''
  if (!domainId || !spaceId) return null
  const primeTabId = typeof obj.primeTabId === 'string' && obj.primeTabId.trim() ? obj.primeTabId.trim() : null
  const subTabId = typeof obj.subTabId === 'string' && obj.subTabId.trim() ? obj.subTabId.trim() : null
  const viewMode = normalizeDeviceViewMode(obj.viewMode)
  const scratchpadActive = viewMode === 'main' && obj.scratchpadActive === true
  return {
    domainId,
    spaceId,
    primeTabId,
    subTabId,
    viewMode,
    scratchpadActive,
  }
}

function normalizeDeviceViewMode(raw: unknown): ViewMode {
  return typeof raw === 'string' && VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : 'main'
}

function normalizeDeviceSettingsValue(raw: unknown): DeviceSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_DEVICE_SETTINGS
  const obj = raw as Record<string, unknown>
  return {
    activeToolbarLayoutId:
      typeof obj.activeToolbarLayoutId === 'string' && obj.activeToolbarLayoutId.trim()
        ? obj.activeToolbarLayoutId.trim()
        : DEFAULT_DEVICE_SETTINGS.activeToolbarLayoutId,
    lastOpened: normalizeDeviceLastOpened(obj.lastOpened),
    noteCursorLocations: normalizeNoteCursorLocations(obj.noteCursorLocations),
    headingCollapseState: normalizeHeadingCollapseState(obj.headingCollapseState),
    settingsSection: normalizeSettingsSection(obj.settingsSection),
    dataSettingsSection: normalizeDataSettingsSection(obj.dataSettingsSection),
    visualsSettingsSection: normalizeVisualsSettingsSection(
      obj.visualsSettingsSection,
      DEFAULT_DEVICE_SETTINGS.visualsSettingsSection,
    ),
    seenTipIds: normalizeTipIds(obj.seenTipIds),
    tabButtonScale:
      typeof obj.tabButtonScale === 'number'
        ? clampTabButtonScale(obj.tabButtonScale)
        : DEFAULT_DEVICE_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof obj.noteFontScale === 'number'
        ? clampNoteFontScale(obj.noteFontScale)
        : DEFAULT_DEVICE_SETTINGS.noteFontScale,
    tooltipScale:
      typeof obj.tooltipScale === 'number'
        ? clampTooltipScale(obj.tooltipScale)
        : DEFAULT_DEVICE_SETTINGS.tooltipScale,
    lastFindQuery: typeof obj.lastFindQuery === 'string' ? obj.lastFindQuery : DEFAULT_DEVICE_SETTINGS.lastFindQuery,
    tagAutocompleteRecentKeys: normalizeTagAutocompleteRecentKeys(obj.tagAutocompleteRecentKeys),
  }
}

export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (!raw) return DEFAULT_DEVICE_SETTINGS
  try {
    return normalizeDeviceSettingsValue(JSON.parse(raw))
  } catch {
    return DEFAULT_DEVICE_SETTINGS
  }
}

export function loadDeviceSettings(storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage): DeviceSettings {
  return loadDeviceSettingsRecord(storage).settings
}

export function loadDeviceSettingsRecord(
  storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage,
): DeviceSettingsLoadResult {
  try {
    const raw = storage?.getItem(DEVICE_SETTINGS_STORAGE_KEY) ?? null
    return {
      settings: parseDeviceSettings(raw),
      hasStoredSettings: raw !== null,
    }
  } catch {
    return {
      settings: DEFAULT_DEVICE_SETTINGS,
      hasStoredSettings: false,
    }
  }
}

export function saveDeviceSettings(
  settings: DeviceSettings,
  storage: Pick<Storage, 'setItem'> | null | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeDeviceSettingsValue(settings)))
  } catch {
    // Device-local settings should never make app startup or settings changes fail.
  }
}

export function savePartialDeviceSettings(
  patch: Partial<DeviceSettings>,
  storage:
    | Pick<Storage, 'getItem' | 'setItem'>
    | null
    | undefined = globalThis.localStorage,
): void {
  saveDeviceSettings({ ...loadDeviceSettings(storage), ...patch }, storage)
}

export function loadActiveToolbarLayoutId(): string {
  return loadDeviceSettings().activeToolbarLayoutId
}

export function saveActiveToolbarLayoutId(activeToolbarLayoutId: string): void {
  savePartialDeviceSettings({ activeToolbarLayoutId })
}

function getDeviceLastOpenedFromAppState(
  appState: AppState,
  viewMode: ViewMode,
  scratchpadActive = false,
): DeviceLastOpened | null {
  const projected = projectActiveDomainState(appState)
  const activeDomain = projected.domains.find((domain) => domain.id === projected.activeDomainId) ?? projected.domains[0]
  const activeSpace = activeDomain?.spaces.find((space) => space.id === projected.activeSpaceId) ?? activeDomain?.spaces[0]
  const activeTab = activeSpace?.data.tabs.find((tab) => tab.id === activeSpace.data.activeTabId) ?? activeSpace?.data.tabs[0]
  const normalizedViewMode = normalizeDeviceViewMode(viewMode)
  if (!activeDomain || !activeSpace) return null
  return {
    domainId: activeDomain.id,
    spaceId: activeSpace.id,
    primeTabId: activeTab?.id ?? null,
    subTabId: activeTab?.activeSubTabId ?? null,
    viewMode: normalizedViewMode,
    scratchpadActive: normalizedViewMode === 'main' && scratchpadActive,
  }
}

export function extractDeviceSettingsFromAppState(
  appState: AppState,
  baseSettings: DeviceSettings = loadDeviceSettings(),
  viewMode: ViewMode = baseSettings.lastOpened?.viewMode ?? 'main',
  scratchpadActive = baseSettings.lastOpened?.scratchpadActive ?? false,
): DeviceSettings {
  return {
    ...baseSettings,
    lastOpened: getDeviceLastOpenedFromAppState(appState, viewMode, scratchpadActive),
    noteCursorLocations: appState.ui.noteCursorLocations,
    headingCollapseState: appState.ui.headingCollapseState,
    settingsSection: appState.ui.settingsSection,
    dataSettingsSection: appState.ui.dataSettingsSection ?? DEFAULT_DATA_SETTINGS_SECTION,
    visualsSettingsSection: appState.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION,
    seenTipIds: appState.ui.seenTipIds,
    tabButtonScale: appState.ui.tabButtonScale,
    noteFontScale: appState.ui.noteFontScale,
    tooltipScale: appState.ui.tooltipScale ?? DEFAULT_UI_SETTINGS.tooltipScale ?? 1,
  }
}

export function shouldRestoreScratchpadWorkspace(lastOpened: DeviceLastOpened | null | undefined): boolean {
  return lastOpened?.viewMode === 'main' && lastOpened.scratchpadActive === true
}

function applyLastOpenedToAppState(appState: AppState, lastOpened: DeviceLastOpened | null): AppState {
  const projected = projectActiveDomainState(appState)
  if (!lastOpened) return projected

  const targetDomain =
    projected.domains.find((domain) => domain.id === lastOpened.domainId) ?? projected.domains[0] ?? null
  if (!targetDomain) return projected

  const targetSpace =
    targetDomain.spaces.find((space) => space.id === lastOpened.spaceId) ?? targetDomain.spaces[0] ?? null
  if (!targetSpace) return projected

  const targetTab =
    (lastOpened.primeTabId ? targetSpace.data.tabs.find((tab) => tab.id === lastOpened.primeTabId) : null) ??
    targetSpace.data.tabs.find((tab) => tab.id === targetSpace.data.activeTabId) ??
    targetSpace.data.tabs[0] ??
    null
  const targetSubTabId =
    targetTab && lastOpened.subTabId && targetTab.subTabs.some((subTab) => subTab.id === lastOpened.subTabId)
      ? lastOpened.subTabId
      : null
  const nextSpace = targetTab
    ? {
        ...targetSpace,
        data: {
          ...targetSpace.data,
          activeTabId: targetTab.id,
          tabs: targetSpace.data.tabs.map((tab) =>
            tab.id === targetTab.id ? { ...tab, activeSubTabId: targetSubTabId } : tab,
          ),
        },
      }
    : targetSpace
  const nextDomain = {
    ...targetDomain,
    activeSpaceId: targetSpace.id,
    spaces: targetDomain.spaces.map((space) => (space.id === targetSpace.id ? nextSpace : space)),
  }

  return projectActiveDomainState({
    ...projected,
    activeDomainId: nextDomain.id,
    activeSpaceId: nextSpace.id,
    spaces: nextDomain.spaces,
    domains: projected.domains.map((domain) => (domain.id === nextDomain.id ? nextDomain : domain)),
  })
}

export function applyDeviceSettingsToAppState(appState: AppState, settings: DeviceSettings): AppState {
  return applyLastOpenedToAppState(
    {
      ...appState,
      ui: {
        ...appState.ui,
        noteCursorLocations: settings.noteCursorLocations,
        headingCollapseState: settings.headingCollapseState,
        settingsSection: settings.settingsSection,
        dataSettingsSection: settings.dataSettingsSection,
        visualsSettingsSection: settings.visualsSettingsSection,
        seenTipIds: settings.seenTipIds,
        tabButtonScale: settings.tabButtonScale,
        noteFontScale: settings.noteFontScale,
        tooltipScale: settings.tooltipScale,
      },
    },
    settings.lastOpened,
  )
}

export function mergeLoadedSettings(
  appState: AppState,
  deviceSettingsLoadResult: DeviceSettingsLoadResult = loadDeviceSettingsRecord(),
): AppState {
  return deviceSettingsLoadResult.hasStoredSettings
    ? applyDeviceSettingsToAppState(appState, deviceSettingsLoadResult.settings)
    : projectActiveDomainState(appState)
}

export function saveDeviceLastOpened(lastOpened: DeviceLastOpened): void {
  savePartialDeviceSettings({ lastOpened })
}
