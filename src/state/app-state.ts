import { DEFAULT_SHORTCUTS, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
  normalizeUiSettings,
} from '../settings/defaults'
import type { AppState, AppTheme, Domain, Space } from '../types/app'
import {
  createDefaultDomain,
  createLegacyWrappedDomain,
  normalizeDomains,
  normalizeSpaces,
  projectActiveDomainState,
} from './domains'
import {
  applyAutoPurgeToWorkspace,
  normalizeWorkspaceData,
} from './workspace'

const DEFAULT_DOMAIN = createDefaultDomain()

export const DEFAULT_STATE: AppState = {
  theme: 'dark',
  activeDomainId: DEFAULT_DOMAIN.id,
  domains: [DEFAULT_DOMAIN],
  activeSpaceId: DEFAULT_DOMAIN.activeSpaceId,
  spaces: DEFAULT_DOMAIN.spaces,
  hotkeys: {
    shortcuts: DEFAULT_SHORTCUTS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
  },
  ui: DEFAULT_UI_SETTINGS,
}

export function applyAutoPurgeToAppState(appState: AppState): AppState {
  const projected = projectActiveDomainState(appState)
  let spacesChanged = false
  const spaces = projected.spaces.map((space) => {
    const nextData = applyAutoPurgeToWorkspace(space.data, space.settings.autoRemoveDeletedDays)
    if (nextData === space.data) return space
    spacesChanged = true
    return {
      ...space,
      data: nextData,
    }
  })
  let domainsChanged = false
  const domains = projected.domains.map((domain) => {
    const sourceSpaces = domain.id === projected.activeDomainId ? spaces : domain.spaces
    let domainSpacesChanged = domain.id === projected.activeDomainId && spacesChanged
    const nextSpaces = sourceSpaces.map((space) => {
      if (domain.id === projected.activeDomainId && spacesChanged) return space
      const nextData = applyAutoPurgeToWorkspace(space.data, space.settings.autoRemoveDeletedDays)
      if (nextData === space.data) return space
      domainSpacesChanged = true
      return {
        ...space,
        data: nextData,
      }
    })

    if (!domainSpacesChanged) return domain
    domainsChanged = true
    return {
      ...domain,
      spaces: nextSpaces,
    }
  })

  if (!spacesChanged && !domainsChanged && projected === appState) return appState
  return projectActiveDomainState({
    ...projected,
    spaces,
    domains,
  })
}

export function parseSavedState(raw: string | null): AppState {
  if (!raw) return DEFAULT_STATE

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const theme: AppTheme = parsed.theme === 'light' || parsed.theme === 'dusk' ? parsed.theme : 'dark'
    const parsedDomains = normalizeDomains(parsed.domains)

    if (parsedDomains.length > 0 || (Array.isArray(parsed.spaces) && parsed.spaces.length > 0)) {
      const legacySpaces = normalizeSpaces(parsed.spaces)
      const rawActiveSpaceId = typeof parsed.activeSpaceId === 'string' ? parsed.activeSpaceId : null
      const domains: Domain[] =
        parsedDomains.length > 0
          ? parsedDomains
          : [createLegacyWrappedDomain(legacySpaces, rawActiveSpaceId)]
      const rawActiveDomainId = typeof parsed.activeDomainId === 'string' ? parsed.activeDomainId : null
      const activeDomain =
        (rawActiveDomainId ? domains.find((domain) => domain.id === rawActiveDomainId) : null) ?? domains[0]
      const spaces: Space[] = legacySpaces.length > 0 ? legacySpaces : activeDomain.spaces
      const activeSpaceId =
        rawActiveSpaceId && spaces.some((space) => space.id === rawActiveSpaceId)
          ? rawActiveSpaceId
          : activeDomain.activeSpaceId && spaces.some((space) => space.id === activeDomain.activeSpaceId)
            ? activeDomain.activeSpaceId
            : spaces[0].id

      return projectActiveDomainState({
        theme,
        activeDomainId: activeDomain.id,
        domains,
        activeSpaceId,
        spaces,
        hotkeys: normalizeHotkeySettings(parsed.hotkeys),
        ui: normalizeUiSettings(parsed.ui),
      })
    }

    // Legacy single-workspace migration
    const migratedSpace: Space = {
      id: 'getting-started-space',
      name: 'Getting Started',
      settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      data: applyAutoPurgeToWorkspace(normalizeWorkspaceData(parsed), DEFAULT_AUTO_REMOVE_DAYS),
    }
    const migratedDomain = createLegacyWrappedDomain([migratedSpace], migratedSpace.id)
    return projectActiveDomainState({
      theme,
      activeDomainId: migratedDomain.id,
      domains: [migratedDomain],
      activeSpaceId: migratedSpace.id,
      spaces: [migratedSpace],
      hotkeys: normalizeHotkeySettings(parsed.hotkeys),
      ui: normalizeUiSettings(parsed.ui),
    })
  } catch {
    return DEFAULT_STATE
  }
}

export function applyMarkdownToAppState(
  previous: AppState,
  spaceId: string,
  tabId: string,
  subTabId: string | null,
  markdown: string,
): AppState {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  let stateChanged = false

  const spaces = previous.spaces.map((space) => {
    if (space.id !== spaceId) return space

    let spaceChanged = false
    const data = space.data
    const tabs = data.tabs.map((tab) => {
      if (tab.id !== tabId) return tab

      if (subTabId === null) {
        if (tab.homeContent === normalizedMarkdown) return tab
        spaceChanged = true
        return { ...tab, homeContent: normalizedMarkdown }
      }

      let tabChanged = false
      const subTabs = tab.subTabs.map((sub) => {
        if (sub.id !== subTabId || sub.content === normalizedMarkdown) return sub
        tabChanged = true
        return { ...sub, content: normalizedMarkdown }
      })

      if (!tabChanged) return tab
      spaceChanged = true
      return { ...tab, subTabs }
    })

    if (!spaceChanged) return space
    stateChanged = true
    return { ...space, data: { ...data, tabs } }
  })

  return stateChanged ? projectActiveDomainState({ ...previous, spaces }) : previous
}
