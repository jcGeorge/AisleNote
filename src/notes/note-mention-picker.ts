import type { AppState, Domain, NoteLocation, Space, SubTab, Tab } from '../types/app'
import { filterNoteSearchEntries, type NoteSearchEntry } from './note-locations'

export type NoteMentionNavigatorRowId = 'domain' | 'space' | 'tab' | 'note'

export type NoteMentionNavigatorItem = {
  id: string
  label: string
  target?: NoteLocation
}

export type NoteMentionNavigatorRow = {
  id: NoteMentionNavigatorRowId
  label: string
  items: NoteMentionNavigatorItem[]
  selectedId: string
}

export type NoteMentionSelection = NoteLocation

const NAVIGATOR_ROW_IDS: NoteMentionNavigatorRowId[] = ['domain', 'space', 'tab', 'note']
const HOME_NOTE_ID = '__home__'

function getProjectedDomains(sourceState: AppState): Domain[] {
  return sourceState.domains.map((domain) =>
    domain.id === sourceState.activeDomainId
      ? { ...domain, activeSpaceId: sourceState.activeSpaceId, spaces: sourceState.spaces }
      : domain,
  )
}

function getDomain(sourceState: AppState, domainId: string): Domain | null {
  return getProjectedDomains(sourceState).find((domain) => domain.id === domainId) ?? getProjectedDomains(sourceState)[0] ?? null
}

function getSpace(domain: Domain | null, spaceId: string): Space | null {
  return domain?.spaces.find((space) => space.id === spaceId) ?? domain?.spaces[0] ?? null
}

function getTab(space: Space | null, tabId: string): Tab | null {
  return space?.data.tabs.find((tab) => tab.id === tabId) ?? space?.data.tabs[0] ?? null
}

function getSubTab(tab: Tab | null, subTabId: string | null): SubTab | null {
  return subTabId && tab ? tab.subTabs.find((subTab) => subTab.id === subTabId) ?? null : null
}

function firstSelectionForDomain(sourceState: AppState, domain: Domain | null): NoteMentionSelection {
  const space =
    domain?.spaces.find((candidate) => candidate.id === (domain.id === sourceState.activeDomainId ? sourceState.activeSpaceId : domain.activeSpaceId)) ??
    domain?.spaces[0] ??
    null
  const tab = space?.data.tabs.find((candidate) => candidate.id === space.data.activeTabId) ?? space?.data.tabs[0] ?? null
  return {
    domainId: domain?.id ?? '',
    spaceId: space?.id ?? '',
    tabId: tab?.id ?? '',
    subTabId: null,
  }
}

export function resolveNoteMentionSelection(
  sourceState: AppState,
  selection: NoteMentionSelection,
): NoteMentionSelection {
  const domain = getDomain(sourceState, selection.domainId)
  const space = getSpace(domain, selection.spaceId)
  const tab = getTab(space, selection.tabId)
  const subTab = getSubTab(tab, selection.subTabId)
  return {
    domainId: domain?.id ?? '',
    spaceId: space?.id ?? '',
    tabId: tab?.id ?? '',
    subTabId: subTab?.id ?? null,
  }
}

export function createDefaultNoteMentionSelection(
  sourceState: AppState,
  currentLocation: NoteLocation,
): NoteMentionSelection {
  return resolveNoteMentionSelection(sourceState, currentLocation)
}

export function buildNoteMentionNavigatorRows(
  sourceState: AppState,
  selection: NoteMentionSelection,
): NoteMentionNavigatorRow[] {
  const resolved = resolveNoteMentionSelection(sourceState, selection)
  const domains = getProjectedDomains(sourceState)
  const domain = getDomain(sourceState, resolved.domainId)
  const space = getSpace(domain, resolved.spaceId)
  const tab = getTab(space, resolved.tabId)
  const noteItems: NoteMentionNavigatorItem[] = [
    {
      id: HOME_NOTE_ID,
      label: 'home',
      target: { domainId: resolved.domainId, spaceId: resolved.spaceId, tabId: resolved.tabId, subTabId: null },
    },
    ...(tab?.subTabs.map((subTab) => ({
      id: subTab.id,
      label: subTab.title,
      target: { domainId: resolved.domainId, spaceId: resolved.spaceId, tabId: resolved.tabId, subTabId: subTab.id },
    })) ?? []),
  ]

  return [
    {
      id: 'domain',
      label: 'domains',
      selectedId: resolved.domainId,
      items: domains.map((candidate) => ({ id: candidate.id, label: candidate.name })),
    },
    {
      id: 'space',
      label: 'spaces',
      selectedId: resolved.spaceId,
      items: domain?.spaces.map((candidate) => ({ id: candidate.id, label: candidate.name })) ?? [],
    },
    {
      id: 'tab',
      label: 'prime tabs',
      selectedId: resolved.tabId,
      items: space?.data.tabs.map((candidate) => ({ id: candidate.id, label: candidate.title })) ?? [],
    },
    {
      id: 'note',
      label: 'notes',
      selectedId: resolved.subTabId ?? HOME_NOTE_ID,
      items: noteItems,
    },
  ]
}

export function updateNoteMentionSelectionForRow(
  sourceState: AppState,
  selection: NoteMentionSelection,
  rowId: NoteMentionNavigatorRowId,
  itemId: string,
): NoteMentionSelection {
  const resolved = resolveNoteMentionSelection(sourceState, selection)
  if (rowId === 'domain') {
    return firstSelectionForDomain(sourceState, getDomain(sourceState, itemId))
  }
  if (rowId === 'space') {
    const domain = getDomain(sourceState, resolved.domainId)
    const space = getSpace(domain, itemId)
    const tab = getTab(space, space?.data.activeTabId ?? '')
    return {
      domainId: resolved.domainId,
      spaceId: space?.id ?? '',
      tabId: tab?.id ?? '',
      subTabId: null,
    }
  }
  if (rowId === 'tab') {
    return {
      domainId: resolved.domainId,
      spaceId: resolved.spaceId,
      tabId: itemId,
      subTabId: null,
    }
  }
  return {
    ...resolved,
    subTabId: itemId === HOME_NOTE_ID ? null : itemId,
  }
}

export function moveNoteMentionActiveRow(
  currentRow: NoteMentionNavigatorRowId,
  delta: number,
): NoteMentionNavigatorRowId {
  const currentIndex = NAVIGATOR_ROW_IDS.indexOf(currentRow)
  const nextIndex = Math.max(0, Math.min(NAVIGATOR_ROW_IDS.length - 1, currentIndex + delta))
  return NAVIGATOR_ROW_IDS[nextIndex] ?? 'space'
}

export function moveNoteMentionSelectionInRow(
  sourceState: AppState,
  selection: NoteMentionSelection,
  rowId: NoteMentionNavigatorRowId,
  delta: number,
): NoteMentionSelection {
  const rows = buildNoteMentionNavigatorRows(sourceState, selection)
  const row = rows.find((candidate) => candidate.id === rowId)
  if (!row || row.items.length === 0) return resolveNoteMentionSelection(sourceState, selection)
  const selectedIndex = Math.max(0, row.items.findIndex((item) => item.id === row.selectedId))
  const nextIndex = Math.max(0, Math.min(row.items.length - 1, selectedIndex + delta))
  return updateNoteMentionSelectionForRow(sourceState, selection, rowId, row.items[nextIndex]?.id ?? row.selectedId)
}

export function getNoteMentionTarget(selection: NoteMentionSelection): NoteLocation {
  return {
    domainId: selection.domainId,
    spaceId: selection.spaceId,
    tabId: selection.tabId,
    subTabId: selection.subTabId,
  }
}

export function filterNoteMentionSearchEntries(
  entries: NoteSearchEntry[],
  query: string,
  currentLocation: NoteLocation,
  limit = 10,
): NoteSearchEntry[] {
  return filterNoteSearchEntries(entries, query, entries.length)
    .map((entry, index) => ({
      entry,
      index,
      contextScore:
        (entry.domainId === currentLocation.domainId ? 10 : 0) +
        (entry.spaceId === currentLocation.spaceId ? 30 : 0) +
        (entry.tabId === currentLocation.tabId ? 20 : 0),
    }))
    .sort((left, right) => right.contextScore - left.contextScore || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.entry)
}
