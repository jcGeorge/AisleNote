import { clampAutoRemoveDays, DEFAULT_AUTO_REMOVE_DAYS } from '../settings/defaults'
import { extractMarkdownTags } from '../tags/tags.js'
import type { DeletedSubTabEntry, DeletedTabEntry, NoteAisle, NoteAisleBody, NoteBody, Space, SubTab, Tab, WorkspaceData } from '../types/app'
import { createRandomId, type IdGenerator } from './navigation-ids'

export const MAX_NOTE_AISLES = 8
export const AUTO_PURGE_DAY_MS = 24 * 60 * 60 * 1000

export function createId() {
  return createRandomId()
}

export function createTimestamp(now = new Date()) {
  return now.toISOString()
}

export function createNoteAisle(generateId: IdGenerator = createId): NoteAisle {
  const aisleBodyId = generateId()
  return {
    id: generateId(),
    aisleBodyId,
  }
}

export function createNoteBodyContent(markdown = '', generateId: IdGenerator = createId): { noteBody: NoteBody; aisleBody: NoteAisleBody } {
  const timestamp = createTimestamp()
  const aisleBodyId = generateId()
  return {
    noteBody: {
      id: generateId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles: [{ id: generateId(), aisleBodyId }],
    },
    aisleBody: {
      id: aisleBodyId,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown,
      tags: extractMarkdownTags(markdown),
      frontmatter: null,
      frontmatterStatus: 'none',
    },
  }
}

export function createNoteBody(generateId: IdGenerator = createId): NoteBody {
  return createNoteBodyContent('', generateId).noteBody
}

export function createSubTab(title = 'tab', generateId: IdGenerator = createId): SubTab {
  return {
    id: generateId(),
    title,
    noteBodyId: generateId(),
  }
}

export function createTab(title = 'tab', generateId: IdGenerator = createId): Tab {
  return {
    id: generateId(),
    title,
    noteBodyId: generateId(),
    activeSubTabId: null,
    subTabs: [],
  }
}

export function createDefaultWorkspaceData(generateId: IdGenerator = createId): WorkspaceData {
  const welcomeTabId = generateId()
  return {
    activeTabId: welcomeTabId,
    tabs: [
      {
        id: welcomeTabId,
        title: 'welcome',
        noteBodyId: generateId(),
        activeSubTabId: null,
        subTabs: [createSubTab('list', generateId)],
      },
    ],
    deletedTabs: [],
    deletedSubTabs: [],
  }
}

export function createEmptyWorkspaceData(generateId: IdGenerator = createId): WorkspaceData {
  return createWorkspaceDataFromTabs([], { createId: generateId })
}

export function createSpace(name: string, generateId: IdGenerator = createId): Space {
  return {
    id: generateId(),
    name,
    settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: createEmptyWorkspaceData(generateId),
  }
}

export function createDuplicateSpaceName(name: string, existingNames: string[]): string {
  const baseName = `${name} copy`
  if (!existingNames.includes(baseName)) return baseName

  let suffix = 2
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix += 1
  }
  return `${baseName} ${suffix}`
}

export function duplicateWorkspaceData(data: WorkspaceData, generateId: IdGenerator = createId): WorkspaceData {
  const liveTabIdMap = new Map<string, string>()

  const duplicatedTabs = data.tabs.map((tab) => {
    const nextTabId = generateId()
    liveTabIdMap.set(tab.id, nextTabId)

    const subTabIdMap = new Map<string, string>()
    const duplicatedSubTabs = tab.subTabs.map((subTab) => {
      const nextSubTabId = generateId()
      subTabIdMap.set(subTab.id, nextSubTabId)
      return {
        ...subTab,
        id: nextSubTabId,
        noteBodyId: generateId(),
      }
    })

    return {
      ...tab,
      id: nextTabId,
      noteBodyId: generateId(),
      activeSubTabId: tab.activeSubTabId ? subTabIdMap.get(tab.activeSubTabId) ?? null : null,
      subTabs: duplicatedSubTabs,
    }
  })

  const duplicatedDeletedTabs = data.deletedTabs.map((entry) => {
    const duplicatedTabId = generateId()
    const deletedSubTabIdMap = new Map<string, string>()
    const duplicatedDeletedSubTabs = entry.tab.subTabs.map((subTab) => {
      const nextSubTabId = generateId()
      deletedSubTabIdMap.set(subTab.id, nextSubTabId)
      return {
        ...subTab,
        id: nextSubTabId,
        noteBodyId: generateId(),
      }
    })

    return {
      ...entry,
      id: generateId(),
      tab: {
        ...entry.tab,
        id: duplicatedTabId,
        noteBodyId: generateId(),
        activeSubTabId: entry.tab.activeSubTabId ? deletedSubTabIdMap.get(entry.tab.activeSubTabId) ?? null : null,
        subTabs: duplicatedDeletedSubTabs,
      },
    }
  })

  const orphanDeletedParentIdMap = new Map<string, string>()
  const resolveDeletedSubParentId = (parentTabId: string) => {
    const liveMatch = liveTabIdMap.get(parentTabId)
    if (liveMatch) return liveMatch
    const existing = orphanDeletedParentIdMap.get(parentTabId)
    if (existing) return existing
    const nextId = generateId()
    orphanDeletedParentIdMap.set(parentTabId, nextId)
    return nextId
  }

  const duplicatedDeletedSubTabs = data.deletedSubTabs.map((entry) => ({
    ...entry,
    id: generateId(),
    parentTabId: resolveDeletedSubParentId(entry.parentTabId),
    subTab: {
      ...entry.subTab,
      id: generateId(),
      noteBodyId: generateId(),
    },
  }))

  return createWorkspaceDataFromTabs(duplicatedTabs, {
    activeTabId: liveTabIdMap.get(data.activeTabId) ?? duplicatedTabs[0]?.id,
    deletedTabs: duplicatedDeletedTabs,
    deletedSubTabs: duplicatedDeletedSubTabs,
    createId: generateId,
  })
}

export function duplicateSpace(source: Space, existingNames: string[], generateId: IdGenerator = createId): Space {
  return {
    id: generateId(),
    name: createDuplicateSpaceName(source.name, existingNames),
    settings: { ...source.settings },
    data: duplicateWorkspaceData(source.data, generateId),
  }
}

export function createWorkspaceDataFromTabs(
  tabs: Tab[],
  options?: {
    activeTabId?: string
    deletedTabs?: DeletedTabEntry[]
    deletedSubTabs?: DeletedSubTabEntry[]
    createId?: IdGenerator
  },
): WorkspaceData {
  const generateId = options?.createId ?? createId
  const safeTabs = tabs.length > 0 ? tabs : [createTab('tab', generateId)]
  const requestedActiveTabId = options?.activeTabId ?? null
  const activeTabId = requestedActiveTabId && safeTabs.some((tab) => tab.id === requestedActiveTabId) ? requestedActiveTabId : safeTabs[0].id
  return {
    activeTabId,
    tabs: safeTabs.map((tab) => ({
      ...tab,
      noteBodyId: tab.noteBodyId || generateId(),
      activeSubTabId: tab.activeSubTabId && tab.subTabs.some((subTab) => subTab.id === tab.activeSubTabId) ? tab.activeSubTabId : null,
      subTabs: tab.subTabs.map((subTab) => ({ ...subTab, noteBodyId: subTab.noteBodyId || generateId() })),
    })),
    deletedTabs: options?.deletedTabs
      ? options.deletedTabs.map((entry) => ({
          ...entry,
          tab: {
            ...entry.tab,
            noteBodyId: entry.tab.noteBodyId || generateId(),
            subTabs: entry.tab.subTabs.map((subTab) => ({ ...subTab, noteBodyId: subTab.noteBodyId || generateId() })),
          },
        }))
      : [],
    deletedSubTabs: options?.deletedSubTabs
      ? options.deletedSubTabs.map((entry) => ({
          ...entry,
          subTab: { ...entry.subTab, noteBodyId: entry.subTab.noteBodyId || generateId() },
        }))
      : [],
  }
}

export function getWorkspaceTrashAutoPurgeCutoff(autoRemoveDeletedDays: number, now = Date.now()): number {
  return now - clampAutoRemoveDays(autoRemoveDeletedDays) * AUTO_PURGE_DAY_MS
}

export function getNextWorkspaceTrashAutoPurgeTime(
  data: WorkspaceData,
  autoRemoveDeletedDays: number,
  now = Date.now(),
): number | null {
  const retentionMs = clampAutoRemoveDays(autoRemoveDeletedDays) * AUTO_PURGE_DAY_MS
  let nextPurgeAt: number | null = null

  const visitDeletedAt = (deletedAt: number) => {
    if (!Number.isFinite(deletedAt)) return
    const purgeAt = deletedAt + retentionMs
    if (purgeAt <= now) {
      nextPurgeAt = now
      return
    }
    if (nextPurgeAt === null || purgeAt < nextPurgeAt) {
      nextPurgeAt = purgeAt
    }
  }

  data.deletedTabs.forEach((entry) => visitDeletedAt(entry.deletedAt))
  data.deletedSubTabs.forEach((entry) => visitDeletedAt(entry.deletedAt))

  return nextPurgeAt
}

export function applyAutoPurgeToWorkspace(
  data: WorkspaceData,
  autoRemoveDeletedDays: number,
  now = Date.now(),
): WorkspaceData {
  const cutoff = getWorkspaceTrashAutoPurgeCutoff(autoRemoveDeletedDays, now)
  const nextDeletedTabs = data.deletedTabs.filter((entry) => entry.deletedAt > cutoff)
  const nextDeletedSubTabs = data.deletedSubTabs.filter((entry) => entry.deletedAt > cutoff)
  if (nextDeletedTabs.length === data.deletedTabs.length && nextDeletedSubTabs.length === data.deletedSubTabs.length) {
    return data
  }
  return {
    ...data,
    deletedTabs: nextDeletedTabs,
    deletedSubTabs: nextDeletedSubTabs,
  }
}

export function normalizeWorkspaceData(raw: unknown): WorkspaceData {
  const fallback = createDefaultWorkspaceData()
  if (!raw || typeof raw !== 'object') return fallback

  const obj = raw as Record<string, unknown>
  const rawTabs = Array.isArray(obj.tabs) ? obj.tabs : []
  const tabs: Tab[] = rawTabs
    .map((rawTab, index) => {
      if (!rawTab || typeof rawTab !== 'object') return null
      const tabLike = rawTab as Record<string, unknown>
      const tabId = typeof tabLike.id === 'string' ? tabLike.id : `tab-${index}-${createId()}`
      const tabTitle = typeof tabLike.title === 'string' && tabLike.title.trim() ? tabLike.title : `Tab ${index + 1}`
      const rawSubTabs = Array.isArray(tabLike.subTabs) ? tabLike.subTabs : []
      const normalizedSubTabs: Array<SubTab & { isHome: boolean }> = rawSubTabs
        .filter((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object')
        .map((sub, subIndex) => ({
          id: typeof sub.id === 'string' ? sub.id : `${tabId}-sub-${subIndex}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `Note ${subIndex + 1}`,
          noteBodyId: typeof sub.noteBodyId === 'string' && sub.noteBodyId ? sub.noteBodyId : createId(),
          isHome: Boolean(sub.isHome),
        }))
      const visibleSubTabs = normalizedSubTabs
        .filter((sub) => !sub.isHome)
        .map(({ id, title, noteBodyId }) => ({ id, title, noteBodyId }))
      const rawActiveSubTabId = typeof tabLike.activeSubTabId === 'string' ? tabLike.activeSubTabId : null
      const activeSubTabId =
        rawActiveSubTabId && visibleSubTabs.some((sub) => sub.id === rawActiveSubTabId) ? rawActiveSubTabId : null
      return {
        id: tabId,
        title: tabTitle,
        noteBodyId: typeof tabLike.noteBodyId === 'string' && tabLike.noteBodyId ? tabLike.noteBodyId : createId(),
        activeSubTabId,
        subTabs: visibleSubTabs,
      }
    })
    .filter((tab): tab is Tab => tab !== null)

  const safeTabs = tabs.length > 0 ? tabs : fallback.tabs
  const rawActiveTabId = typeof obj.activeTabId === 'string' ? obj.activeTabId : null
  const activeTabId = rawActiveTabId && safeTabs.some((tab) => tab.id === rawActiveTabId) ? rawActiveTabId : safeTabs[0].id

  const rawDeletedTabs = Array.isArray(obj.deletedTabs) ? obj.deletedTabs : []
  const deletedTabs: DeletedTabEntry[] = rawDeletedTabs
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      // Backward compatibility:
      // old shape: deletedTabs: Tab[]
      // new shape: deletedTabs: { id, tab, deletedAt }[]
      const maybeTab = entry.tab && typeof entry.tab === 'object' ? (entry.tab as Record<string, unknown>) : entry
      const id = typeof entry.id === 'string' ? entry.id : `deleted-tab-${index}-${createId()}`
      const title = typeof maybeTab.title === 'string' && maybeTab.title.trim() ? maybeTab.title : `deleted tab ${index + 1}`
      const rawSubTabs = Array.isArray(maybeTab.subTabs) ? maybeTab.subTabs : []
      const subTabs: SubTab[] = rawSubTabs
        .filter((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object')
        .map((sub, subIndex) => ({
          id: typeof sub.id === 'string' ? sub.id : `${id}-sub-${subIndex}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `Note ${subIndex + 1}`,
          noteBodyId: typeof sub.noteBodyId === 'string' && sub.noteBodyId ? sub.noteBodyId : createId(),
        }))
      const rawDeletedActive = typeof maybeTab.activeSubTabId === 'string' ? maybeTab.activeSubTabId : null
      const activeSubTabId = rawDeletedActive && subTabs.some((sub) => sub.id === rawDeletedActive) ? rawDeletedActive : null
      const tabId = typeof maybeTab.id === 'string' ? maybeTab.id : `deleted-tab-inner-${index}-${createId()}`
      const deletedAt =
        typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now()
      return {
        id,
        deletedAt,
        tab: {
          id: tabId,
          title,
          noteBodyId: typeof maybeTab.noteBodyId === 'string' && maybeTab.noteBodyId ? maybeTab.noteBodyId : createId(),
          activeSubTabId,
          subTabs,
        },
      }
    })

  const rawDeletedSubTabs = Array.isArray(obj.deletedSubTabs) ? obj.deletedSubTabs : []
  const deletedSubTabs: DeletedSubTabEntry[] = rawDeletedSubTabs
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      const sub = entry.subTab && typeof entry.subTab === 'object' ? (entry.subTab as Record<string, unknown>) : {}
      return {
        id: typeof entry.id === 'string' ? entry.id : `deleted-subtab-${index}-${createId()}`,
        parentTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : `unknown-parent-${index}`,
        parentTabTitle:
          typeof entry.parentTabTitle === 'string' && entry.parentTabTitle.trim() ? entry.parentTabTitle : 'Unknown Tab',
        deletedAt:
          typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now(),
        subTab: {
          id: typeof sub.id === 'string' ? sub.id : `deleted-note-${index}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `deleted note ${index + 1}`,
          noteBodyId: typeof sub.noteBodyId === 'string' && sub.noteBodyId ? sub.noteBodyId : createId(),
        },
      }
    })

  return {
    activeTabId,
    tabs: safeTabs,
    deletedTabs,
    deletedSubTabs,
  }
}
