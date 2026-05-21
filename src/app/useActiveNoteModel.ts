import { useMemo } from 'react'
import { getNoteBodyMarkdown, resolveNoteBody } from '../notes/note-markdown'
import { buildNoteCursorLocationKey } from '../notes/note-cursors'
import type { AppState, NoteLocation } from '../types/app'

type UseActiveNoteModelOptions = {
  state: AppState
  activeAisleId: string
}

export const useActiveNoteModel = ({
  state,
  activeAisleId,
}: UseActiveNoteModelOptions) => {
  const activeSpace = useMemo(
    () => state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0],
    [state.activeSpaceId, state.spaces],
  )

  const workspace = activeSpace.data

  const activeTab = useMemo(
    () => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0],
    [workspace.activeTabId, workspace.tabs],
  )

  const activeSubTab = useMemo(
    () =>
      activeTab.activeSubTabId
        ? activeTab.subTabs.find((sub) => sub.id === activeTab.activeSubTabId) ?? null
        : null,
    [activeTab],
  )

  const activeNoteBodyId = activeSubTab?.noteBodyId ?? activeTab.noteBodyId
  const storedActiveNoteBody = useMemo(
    () => state.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null,
    [activeNoteBodyId, state.noteBodies],
  )
  const activeNoteBody = useMemo(
    () => (storedActiveNoteBody ? resolveNoteBody(storedActiveNoteBody, state.noteAisleBodies) : null),
    [storedActiveNoteBody, state.noteAisleBodies],
  )
  const activeNoteAisles = useMemo(() => activeNoteBody?.aisles ?? [], [activeNoteBody?.aisles])

  const activeNoteLocation = useMemo<NoteLocation>(
    () => ({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: activeTab.id,
      subTabId: activeSubTab?.id ?? null,
    }),
    [state.activeDomainId, activeSpace.id, activeTab.id, activeSubTab?.id],
  )

  const activeNoteLocationKey = buildNoteCursorLocationKey(activeNoteLocation)
  const savedCursorLocation = state.ui.noteCursorLocations[activeNoteLocationKey] ?? null
  const savedActiveAisleId =
    savedCursorLocation && activeNoteAisles.some((aisle) => aisle.id === savedCursorLocation.activeAisleId)
      ? savedCursorLocation.activeAisleId
      : ''
  const resolvedActiveAisleId =
    activeNoteAisles.some((aisle) => aisle.id === activeAisleId)
      ? activeAisleId
      : savedActiveAisleId || (activeNoteAisles[0]?.id ?? '')

  const domainsForPickers = useMemo(
    () => state.domains.map((domain) => (domain.id === state.activeDomainId ? { ...domain, spaces: state.spaces } : domain)),
    [state.activeDomainId, state.domains, state.spaces],
  )

  const activeContent = getNoteBodyMarkdown(activeNoteBody, resolvedActiveAisleId, state.noteAisleBodies)

  return {
    activeSpace,
    workspace,
    activeTab,
    activeSubTab,
    activeNoteBodyId,
    activeNoteBody,
    activeNoteAisles,
    activeNoteLocation,
    activeNoteLocationKey,
    resolvedActiveAisleId,
    domainsForPickers,
    activeContent,
  }
}
