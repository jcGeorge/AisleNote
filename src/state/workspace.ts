import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { clampAutoRemoveDays, DEFAULT_AUTO_REMOVE_DAYS } from '../settings/defaults'
import type { DeletedSubTabEntry, DeletedTabEntry, NoteAisle, NoteBody, Space, SubTab, Tab, WorkspaceData } from '../types/app'

export const MAX_NOTE_AISLES = 8

export function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createNoteAisle(markdown = ''): NoteAisle {
  return {
    id: createId(),
    markdown: normalizeMarkdownForPersistence(markdown),
  }
}

export function createNoteBody(markdown = ''): NoteBody {
  return {
    id: createId(),
    frontmatter: null,
    aisles: [createNoteAisle(markdown)],
  }
}

export function createSubTab(title = 'tab', content?: string): SubTab {
  return {
    id: createId(),
    title,
    noteBodyId: createId(),
    content: content ?? '',
  }
}

export function createTab(title = 'tab'): Tab {
  return {
    id: createId(),
    title,
    noteBodyId: createId(),
    homeContent: '',
    activeSubTabId: null,
    subTabs: [],
  }
}

export function createDefaultWorkspaceData(): WorkspaceData {
  const welcomeTabId = 'home-tab'
  return {
    activeTabId: welcomeTabId,
    tabs: [
      {
        id: welcomeTabId,
        title: 'Welcome',
        noteBodyId: createId(),
        homeContent:
          '- This is the hidden home note for this top-level tab.\n- Click this parent tab to edit this note.\n- Sub-tabs are separate notes and start empty.\n',
        activeSubTabId: null,
        subTabs: [createSubTab('Checklist', '1. Add parent tab\n2. Add sub-tab\n3. Each note keeps separate content\n')],
      },
    ],
    deletedTabs: [],
    deletedSubTabs: [],
  }
}

export function createSpace(name: string): Space {
  return {
    id: createId(),
    name,
    settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: createDefaultWorkspaceData(),
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

export function duplicateWorkspaceData(data: WorkspaceData): WorkspaceData {
  const liveTabIdMap = new Map<string, string>()

  const duplicatedTabs = data.tabs.map((tab) => {
    const nextTabId = createId()
    liveTabIdMap.set(tab.id, nextTabId)

    const subTabIdMap = new Map<string, string>()
      const duplicatedSubTabs = tab.subTabs.map((subTab) => {
        const nextSubTabId = createId()
        subTabIdMap.set(subTab.id, nextSubTabId)
        return {
          ...subTab,
          id: nextSubTabId,
          noteBodyId: createId(),
        }
      })

    return {
      ...tab,
      id: nextTabId,
      noteBodyId: createId(),
      activeSubTabId: tab.activeSubTabId ? subTabIdMap.get(tab.activeSubTabId) ?? null : null,
      subTabs: duplicatedSubTabs,
    }
  })

  const duplicatedDeletedTabs = data.deletedTabs.map((entry) => {
    const duplicatedTabId = createId()
    const deletedSubTabIdMap = new Map<string, string>()
    const duplicatedDeletedSubTabs = entry.tab.subTabs.map((subTab) => {
      const nextSubTabId = createId()
      deletedSubTabIdMap.set(subTab.id, nextSubTabId)
      return {
        ...subTab,
        id: nextSubTabId,
        noteBodyId: createId(),
      }
    })

    return {
      ...entry,
      id: createId(),
      tab: {
        ...entry.tab,
        id: duplicatedTabId,
        noteBodyId: createId(),
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
    const nextId = createId()
    orphanDeletedParentIdMap.set(parentTabId, nextId)
    return nextId
  }

  const duplicatedDeletedSubTabs = data.deletedSubTabs.map((entry) => ({
    ...entry,
    id: createId(),
    parentTabId: resolveDeletedSubParentId(entry.parentTabId),
    subTab: {
      ...entry.subTab,
      id: createId(),
      noteBodyId: createId(),
    },
  }))

  return createWorkspaceDataFromTabs(duplicatedTabs, {
    activeTabId: liveTabIdMap.get(data.activeTabId) ?? duplicatedTabs[0]?.id,
    deletedTabs: duplicatedDeletedTabs,
    deletedSubTabs: duplicatedDeletedSubTabs,
  })
}

export function duplicateSpace(source: Space, existingNames: string[]): Space {
  return {
    id: createId(),
    name: createDuplicateSpaceName(source.name, existingNames),
    settings: { ...source.settings },
    data: duplicateWorkspaceData(source.data),
  }
}

export function createWorkspaceDataFromTabs(
  tabs: Tab[],
  options?: {
    activeTabId?: string
    deletedTabs?: DeletedTabEntry[]
    deletedSubTabs?: DeletedSubTabEntry[]
  },
): WorkspaceData {
  const safeTabs = tabs.length > 0 ? tabs : [createTab('tab')]
  const requestedActiveTabId = options?.activeTabId ?? null
  const activeTabId = requestedActiveTabId && safeTabs.some((tab) => tab.id === requestedActiveTabId) ? requestedActiveTabId : safeTabs[0].id
  return {
    activeTabId,
    tabs: safeTabs.map((tab) => ({
      ...tab,
      noteBodyId: tab.noteBodyId || createId(),
      activeSubTabId: tab.activeSubTabId && tab.subTabs.some((subTab) => subTab.id === tab.activeSubTabId) ? tab.activeSubTabId : null,
      subTabs: tab.subTabs.map((subTab) => ({ ...subTab, noteBodyId: subTab.noteBodyId || createId() })),
    })),
    deletedTabs: options?.deletedTabs
      ? options.deletedTabs.map((entry) => ({
          ...entry,
          tab: {
            ...entry.tab,
            noteBodyId: entry.tab.noteBodyId || createId(),
            subTabs: entry.tab.subTabs.map((subTab) => ({ ...subTab, noteBodyId: subTab.noteBodyId || createId() })),
          },
        }))
      : [],
    deletedSubTabs: options?.deletedSubTabs
      ? options.deletedSubTabs.map((entry) => ({
          ...entry,
          subTab: { ...entry.subTab, noteBodyId: entry.subTab.noteBodyId || createId() },
        }))
      : [],
  }
}

export function applyAutoPurgeToWorkspace(data: WorkspaceData, autoRemoveDeletedDays: number): WorkspaceData {
  const cutoff = Date.now() - clampAutoRemoveDays(autoRemoveDeletedDays) * 24 * 60 * 60 * 1000
  const nextDeletedTabs = data.deletedTabs.filter((entry) => entry.deletedAt >= cutoff)
  const nextDeletedSubTabs = data.deletedSubTabs.filter((entry) => entry.deletedAt >= cutoff)
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
          content: typeof sub.content === 'string' ? sub.content : '',
          isHome: Boolean(sub.isHome),
        }))
      const legacyHome = normalizedSubTabs.find((sub) => sub.isHome)
      const visibleSubTabs = normalizedSubTabs
        .filter((sub) => !sub.isHome)
        .map(({ id, title, content }) => ({ id, title, content: normalizeMarkdownForPersistence(content) }))
      const explicitHome = typeof tabLike.homeContent === 'string' ? tabLike.homeContent : ''
      const homeContent = normalizeMarkdownForPersistence(explicitHome || legacyHome?.content || '')
      const rawActiveSubTabId = typeof tabLike.activeSubTabId === 'string' ? tabLike.activeSubTabId : null
      const activeSubTabId =
        rawActiveSubTabId && visibleSubTabs.some((sub) => sub.id === rawActiveSubTabId) ? rawActiveSubTabId : null
      return {
        id: tabId,
        title: tabTitle,
        noteBodyId: typeof tabLike.noteBodyId === 'string' && tabLike.noteBodyId ? tabLike.noteBodyId : createId(),
        homeContent,
        activeSubTabId,
        subTabs: visibleSubTabs.map((subTab) => ({
          ...subTab,
          noteBodyId: normalizedSubTabs.find((candidate) => candidate.id === subTab.id)?.noteBodyId ?? createId(),
        })),
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
      const homeContent = normalizeMarkdownForPersistence(typeof maybeTab.homeContent === 'string' ? maybeTab.homeContent : '')
      const rawSubTabs = Array.isArray(maybeTab.subTabs) ? maybeTab.subTabs : []
      const subTabs: SubTab[] = rawSubTabs
        .filter((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object')
        .map((sub, subIndex) => ({
          id: typeof sub.id === 'string' ? sub.id : `${id}-sub-${subIndex}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `Note ${subIndex + 1}`,
          noteBodyId: typeof sub.noteBodyId === 'string' && sub.noteBodyId ? sub.noteBodyId : createId(),
          content: normalizeMarkdownForPersistence(typeof sub.content === 'string' ? sub.content : ''),
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
          homeContent,
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
          content: normalizeMarkdownForPersistence(typeof sub.content === 'string' ? sub.content : ''),
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
