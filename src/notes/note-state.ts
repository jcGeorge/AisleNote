import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { setActiveDomain, setActiveSpaceInActiveDomain, updateSpaceInActiveDomain } from '../state/domains'
import { createId, createTimestamp } from '../state/workspace'
import type { AppState, NoteAisle, NoteAisleBody, NoteCursorLocation, NoteCursorSelection, NoteLocation } from '../types/app'
import { getAisleBodyId } from './note-markdown'
import { noteCursorSelectionsEqual, pruneNoteCursorLocations } from './note-cursors'

export const cloneAisles = (aisles: NoteAisle[]): NoteAisle[] =>
  aisles.map((aisle) => ({
    id: aisle.id,
    aisleBodyId: getAisleBodyId(aisle),
    markdown: normalizeMarkdownForPersistence(aisle.markdown),
  }))

export const getAisleSignature = (aisles: NoteAisle[]) =>
  JSON.stringify(aisles.map((aisle) => [aisle.id, getAisleBodyId(aisle), normalizeMarkdownForPersistence(aisle.markdown)]))

export const getAisleStructureSignature = (aisles: NoteAisle[]) =>
  JSON.stringify(aisles.map((aisle) => [aisle.id, getAisleBodyId(aisle)]))

const syncNoteContentMirrors = (
  previous: AppState,
  noteBodies: AppState['noteBodies'],
  noteAisleBodies: NoteAisleBody[],
): AppState => {
  const sourceSpaces = previous.spaces ?? []
  const sourceDomains = previous.domains ?? []
  const firstMarkdownByBodyId = new Map(noteBodies.map((body) => [body.id, body.aisles[0]?.markdown ?? '']))
  const syncTabs = (tabs: typeof sourceSpaces[number]['data']['tabs']) =>
    tabs.map((tab) => ({
      ...tab,
      homeContent: firstMarkdownByBodyId.has(tab.noteBodyId)
        ? firstMarkdownByBodyId.get(tab.noteBodyId) ?? ''
        : tab.homeContent,
      subTabs: tab.subTabs.map((subTab) =>
        firstMarkdownByBodyId.has(subTab.noteBodyId)
          ? { ...subTab, content: firstMarkdownByBodyId.get(subTab.noteBodyId) ?? '' }
          : subTab,
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
          homeContent: firstMarkdownByBodyId.has(entry.tab.noteBodyId)
            ? firstMarkdownByBodyId.get(entry.tab.noteBodyId) ?? ''
            : entry.tab.homeContent,
          subTabs: entry.tab.subTabs.map((subTab) =>
            firstMarkdownByBodyId.has(subTab.noteBodyId)
              ? { ...subTab, content: firstMarkdownByBodyId.get(subTab.noteBodyId) ?? '' }
              : subTab,
          ),
        },
      })),
      deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
        ...entry,
        subTab: firstMarkdownByBodyId.has(entry.subTab.noteBodyId)
          ? { ...entry.subTab, content: firstMarkdownByBodyId.get(entry.subTab.noteBodyId) ?? '' }
          : entry.subTab,
      })),
    },
  })

  return {
    ...previous,
    noteBodies,
    noteAisleBodies,
    domains: sourceDomains.map((domain) => ({
      ...domain,
      spaces: domain.spaces.map(syncSpace),
    })),
    spaces: sourceSpaces.map(syncSpace),
  }
}

export const syncNoteBodyAislesInState = (previous: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState => {
  const now = createTimestamp()
  const normalizedAisles = cloneAisles(aisles.length > 0 ? aisles : [{ id: createId(), aisleBodyId: createId(), markdown: '' }])
  const currentBody = previous.noteBodies.find((body) => body.id === noteBodyId)
  const aislesChanged = currentBody ? getAisleSignature(currentBody.aisles) !== getAisleSignature(normalizedAisles) : true
  const aisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const updatedAisleBodyIds = new Set<string>()
  const nextAisleBodiesById = new Map<string, NoteAisleBody>(aisleBodiesById)
  const processedAisleBodyIds = new Set<string>()

  normalizedAisles.forEach((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    if (processedAisleBodyIds.has(aisleBodyId)) return
    processedAisleBodyIds.add(aisleBodyId)
    const markdown = normalizeMarkdownForPersistence(aisle.markdown)
    const existing = nextAisleBodiesById.get(aisleBodyId)
    if (!existing) {
      nextAisleBodiesById.set(aisleBodyId, {
        id: aisleBodyId,
        createdAt: now,
        updatedAt: now,
        markdown,
      })
      updatedAisleBodyIds.add(aisleBodyId)
      return
    }
    if (existing.markdown === markdown) return
    nextAisleBodiesById.set(aisleBodyId, {
      ...existing,
      updatedAt: now,
      markdown,
    })
    updatedAisleBodyIds.add(aisleBodyId)
  })

  const normalizeAisleMirror = (aisle: NoteAisle): NoteAisle => {
    const aisleBodyId = getAisleBodyId(aisle)
    const markdown = nextAisleBodiesById.get(aisleBodyId)?.markdown ?? normalizeMarkdownForPersistence(aisle.markdown)
    if (aisle.aisleBodyId === aisleBodyId && aisle.markdown === markdown) return aisle
    return { ...aisle, aisleBodyId, markdown }
  }

  const noteBodies = previous.noteBodies.map((body) => {
    const nextAisles = body.id === noteBodyId ? normalizedAisles : body.aisles
    const mirroredAisles = nextAisles.map(normalizeAisleMirror)
    const containsUpdatedAisleBody = mirroredAisles.some((aisle) => updatedAisleBodyIds.has(getAisleBodyId(aisle)))
    const bodyAislesChanged = getAisleSignature(body.aisles) !== getAisleSignature(mirroredAisles)
    if (!bodyAislesChanged && !containsUpdatedAisleBody) return body
    return {
      ...body,
      updatedAt: containsUpdatedAisleBody || body.id === noteBodyId || aislesChanged ? now : body.updatedAt,
      aisles: mirroredAisles,
    }
  })

  return syncNoteContentMirrors(previous, noteBodies, Array.from(nextAisleBodiesById.values()))
}

export const syncNoteBodyAisleStructureInState = (previous: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState => {
  const currentAisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const structuralAisles = aisles.map((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    return {
      ...aisle,
      aisleBodyId,
      markdown: currentAisleBodiesById.get(aisleBodyId)?.markdown ?? normalizeMarkdownForPersistence(aisle.markdown),
    }
  })
  return syncNoteBodyAislesInState(previous, noteBodyId, structuralAisles)
}

export const syncNoteAisleBodyMarkdownInState = (
  previous: AppState,
  aisleBodyId: string,
  markdown: string,
): AppState => {
  if (!aisleBodyId) return previous
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const now = createTimestamp()
  const nextAisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const existing = nextAisleBodiesById.get(aisleBodyId)
  const nextAisleBody =
    existing && existing.markdown === normalizedMarkdown
      ? existing
      : {
          ...(existing ?? { id: aisleBodyId, createdAt: now }),
          updatedAt: now,
          markdown: normalizedMarkdown,
        }
  nextAisleBodiesById.set(aisleBodyId, nextAisleBody)

  let changed = !existing || existing.markdown !== normalizedMarkdown
  const noteBodies = previous.noteBodies.map((body) => {
    let bodyChanged = false
    const aisles = body.aisles.map((aisle) => {
      if (getAisleBodyId(aisle) !== aisleBodyId) return aisle
      if (aisle.aisleBodyId === aisleBodyId && aisle.markdown === normalizedMarkdown) return aisle
      bodyChanged = true
      return { ...aisle, aisleBodyId, markdown: normalizedMarkdown }
    })
    if (!bodyChanged) return body
    changed = true
    return {
      ...body,
      updatedAt: now,
      aisles,
    }
  })

  return changed ? syncNoteContentMirrors(previous, noteBodies, Array.from(nextAisleBodiesById.values())) : previous
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
