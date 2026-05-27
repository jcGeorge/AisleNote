import type { DeleteTarget, DeletedSubTabEntry, NoteLocation, Tab, WorkspaceData } from '../types/app'
import { buildNoteLocationKey } from '../notes/note-locations'

function noteLocation(domainId: string, spaceId: string, tabId: string, subTabId: string | null): NoteLocation {
  return { domainId, spaceId, tabId, subTabId }
}

function noteLocationsForTab(domainId: string, spaceId: string, tab: Tab): NoteLocation[] {
  return [
    noteLocation(domainId, spaceId, tab.id, null),
    ...tab.subTabs.map((subTab) => noteLocation(domainId, spaceId, tab.id, subTab.id)),
  ]
}

function noteLocationForDeletedSubTab(
  domainId: string,
  spaceId: string,
  entry: DeletedSubTabEntry,
): NoteLocation {
  return noteLocation(domainId, spaceId, entry.parentTabId, entry.subTab.id)
}

function dedupeNoteLocations(locations: NoteLocation[]): NoteLocation[] {
  const seen = new Set<string>()
  return locations.filter((location) => {
    const key = buildNoteLocationKey(location)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getNoteReferenceCleanupTargetsForDeleteTarget(
  data: WorkspaceData,
  domainId: string,
  spaceId: string,
  target: DeleteTarget,
): NoteLocation[] {
  if (target.type === 'tab') {
    const tab = data.tabs.find((candidate) => candidate.id === target.tabId)
    return tab ? noteLocationsForTab(domainId, spaceId, tab) : []
  }

  if (target.type === 'subtab') {
    const parent = data.tabs.find((candidate) => candidate.id === target.tabId)
    const subTab = parent?.subTabs.find((candidate) => candidate.id === target.subTabId) ?? null
    return parent && subTab ? [noteLocation(domainId, spaceId, parent.id, subTab.id)] : []
  }

  if (target.type === 'trash-tab') {
    if (target.source === 'subtabs-only') {
      return dedupeNoteLocations(
        data.deletedSubTabs
          .filter((entry) => entry.parentTabId === target.parentTabId)
          .map((entry) => noteLocationForDeletedSubTab(domainId, spaceId, entry)),
      )
    }

    const deletedTab = data.deletedTabs.find((entry) => entry.id === target.deletedTabEntryId)
    return deletedTab ? noteLocationsForTab(domainId, spaceId, deletedTab.tab) : []
  }

  if (target.type === 'trash-subtab') {
    if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
      const deletedTab = data.deletedTabs.find((entry) => entry.id === target.deletedTabEntryId)
      const subTab = deletedTab?.tab.subTabs.find((candidate) => candidate.id === target.subTabId) ?? null
      return deletedTab && subTab ? [noteLocation(domainId, spaceId, deletedTab.tab.id, subTab.id)] : []
    }

    const deletedSubTab = data.deletedSubTabs.find((entry) => entry.id === target.subTabId) ?? null
    return deletedSubTab ? [noteLocationForDeletedSubTab(domainId, spaceId, deletedSubTab)] : []
  }

  return []
}

export function getNoteReferenceCleanupTargetsForTrash(
  data: WorkspaceData,
  domainId: string,
  spaceId: string,
): NoteLocation[] {
  return dedupeNoteLocations([
    ...data.deletedTabs.flatMap((entry) => noteLocationsForTab(domainId, spaceId, entry.tab)),
    ...data.deletedSubTabs.map((entry) => noteLocationForDeletedSubTab(domainId, spaceId, entry)),
  ])
}
