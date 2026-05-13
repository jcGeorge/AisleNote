import { DEFAULT_SHORTCUTS, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
  normalizeUiSettings,
} from '../settings/defaults'
import type { AppState, AppTheme, Domain, NoteAisle, NoteBody, Space, SubTab, Tab } from '../types/app'
import {
  createDefaultDomain,
  createLegacyWrappedDomain,
  normalizeDomains,
  normalizeSpaces,
  projectActiveDomainState,
} from './domains'
import {
  applyAutoPurgeToWorkspace,
  createId,
  normalizeWorkspaceData,
} from './workspace'

const DEFAULT_DOMAIN = createDefaultDomain()

const RAW_DEFAULT_STATE: AppState = {
  theme: 'dawn',
  activeDomainId: DEFAULT_DOMAIN.id,
  domains: [DEFAULT_DOMAIN],
  noteBodies: [],
  activeSpaceId: DEFAULT_DOMAIN.activeSpaceId,
  spaces: DEFAULT_DOMAIN.spaces,
  hotkeys: {
    shortcuts: DEFAULT_SHORTCUTS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
  },
  ui: DEFAULT_UI_SETTINGS,
}

function createNoteBodyWithId(id: string, markdown = ''): NoteBody {
  return {
    id,
    aisles: [
      {
        id: createId(),
        markdown: normalizeMarkdownForPersistence(markdown),
      },
    ],
  }
}

function normalizeNoteAisles(raw: unknown): NoteAisle[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((aisle): aisle is Record<string, unknown> => Boolean(aisle) && typeof aisle === 'object')
    .map((aisle) => ({
      id: typeof aisle.id === 'string' && aisle.id ? aisle.id : createId(),
      markdown: normalizeMarkdownForPersistence(typeof aisle.markdown === 'string' ? aisle.markdown : ''),
    }))
}

function normalizeNoteBodies(raw: unknown): NoteBody[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const bodies: NoteBody[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : createId()
    if (seen.has(id)) continue
    seen.add(id)
    const aisles = normalizeNoteAisles(candidate.aisles)
    bodies.push({
      id,
      aisles:
        aisles.length > 0
          ? aisles
          : [
              {
                id: createId(),
                markdown: normalizeMarkdownForPersistence(typeof candidate.markdown === 'string' ? candidate.markdown : ''),
              },
            ],
    })
  }
  return bodies
}

function getFirstAisleMarkdown(noteBodies: Map<string, NoteBody>, noteBodyId: string, fallback: string): string {
  const body = noteBodies.get(noteBodyId)
  return body?.aisles[0]?.markdown ?? normalizeMarkdownForPersistence(fallback)
}

function ensureTabBodies(tab: Tab, noteBodies: Map<string, NoteBody>): Tab {
  const noteBodyId = tab.noteBodyId || createId()
  if (!noteBodies.has(noteBodyId)) {
    noteBodies.set(noteBodyId, createNoteBodyWithId(noteBodyId, tab.homeContent))
  }

  return {
    ...tab,
    noteBodyId,
    homeContent: getFirstAisleMarkdown(noteBodies, noteBodyId, tab.homeContent),
    subTabs: tab.subTabs.map((subTab) => ensureSubTabBody(subTab, noteBodies)),
  }
}

function ensureSubTabBody(subTab: SubTab, noteBodies: Map<string, NoteBody>): SubTab {
  const noteBodyId = subTab.noteBodyId || createId()
  if (!noteBodies.has(noteBodyId)) {
    noteBodies.set(noteBodyId, createNoteBodyWithId(noteBodyId, subTab.content))
  }

  return {
    ...subTab,
    noteBodyId,
    content: getFirstAisleMarkdown(noteBodies, noteBodyId, subTab.content),
  }
}

export function ensureNoteBodiesForAppState(appState: AppState): AppState {
  const projected = projectActiveDomainState(appState)
  const noteBodies = new Map(normalizeNoteBodies(projected.noteBodies).map((body) => [body.id, body]))

  const domains = projected.domains.map((domain) => ({
    ...domain,
    spaces: domain.spaces.map((space) => ({
      ...space,
      data: {
        ...space.data,
        tabs: space.data.tabs.map((tab) => ensureTabBodies(tab, noteBodies)),
        deletedTabs: space.data.deletedTabs.map((entry) => ({
          ...entry,
          tab: ensureTabBodies(entry.tab, noteBodies),
        })),
        deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
          ...entry,
          subTab: ensureSubTabBody(entry.subTab, noteBodies),
        })),
      },
    })),
  }))

  const activeDomain = domains.find((domain) => domain.id === projected.activeDomainId) ?? domains[0]
  const spaces = activeDomain?.spaces ?? projected.spaces

  return projectActiveDomainState({
    ...projected,
    domains,
    noteBodies: Array.from(noteBodies.values()),
    activeSpaceId:
      activeDomain?.activeSpaceId && spaces.some((space) => space.id === activeDomain.activeSpaceId)
        ? activeDomain.activeSpaceId
        : projected.activeSpaceId,
    spaces,
  })
}

export const DEFAULT_STATE: AppState = ensureNoteBodiesForAppState(RAW_DEFAULT_STATE)

function normalizeAppTheme(value: unknown): AppTheme {
  if (value === 'dark' || value === 'light' || value === 'dawn' || value === 'blues') return value
  if (value === 'dusk') return 'blues'
  return 'dawn'
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
    const theme = normalizeAppTheme(parsed.theme)
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

      return ensureNoteBodiesForAppState(projectActiveDomainState({
        theme,
        activeDomainId: activeDomain.id,
        domains,
        noteBodies: normalizeNoteBodies(parsed.noteBodies),
        activeSpaceId,
        spaces,
        hotkeys: normalizeHotkeySettings(parsed.hotkeys),
        ui: normalizeUiSettings(parsed.ui),
      }))
    }

    // Legacy single-workspace migration
    const migratedSpace: Space = {
      id: 'getting-started-space',
      name: 'Getting Started',
      settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      data: applyAutoPurgeToWorkspace(normalizeWorkspaceData(parsed), DEFAULT_AUTO_REMOVE_DAYS),
    }
    const migratedDomain = createLegacyWrappedDomain([migratedSpace], migratedSpace.id)
    return ensureNoteBodiesForAppState(projectActiveDomainState({
      theme,
      activeDomainId: migratedDomain.id,
      domains: [migratedDomain],
      noteBodies: normalizeNoteBodies(parsed.noteBodies),
      activeSpaceId: migratedSpace.id,
      spaces: [migratedSpace],
      hotkeys: normalizeHotkeySettings(parsed.hotkeys),
      ui: normalizeUiSettings(parsed.ui),
    }))
  } catch {
    return DEFAULT_STATE
  }
}

export function applyMarkdownToAppState(
  previous: AppState,
  spaceId: string,
  tabId: string,
  subTabId: string | null,
  aisleId: string,
  markdown: string,
): AppState {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const projected = ensureNoteBodiesForAppState(previous)
  let targetNoteBodyId: string | null = null

  const spaces = projected.spaces.map((space) => {
    if (space.id !== spaceId) return space

    let spaceChanged = false
    const data = space.data
    const tabs = data.tabs.map((tab) => {
      if (tab.id !== tabId) return tab

      if (subTabId === null) {
        targetNoteBodyId = tab.noteBodyId
        if (tab.homeContent === normalizedMarkdown) return tab
        spaceChanged = true
        return { ...tab, homeContent: normalizedMarkdown }
      }

      let tabChanged = false
      const subTabs = tab.subTabs.map((sub) => {
        if (sub.id !== subTabId) return sub
        targetNoteBodyId = sub.noteBodyId
        if (sub.content === normalizedMarkdown) return sub
        tabChanged = true
        return { ...sub, content: normalizedMarkdown }
      })

      if (!tabChanged) return tab
      spaceChanged = true
      return { ...tab, subTabs }
    })

    if (!spaceChanged) return space
    return { ...space, data: { ...data, tabs } }
  })

  if (!targetNoteBodyId) return projected

  let bodyChanged = false
  const noteBodies = projected.noteBodies.map((body) => {
    if (body.id !== targetNoteBodyId) return body
    const targetAisleId = aisleId || body.aisles[0]?.id || createId()
    let aisleFound = false
    const aisles = body.aisles.map((aisle, index) => {
      const matches = aisle.id === targetAisleId || (!aisleId && index === 0)
      if (!matches) return aisle
      aisleFound = true
      if (aisle.markdown === normalizedMarkdown) return aisle
      bodyChanged = true
      return { ...aisle, markdown: normalizedMarkdown }
    })

    if (!aisleFound) {
      bodyChanged = true
      return {
        ...body,
        aisles: [...aisles, { id: targetAisleId, markdown: normalizedMarkdown }],
      }
    }
    return bodyChanged ? { ...body, aisles } : body
  })

  if (!bodyChanged && spaces === projected.spaces) return projected
  return ensureNoteBodiesForAppState({ ...projected, spaces, noteBodies })
}
