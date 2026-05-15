import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { setActiveDomain, setActiveSpaceInActiveDomain, updateSpaceInActiveDomain } from '../state/domains'
import type { AppState, NoteAisle, NoteCursorLocation, NoteCursorSelection, NoteLocation } from '../types/app'
import { noteCursorSelectionsEqual, pruneNoteCursorLocations } from './note-cursors'

export const cloneAisles = (aisles: NoteAisle[]): NoteAisle[] =>
  aisles.map((aisle) => ({ id: aisle.id, markdown: normalizeMarkdownForPersistence(aisle.markdown) }))

export const getAisleSignature = (aisles: NoteAisle[]) =>
  JSON.stringify(aisles.map((aisle) => [aisle.id, normalizeMarkdownForPersistence(aisle.markdown)]))

export const syncNoteBodyAislesInState = (previous: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState => {
  const normalizedAisles = cloneAisles(aisles)
  const firstMarkdown = normalizedAisles[0]?.markdown ?? ''
  const syncTabs = (tabs: typeof previous.spaces[number]['data']['tabs']) =>
    tabs.map((tab) => ({
      ...tab,
      homeContent: tab.noteBodyId === noteBodyId ? firstMarkdown : tab.homeContent,
      subTabs: tab.subTabs.map((subTab) =>
        subTab.noteBodyId === noteBodyId ? { ...subTab, content: firstMarkdown } : subTab,
      ),
    }))
  const syncSpace = (space: typeof previous.spaces[number]) => ({
    ...space,
    data: {
      ...space.data,
      tabs: syncTabs(space.data.tabs),
      deletedTabs: space.data.deletedTabs.map((entry) => ({
        ...entry,
        tab: {
          ...entry.tab,
          homeContent: entry.tab.noteBodyId === noteBodyId ? firstMarkdown : entry.tab.homeContent,
          subTabs: entry.tab.subTabs.map((subTab) =>
            subTab.noteBodyId === noteBodyId ? { ...subTab, content: firstMarkdown } : subTab,
          ),
        },
      })),
      deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
        ...entry,
        subTab: entry.subTab.noteBodyId === noteBodyId ? { ...entry.subTab, content: firstMarkdown } : entry.subTab,
      })),
    },
  })

  return {
    ...previous,
    noteBodies: previous.noteBodies.map((body) =>
      body.id === noteBodyId ? { ...body, aisles: normalizedAisles } : body,
    ),
    domains: previous.domains.map((domain) => ({
      ...domain,
      spaces: domain.spaces.map(syncSpace),
    })),
    spaces: previous.spaces.map(syncSpace),
  }
}

export const applyNoteLocationToState = (previous: AppState, location: NoteLocation): AppState => {
  const domainState = setActiveDomain(previous, location.domainId)
  const spaceState = setActiveSpaceInActiveDomain(domainState, location.spaceId)
  return updateSpaceInActiveDomain(spaceState, location.spaceId, (space) => ({
    ...space,
    data: {
      ...space.data,
      activeTabId: location.tabId,
      tabs: space.data.tabs.map((tab) =>
        tab.id === location.tabId ? { ...tab, activeSubTabId: location.subTabId ?? null } : tab,
      ),
    },
  }))
}

export const updateCursorLocationInState = (
  previous: AppState,
  noteLocationKey: string,
  aisleId: string,
  selection: NoteCursorSelection | null,
  now = Date.now(),
): AppState => {
  if (!noteLocationKey || !aisleId) return previous
  const current = previous.ui.noteCursorLocations[noteLocationKey]
  const currentSelection = current?.aisles[aisleId] ?? null
  const nextSelection = selection ? { ...selection, updatedAt: now } : currentSelection
  const nextAisles = nextSelection ? { ...(current?.aisles ?? {}), [aisleId]: nextSelection } : current?.aisles ?? {}
  const nextLocation: NoteCursorLocation = {
    activeAisleId: aisleId,
    aisles: nextAisles,
    updatedAt: now,
  }

  if (
    current &&
    current.activeAisleId === nextLocation.activeAisleId &&
    noteCursorSelectionsEqual(currentSelection, nextSelection)
  ) {
    return previous
  }

  return {
    ...previous,
    ui: {
      ...previous.ui,
      noteCursorLocations: pruneNoteCursorLocations({
        ...previous.ui.noteCursorLocations,
        [noteLocationKey]: nextLocation,
      }),
    },
  }
}

export const applyCursorLocationSnapshot = (
  previous: AppState,
  locationKey: string,
  cursorLocation: NoteCursorLocation | null,
): AppState => {
  if (!cursorLocation) return previous
  return {
    ...previous,
    ui: {
      ...previous.ui,
      noteCursorLocations: pruneNoteCursorLocations({
        ...previous.ui.noteCursorLocations,
        [locationKey]: cursorLocation,
      }),
    },
  }
}
