import type {
  AppState,
  DeletedVaultItem,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  VaultFolder,
  VaultNote,
  VaultState,
  VaultTab,
  VaultTabStatus,
  VaultTreeItem,
  TabSortMode,
} from '../types/app'
import { cloneNoteBodyAsIndependentCopy } from '../notes/aisle-body-state'
import { createRandomId, createReservedIdAllocator, type IdGenerator } from './navigation-ids'

export type VaultItemPathSegment = {
  id: string
  title: string
  type: VaultTreeItem['type'] | 'root'
}

export type VaultNotePath = {
  note: VaultNote
  parentFolderId: string | null
  path: VaultItemPathSegment[]
}

type WalkContext = {
  parentFolderId: string | null
  index: number
  path: VaultItemPathSegment[]
}

export type VaultWalkEntry = WalkContext & {
  item: VaultTreeItem
}

export type CreatedVaultNote = {
  state: AppState
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
}

export type CreatedVaultFolder = {
  state: AppState
  folderId: string
}

export type VaultTabOpenDisposition = VaultTabStatus | 'preserve'

export type ClosedVaultTab = VaultTab & {
  index: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function ensureTitle(title: string, fallback: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export function createVaultNote(title: string, noteBodyId: string, idGenerator: IdGenerator = createRandomId): VaultNote {
  return {
    type: 'note',
    id: idGenerator(),
    title: ensureTitle(title, 'Untitled'),
    noteBodyId,
  }
}

export function createVaultFolder(
  title: string,
  children: VaultTreeItem[] = [],
  idGenerator: IdGenerator = createRandomId,
): VaultFolder {
  return {
    type: 'folder',
    id: idGenerator(),
    title: ensureTitle(title, 'Untitled folder'),
    children,
  }
}

export function createNoteAisle(aisleBodyId: string, idGenerator: IdGenerator = createRandomId): NoteAisle {
  return {
    id: idGenerator(),
    aisleBodyId,
  }
}

export function createNoteBodyWithAisle(
  markdown = '',
  idGenerator: IdGenerator = createRandomId,
): {
  noteBody: NoteBody
  aisleBody: NoteAisleBody
  aisleId: string
  aisleBodyId: string
} {
  const createdAt = nowIso()
  const noteBodyId = idGenerator()
  const aisleBodyId = idGenerator()
  const aisle = createNoteAisle(aisleBodyId, idGenerator)
  return {
    noteBody: {
      id: noteBodyId,
      createdAt,
      updatedAt: createdAt,
      aisles: [aisle],
    },
    aisleBody: {
      id: aisleBodyId,
      createdAt,
      updatedAt: createdAt,
      markdown,
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'none',
    },
    aisleId: aisle.id,
    aisleBodyId,
  }
}

export function createDefaultVaultState(idGenerator: IdGenerator = createRandomId): {
  vault: VaultState
  noteBodies: NoteBody[]
  noteAisleBodies: NoteAisleBody[]
} {
  const { noteBody, aisleBody } = createNoteBodyWithAisle('', idGenerator)
  const note = createVaultNote('Welcome', noteBody.id, idGenerator)
  return {
    vault: {
      activeNoteId: note.id,
      openTabs: [{ noteId: note.id, status: 'temporary' }],
      items: [note],
      deletedItems: [],
      settings: {
        autoRemoveDeletedDays: 7,
      },
    },
    noteBodies: [noteBody],
    noteAisleBodies: [aisleBody],
  }
}

export function walkVaultItems(
  items: VaultTreeItem[],
  visitor: (entry: VaultWalkEntry) => void | false,
  context: Omit<WalkContext, 'index'> = { parentFolderId: null, path: [] },
): false | void {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const path = [...context.path, { id: item.id, title: item.title, type: item.type }]
    const result = visitor({
      item,
      parentFolderId: context.parentFolderId,
      index,
      path,
    })
    if (result === false) return false
    if (item.type === 'folder') {
      const childResult = walkVaultItems(item.children, visitor, {
        parentFolderId: item.id,
        path,
      })
      if (childResult === false) return false
    }
  }
}

export function listVaultNotes(items: VaultTreeItem[]): VaultNotePath[] {
  const notes: VaultNotePath[] = []
  walkVaultItems(items, ({ item, parentFolderId, path }) => {
    if (item.type === 'note') {
      notes.push({
        note: item,
        parentFolderId,
        path,
      })
    }
  })
  return notes
}

export function listVaultFolders(items: VaultTreeItem[]): Array<{ folder: VaultFolder; path: VaultItemPathSegment[] }> {
  const folders: Array<{ folder: VaultFolder; path: VaultItemPathSegment[] }> = []
  walkVaultItems(items, ({ item, path }) => {
    if (item.type === 'folder') folders.push({ folder: item, path })
  })
  return folders
}

export function findVaultItem(items: VaultTreeItem[], itemId: string): VaultWalkEntry | null {
  let found: VaultWalkEntry | null = null
  walkVaultItems(items, (entry) => {
    if (entry.item.id === itemId) {
      found = entry
      return false
    }
    return undefined
  })
  return found
}

export function findVaultNote(items: VaultTreeItem[], noteId: string): VaultNotePath | null {
  const entry = findVaultItem(items, noteId)
  if (!entry || entry.item.type !== 'note') return null
  return {
    note: entry.item,
    parentFolderId: entry.parentFolderId,
    path: entry.path,
  }
}

export function findVaultFolder(
  items: VaultTreeItem[],
  folderId: string,
): { folder: VaultFolder; parentFolderId: string | null; path: VaultItemPathSegment[] } | null {
  const entry = findVaultItem(items, folderId)
  if (!entry || entry.item.type !== 'folder') return null
  return {
    folder: entry.item,
    parentFolderId: entry.parentFolderId,
    path: entry.path,
  }
}

export function getFirstVaultNote(items: VaultTreeItem[]): VaultNote | null {
  let first: VaultNote | null = null
  walkVaultItems(items, ({ item }) => {
    if (item.type === 'note') {
      first = item
      return false
    }
    return undefined
  })
  return first
}

export function getVaultNoteIdSet(items: VaultTreeItem[]): Set<string> {
  const noteIds = new Set<string>()
  walkVaultItems(items, ({ item }) => {
    if (item.type === 'note') noteIds.add(item.id)
  })
  return noteIds
}

function normalizeVaultTabStatus(status: unknown): VaultTabStatus {
  return status === 'retained' ? 'retained' : 'temporary'
}

function isVaultTabRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeVaultTabsForItems(
  rawTabs: unknown,
  items: VaultTreeItem[],
  activeNoteId = '',
): VaultTab[] {
  const noteIds = getVaultNoteIdSet(items)
  const tabs: VaultTab[] = []
  const tabNoteIds = new Set<string>()
  let hasTemporaryTab = false

  if (Array.isArray(rawTabs)) {
    rawTabs.forEach((rawTab) => {
      if (!isVaultTabRecord(rawTab)) return
      const noteId = typeof rawTab.noteId === 'string' ? rawTab.noteId.trim() : ''
      if (!noteId || !noteIds.has(noteId) || tabNoteIds.has(noteId)) return
      const status = normalizeVaultTabStatus(rawTab.status)
      if (status === 'temporary') {
        if (hasTemporaryTab) return
        hasTemporaryTab = true
      }
      tabs.push({ noteId, status })
      tabNoteIds.add(noteId)
    })
  }

  const fallbackNoteId = noteIds.has(activeNoteId) ? activeNoteId : getFirstVaultNote(items)?.id ?? ''
  if (!fallbackNoteId) return tabs

  if (!tabNoteIds.has(fallbackNoteId)) {
    const temporaryIndex = tabs.findIndex((tab) => tab.status === 'temporary')
    const fallbackTab: VaultTab = { noteId: fallbackNoteId, status: 'temporary' }
    if (temporaryIndex >= 0) {
      tabNoteIds.delete(tabs[temporaryIndex]?.noteId ?? '')
      tabs[temporaryIndex] = fallbackTab
    } else {
      tabs.push(fallbackTab)
    }
  }

  return tabs
}

function vaultTabsEqual(left: readonly VaultTab[] | undefined, right: readonly VaultTab[]): boolean {
  if (!left || left.length !== right.length) return false
  return left.every((tab, index) => tab.noteId === right[index]?.noteId && tab.status === right[index]?.status)
}

export function normalizeVaultOpenTabs(vault: VaultState): VaultState {
  const openTabs = normalizeVaultTabsForItems(vault.openTabs, vault.items, vault.activeNoteId)
  return vaultTabsEqual(vault.openTabs, openTabs) ? vault : { ...vault, openTabs }
}

function setVaultActiveTab(vault: VaultState, noteId: string, disposition: VaultTabOpenDisposition): VaultState {
  const notePath = findVaultNote(vault.items, noteId)
  if (!notePath) return normalizeVaultOpenTabs(vault)

  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = [...(normalized.openTabs ?? [])]
  const existingIndex = openTabs.findIndex((tab) => tab.noteId === noteId)

  if (existingIndex >= 0) {
    if (disposition === 'retained' && openTabs[existingIndex]?.status === 'temporary') {
      openTabs[existingIndex] = { noteId, status: 'retained' }
    }
    return normalizeVaultOpenTabs({
      ...normalized,
      activeNoteId: noteId,
      openTabs,
    })
  }

  if (disposition === 'preserve') {
    return normalizeVaultOpenTabs({
      ...normalized,
      activeNoteId: noteId,
    })
  }

  if (disposition === 'temporary') {
    const temporaryIndex = openTabs.findIndex((tab) => tab.status === 'temporary')
    const temporaryTab: VaultTab = { noteId, status: 'temporary' }
    if (temporaryIndex >= 0) openTabs[temporaryIndex] = temporaryTab
    else openTabs.push(temporaryTab)
  } else {
    openTabs.push({ noteId, status: 'retained' })
  }

  return normalizeVaultOpenTabs({
    ...normalized,
    activeNoteId: noteId,
    openTabs,
  })
}

export function openVaultTemporaryTab(vault: VaultState, noteId: string): VaultState {
  return setVaultActiveTab(vault, noteId, 'temporary')
}

export function openVaultRetainedTab(vault: VaultState, noteId: string): VaultState {
  return setVaultActiveTab(vault, noteId, 'retained')
}

export function focusVaultOpenTab(vault: VaultState, noteId: string): VaultState {
  return setVaultActiveTab(vault, noteId, 'preserve')
}

export function promoteVaultTemporaryTab(vault: VaultState, noteId: string): VaultState {
  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = (normalized.openTabs ?? []).map((tab) =>
    tab.noteId === noteId && tab.status === 'temporary'
      ? { ...tab, status: 'retained' as const }
      : tab,
  )
  return vaultTabsEqual(normalized.openTabs, openTabs) ? normalized : { ...normalized, openTabs }
}

export function getVaultRetainedTabCycleTarget(vault: VaultState, direction: -1 | 1): string {
  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = normalized.openTabs ?? []
  const retainedTabs = openTabs
    .map((tab, index) => ({ ...tab, index }))
    .filter((tab) => tab.status === 'retained')
  if (retainedTabs.length === 0) return ''

  const activeRetainedIndex = retainedTabs.findIndex((tab) => tab.noteId === normalized.activeNoteId)
  if (activeRetainedIndex >= 0) {
    const nextIndex = (activeRetainedIndex + direction + retainedTabs.length) % retainedTabs.length
    return retainedTabs[nextIndex]?.noteId ?? ''
  }

  const activeTabIndex = openTabs.findIndex((tab) => tab.noteId === normalized.activeNoteId)
  const safeActiveIndex = activeTabIndex >= 0 ? activeTabIndex : direction > 0 ? -1 : openTabs.length
  const target = direction > 0
    ? retainedTabs.find((tab) => tab.index > safeActiveIndex) ?? retainedTabs[0]
    : [...retainedTabs].reverse().find((tab) => tab.index < safeActiveIndex) ?? retainedTabs[retainedTabs.length - 1]
  return target?.noteId ?? ''
}

export function getClosedVaultTab(vault: VaultState, noteId: string): ClosedVaultTab | null {
  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = normalized.openTabs ?? []
  const index = openTabs.findIndex((tab) => tab.noteId === noteId)
  const tab = openTabs[index]
  return tab ? { ...tab, index } : null
}

export function restoreClosedVaultTab(vault: VaultState, closedTab: ClosedVaultTab): VaultState {
  if (!findVaultNote(vault.items, closedTab.noteId)) return normalizeVaultOpenTabs(vault)

  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = [...(normalized.openTabs ?? [])]
  const existingIndex = openTabs.findIndex((tab) => tab.noteId === closedTab.noteId)
  if (existingIndex >= 0) {
    if (closedTab.status === 'retained' && openTabs[existingIndex]?.status === 'temporary') {
      openTabs[existingIndex] = { noteId: closedTab.noteId, status: 'retained' }
    }
    return normalizeVaultOpenTabs({
      ...normalized,
      activeNoteId: closedTab.noteId,
      openTabs,
    })
  }

  const nextOpenTabs = closedTab.status === 'temporary'
    ? openTabs.filter((tab) => tab.status !== 'temporary')
    : openTabs
  const boundedIndex = Math.max(0, Math.min(closedTab.index, nextOpenTabs.length))
  nextOpenTabs.splice(boundedIndex, 0, { noteId: closedTab.noteId, status: closedTab.status })

  return normalizeVaultOpenTabs({
    ...normalized,
    activeNoteId: closedTab.noteId,
    openTabs: nextOpenTabs,
  })
}

export function closeVaultTab(vault: VaultState, noteId: string): VaultState {
  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = normalized.openTabs ?? []
  const closingIndex = openTabs.findIndex((tab) => tab.noteId === noteId)
  if (closingIndex < 0) return normalized

  const nextOpenTabs = openTabs.filter((tab) => tab.noteId !== noteId)
  if (normalized.activeNoteId !== noteId) {
    return normalizeVaultOpenTabs({
      ...normalized,
      openTabs: nextOpenTabs,
    })
  }

  const nextActiveTab = nextOpenTabs[closingIndex] ?? nextOpenTabs[closingIndex - 1] ?? null
  if (nextActiveTab) {
    return normalizeVaultOpenTabs({
      ...normalized,
      activeNoteId: nextActiveTab.noteId,
      openTabs: nextOpenTabs,
    })
  }

  const fallbackNoteId = getFirstVaultNote(normalized.items)?.id ?? ''
  return normalizeVaultOpenTabs({
    ...normalized,
    activeNoteId: fallbackNoteId,
    openTabs: fallbackNoteId ? [{ noteId: fallbackNoteId, status: 'temporary' }] : [],
  })
}

export function reorderVaultTabs(vault: VaultState, sourceNoteId: string, targetIndex: number): VaultState {
  const normalized = normalizeVaultOpenTabs(vault)
  const openTabs = [...(normalized.openTabs ?? [])]
  const sourceIndex = openTabs.findIndex((tab) => tab.noteId === sourceNoteId)
  if (sourceIndex < 0) return normalized
  const [tab] = openTabs.splice(sourceIndex, 1)
  if (!tab) return normalized
  const boundedIndex = Math.max(0, Math.min(targetIndex, openTabs.length))
  openTabs.splice(boundedIndex, 0, tab)
  return vaultTabsEqual(normalized.openTabs, openTabs) ? normalized : { ...normalized, openTabs }
}

export function getContainingFolderId(items: VaultTreeItem[], itemId: string): string | null {
  const entry = findVaultItem(items, itemId)
  return entry?.parentFolderId ?? null
}

export function getVaultNoteFolderPath(items: VaultTreeItem[], noteId: string): VaultItemPathSegment[] {
  const notePath = findVaultNote(items, noteId)
  if (!notePath) return []
  return notePath.path.slice(0, -1)
}

export function getVaultNotePathLabel(items: VaultTreeItem[], noteId: string): string {
  const notePath = findVaultNote(items, noteId)
  if (!notePath) return ''
  return notePath.path.map((segment) => segment.title).join('/')
}

export function getVaultFolderPathLabel(items: VaultTreeItem[], folderId: string | null): string {
  if (!folderId) return ''
  const folder = findVaultFolder(items, folderId)
  if (!folder) return ''
  return folder.path.map((segment) => segment.title).join('/')
}

export function ensureValidActiveNote(vault: VaultState): VaultState {
  if (findVaultNote(vault.items, vault.activeNoteId)) return normalizeVaultOpenTabs(vault)
  const firstNote = getFirstVaultNote(vault.items)
  if (firstNote) {
    return normalizeVaultOpenTabs({
      ...vault,
      activeNoteId: firstNote.id,
    })
  }
  return normalizeVaultOpenTabs({
    ...vault,
    activeNoteId: '',
  })
}

function updateFolderChildren(
  items: VaultTreeItem[],
  folderId: string | null,
  updater: (children: VaultTreeItem[]) => VaultTreeItem[],
): { items: VaultTreeItem[]; changed: boolean } {
  if (folderId === null) {
    return { items: updater(items), changed: true }
  }

  let changed = false
  const nextItems = items.map((item) => {
    if (item.type !== 'folder') return item
    if (item.id === folderId) {
      changed = true
      return {
        ...item,
        children: updater(item.children),
      }
    }
    const childResult = updateFolderChildren(item.children, folderId, updater)
    if (!childResult.changed) return item
    changed = true
    return {
      ...item,
      children: childResult.items,
    }
  })

  return { items: nextItems, changed }
}

const VAULT_ITEM_TITLE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

type VaultSortDirection = 'asc' | 'desc'
type VaultDateSortField = 'createdAt' | 'updatedAt'
type VaultSortDescriptor =
  | { kind: 'title'; direction: VaultSortDirection }
  | { kind: 'date'; direction: VaultSortDirection; field: VaultDateSortField }

function getVaultSortDescriptor(sortMode: TabSortMode): VaultSortDescriptor {
  switch (sortMode) {
    case 'alpha-asc':
      return { kind: 'title', direction: 'asc' }
    case 'alpha-desc':
      return { kind: 'title', direction: 'desc' }
    case 'created-asc':
      return { kind: 'date', direction: 'asc', field: 'createdAt' }
    case 'created-desc':
      return { kind: 'date', direction: 'desc', field: 'createdAt' }
    case 'updated-asc':
      return { kind: 'date', direction: 'asc', field: 'updatedAt' }
    case 'updated-desc':
      return { kind: 'date', direction: 'desc', field: 'updatedAt' }
  }
}

function normalizeVaultSortTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getVaultItemDateSortValue(
  item: VaultTreeItem,
  field: VaultDateSortField,
  noteBodiesById: Map<string, NoteBody>,
): number | null {
  if (item.type === 'note') {
    return normalizeVaultSortTimestamp(noteBodiesById.get(item.noteBodyId)?.[field])
  }

  let folderTimestamp: number | null = null
  walkVaultItems(item.children, ({ item: child }) => {
    if (child.type !== 'note') return undefined
    const childTimestamp = normalizeVaultSortTimestamp(noteBodiesById.get(child.noteBodyId)?.[field])
    if (childTimestamp === null) return undefined
    if (folderTimestamp === null) {
      folderTimestamp = childTimestamp
      return undefined
    }
    folderTimestamp = field === 'createdAt'
      ? Math.min(folderTimestamp, childTimestamp)
      : Math.max(folderTimestamp, childTimestamp)
    return undefined
  })
  return folderTimestamp
}

function sortVaultSiblingItems(
  items: VaultTreeItem[],
  sortMode: TabSortMode,
  noteBodiesById: Map<string, NoteBody>,
): VaultTreeItem[] {
  const descriptor = getVaultSortDescriptor(sortMode)
  const sortedItems = items
    .map((item, index) => ({
      item,
      index,
      dateValue: descriptor.kind === 'date'
        ? getVaultItemDateSortValue(item, descriptor.field, noteBodiesById)
        : null,
    }))
    .sort((left, right) => {
      let comparison: number
      if (descriptor.kind === 'title') {
        comparison = VAULT_ITEM_TITLE_COLLATOR.compare(left.item.title, right.item.title)
        if (descriptor.direction === 'desc') comparison *= -1
      } else {
        const leftDateValue = left.dateValue
        const rightDateValue = right.dateValue
        const leftMissing = leftDateValue === null
        const rightMissing = rightDateValue === null
        if (leftMissing || rightMissing) {
          comparison = leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1
        } else {
          comparison = leftDateValue - rightDateValue
          if (descriptor.direction === 'desc') comparison *= -1
        }
      }
      return comparison || left.index - right.index
    })
    .map(({ item }) => item)

  return sortedItems.every((item, index) => item === items[index]) ? items : sortedItems
}

export function sortVaultItemsInScope(
  vault: VaultState,
  parentFolderId: string | null,
  sortMode: TabSortMode,
  noteBodies: NoteBody[],
): VaultState {
  const noteBodiesById = new Map(noteBodies.map((body) => [body.id, body]))
  if (parentFolderId === null) {
    const sortedItems = sortVaultSiblingItems(vault.items, sortMode, noteBodiesById)
    return sortedItems === vault.items ? vault : { ...vault, items: sortedItems }
  }

  let changed = false
  const sortFolderChildren = (items: VaultTreeItem[]): VaultTreeItem[] => {
    let childChanged = false
    const nextItems = items.map((item): VaultTreeItem => {
      if (item.type !== 'folder') return item
      if (item.id === parentFolderId) {
        const sortedChildren = sortVaultSiblingItems(item.children, sortMode, noteBodiesById)
        if (sortedChildren === item.children) return item
        changed = true
        childChanged = true
        return { ...item, children: sortedChildren }
      }
      const children = sortFolderChildren(item.children)
      if (children === item.children) return item
      childChanged = true
      return { ...item, children }
    })
    return childChanged ? nextItems : items
  }

  const items = sortFolderChildren(vault.items)
  return changed ? { ...vault, items } : vault
}

function removeVaultItem(
  items: VaultTreeItem[],
  itemId: string,
): {
  items: VaultTreeItem[]
  removed: VaultTreeItem | null
  parentFolderId: string | null
  index: number
} {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.id === itemId) {
      return {
        items: [...items.slice(0, index), ...items.slice(index + 1)],
        removed: item,
        parentFolderId: null,
        index,
      }
    }
    if (item.type === 'folder') {
      const childResult = removeVaultItem(item.children, itemId)
      if (childResult.removed) {
        return {
          items: items.map((candidate) =>
            candidate.id === item.id && candidate.type === 'folder'
              ? {
                  ...candidate,
                  children: childResult.items,
                }
              : candidate,
          ),
          removed: childResult.removed,
          parentFolderId: childResult.parentFolderId ?? item.id,
          index: childResult.index,
        }
      }
    }
  }
  return {
    items,
    removed: null,
    parentFolderId: null,
    index: -1,
  }
}

function removeVaultItems(
  items: VaultTreeItem[],
  itemIds: Set<string>,
  parentFolderId: string | null = null,
): {
  items: VaultTreeItem[]
  removed: Array<{ item: VaultTreeItem; parentFolderId: string | null; index: number }>
} {
  const removed: Array<{ item: VaultTreeItem; parentFolderId: string | null; index: number }> = []
  const nextItems: VaultTreeItem[] = []

  items.forEach((item, index) => {
    if (itemIds.has(item.id)) {
      removed.push({ item, parentFolderId, index })
      return
    }

    if (item.type === 'folder') {
      const childResult = removeVaultItems(item.children, itemIds, item.id)
      removed.push(...childResult.removed)
      nextItems.push(
        childResult.items === item.children
          ? item
          : {
              ...item,
              children: childResult.items,
            },
      )
      return
    }

    nextItems.push(item)
  })

  return {
    items: removed.length > 0 ? nextItems : items,
    removed,
  }
}

export function insertVaultItem(
  vault: VaultState,
  item: VaultTreeItem,
  parentFolderId: string | null = null,
  index?: number,
): VaultState {
  const result = updateFolderChildren(vault.items, parentFolderId, (children) => {
    const boundedIndex = typeof index === 'number' ? Math.max(0, Math.min(index, children.length)) : children.length
    return [...children.slice(0, boundedIndex), item, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return vault
  return ensureValidActiveNote({
    ...vault,
    items: result.items,
  })
}

export function moveVaultItem(
  vault: VaultState,
  itemId: string,
  targetParentFolderId: string | null,
  targetIndex: number,
): VaultState {
  const source = findVaultItem(vault.items, itemId)
  if (!source) return vault
  if (source.item.type === 'folder' && targetParentFolderId) {
    if (targetParentFolderId === source.item.id || findVaultItem(source.item.children, targetParentFolderId)) {
      return vault
    }
  }

  const removal = removeVaultItem(vault.items, itemId)
  if (!removal.removed) return vault

  const targetParentExists =
    targetParentFolderId === null || Boolean(findVaultFolder(removal.items, targetParentFolderId))
  if (!targetParentExists) return vault

  const adjustedTargetIndex =
    removal.parentFolderId === targetParentFolderId && removal.index < targetIndex
      ? Math.max(0, targetIndex - 1)
      : targetIndex
  const result = updateFolderChildren(removal.items, targetParentFolderId, (children) => {
    const boundedIndex = Math.max(0, Math.min(adjustedTargetIndex, children.length))
    return [...children.slice(0, boundedIndex), removal.removed as VaultTreeItem, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return vault

  return ensureValidActiveNote({
    ...vault,
    items: result.items,
  })
}

export function moveVaultItems(
  vault: VaultState,
  itemIds: string[],
  targetParentFolderId: string | null,
  targetIndex: number,
): VaultState {
  const uniqueItemIds = Array.from(new Set(itemIds))
  if (uniqueItemIds.length === 0) return vault

  const sources = uniqueItemIds.map((itemId) => findVaultItem(vault.items, itemId))
  if (sources.some((source) => !source || source.item.type !== 'note')) return vault

  const itemIdSet = new Set(uniqueItemIds)
  const removal = removeVaultItems(vault.items, itemIdSet)
  if (removal.removed.length !== uniqueItemIds.length) return vault

  const targetParentExists =
    targetParentFolderId === null || Boolean(findVaultFolder(removal.items, targetParentFolderId))
  if (!targetParentExists) return vault

  const removedBeforeTarget = removal.removed.filter(
    (entry) => entry.parentFolderId === targetParentFolderId && entry.index < targetIndex,
  ).length
  const adjustedTargetIndex = Math.max(0, targetIndex - removedBeforeTarget)
  const movingItems = removal.removed.map((entry) => entry.item)
  const result = updateFolderChildren(removal.items, targetParentFolderId, (children) => {
    const boundedIndex = Math.max(0, Math.min(adjustedTargetIndex, children.length))
    return [...children.slice(0, boundedIndex), ...movingItems, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return vault

  return ensureValidActiveNote({
    ...vault,
    items: result.items,
  })
}

export function renameVaultItem(vault: VaultState, itemId: string, title: string): VaultState {
  const nextTitle = ensureTitle(title, 'Untitled')
  let changed = false
  const renameItems = (items: VaultTreeItem[]): VaultTreeItem[] =>
    items.map((item) => {
      if (item.id === itemId) {
        changed = true
        return {
          ...item,
          title: nextTitle,
        }
      }
      if (item.type !== 'folder') return item
      const children = renameItems(item.children)
      return children === item.children ? item : { ...item, children }
    })
  const items = renameItems(vault.items)
  return changed ? { ...vault, items } : vault
}

export function deleteVaultItem(vault: VaultState, itemId: string, idGenerator: IdGenerator = createRandomId): VaultState {
  const removal = removeVaultItem(vault.items, itemId)
  if (!removal.removed) return vault
  const deletedEntry: DeletedVaultItem = {
    id: idGenerator(),
    deletedAt: Date.now(),
    item: removal.removed,
    originalParentFolderId: removal.parentFolderId,
    originalIndex: removal.index,
  }
  return ensureValidActiveNote({
    ...vault,
    items: removal.items,
    deletedItems: [deletedEntry, ...vault.deletedItems],
  })
}

export function deleteVaultItems(
  vault: VaultState,
  itemIds: string[],
  idGenerator: IdGenerator = createRandomId,
): VaultState {
  const seenItemIds = new Set<string>()
  return itemIds.reduce((nextVault, itemId) => {
    if (!itemId || seenItemIds.has(itemId)) return nextVault
    seenItemIds.add(itemId)
    return deleteVaultItem(nextVault, itemId, idGenerator)
  }, vault)
}

export function restoreDeletedVaultItem(vault: VaultState, deletedItemId: string): VaultState {
  const entry = vault.deletedItems.find((candidate) => candidate.id === deletedItemId)
  if (!entry) return vault
  const deletedItems = vault.deletedItems.filter((candidate) => candidate.id !== deletedItemId)
  const targetFolderExists = entry.originalParentFolderId === null || Boolean(findVaultFolder(vault.items, entry.originalParentFolderId))
  const parentFolderId = targetFolderExists ? entry.originalParentFolderId : null
  const restored = insertVaultItem(
    {
      ...vault,
      deletedItems,
    },
    entry.item,
    parentFolderId,
    entry.originalIndex,
  )
  return normalizeVaultOpenTabs({
    ...restored,
    activeNoteId: entry.item.type === 'note' ? entry.item.id : restored.activeNoteId,
  })
}

export function purgeOldDeletedVaultItems(vault: VaultState, now = Date.now()): VaultState {
  const days = vault.settings.autoRemoveDeletedDays
  if (!Number.isFinite(days) || days <= 0) return vault
  const cutoff = now - days * 24 * 60 * 60 * 1000
  const deletedItems = vault.deletedItems.filter((entry) => entry.deletedAt >= cutoff)
  return deletedItems.length === vault.deletedItems.length ? vault : { ...vault, deletedItems }
}

export function replaceVaultNoteBodyId(vault: VaultState, noteId: string, noteBodyId: string): VaultState {
  let changed = false
  const replaceItems = (items: VaultTreeItem[]): VaultTreeItem[] =>
    items.map((item) => {
      if (item.type === 'note') {
        if (item.id !== noteId || item.noteBodyId === noteBodyId) return item
        changed = true
        return {
          ...item,
          noteBodyId,
        }
      }
      const children = replaceItems(item.children)
      return children === item.children ? item : { ...item, children }
    })
  const items = replaceItems(vault.items)
  return changed ? { ...vault, items } : vault
}

type NoteBodyLocation = {
  noteId: string
  noteBodyId: string
}

function collectNoteBodyLocations(items: VaultTreeItem[], locations: NoteBodyLocation[] = []): NoteBodyLocation[] {
  items.forEach((item) => {
    if (item.type === 'note') {
      locations.push({ noteId: item.id, noteBodyId: item.noteBodyId })
      return
    }
    collectNoteBodyLocations(item.children, locations)
  })
  return locations
}

function replaceVaultItemNoteBodyIds(
  items: VaultTreeItem[],
  replacements: Map<string, string>,
): { items: VaultTreeItem[]; changed: boolean } {
  let changed = false
  const nextItems = items.map((item): VaultTreeItem => {
    if (item.type === 'note') {
      const noteBodyId = replacements.get(item.id)
      if (!noteBodyId || noteBodyId === item.noteBodyId) return item
      changed = true
      return { ...item, noteBodyId }
    }

    const childResult = replaceVaultItemNoteBodyIds(item.children, replacements)
    if (!childResult.changed) return item
    changed = true
    return { ...item, children: childResult.items }
  })
  return { items: nextItems, changed }
}

function replaceDeletedVaultItemNoteBodyIds(
  item: VaultTreeItem,
  replacements: Map<string, string>,
): { item: VaultTreeItem; changed: boolean } {
  if (item.type === 'note') {
    const noteBodyId = replacements.get(item.id)
    return noteBodyId && noteBodyId !== item.noteBodyId
      ? { item: { ...item, noteBodyId }, changed: true }
      : { item, changed: false }
  }

  const childResult = replaceVaultItemNoteBodyIds(item.children, replacements)
  return childResult.changed
    ? { item: { ...item, children: childResult.items }, changed: true }
    : { item, changed: false }
}

export function materializeSyncedNoteBodiesInState(
  state: AppState,
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
): AppState {
  const locations = collectNoteBodyLocations(state.vault.items)
  state.vault.deletedItems.forEach((entry) => collectNoteBodyLocations([entry.item], locations))

  const locationsByBodyId = new Map<string, NoteBodyLocation[]>()
  locations.forEach((location) => {
    locationsByBodyId.set(location.noteBodyId, [...(locationsByBodyId.get(location.noteBodyId) ?? []), location])
  })

  const bodiesById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const replacements = new Map<string, string>()
  const noteBodies: NoteBody[] = []
  const timestamp = nowIso()

  locationsByBodyId.forEach((bodyLocations, noteBodyId) => {
    if (bodyLocations.length <= 1) return
    const sourceBody = bodiesById.get(noteBodyId)
    if (!sourceBody) return

    bodyLocations.slice(1).forEach((location) => {
      const nextBodyId = idGenerator()
      replacements.set(location.noteId, nextBodyId)
      noteBodies.push({
        ...sourceBody,
        id: nextBodyId,
        createdAt: timestamp,
        updatedAt: timestamp,
        aisles: sourceBody.aisles.map((aisle) => ({
          id: idGenerator(),
          aisleBodyId: aisle.aisleBodyId,
        })),
      })
    })
  })

  if (replacements.size === 0) return state

  const vaultItemsResult = replaceVaultItemNoteBodyIds(state.vault.items, replacements)
  let deletedItemsChanged = false
  const deletedItems = state.vault.deletedItems.map((entry) => {
    const itemResult = replaceDeletedVaultItemNoteBodyIds(entry.item, replacements)
    if (!itemResult.changed) return entry
    deletedItemsChanged = true
    return { ...entry, item: itemResult.item }
  })

  return {
    ...state,
    vault: {
      ...state.vault,
      items: vaultItemsResult.items,
      deletedItems: deletedItemsChanged ? deletedItems : state.vault.deletedItems,
    },
    noteBodies: [...state.noteBodies, ...noteBodies],
  }
}

export function replaceVaultNoteBody(state: AppState, noteId: string, noteBody: NoteBody, aisleBodies: NoteAisleBody[]): AppState {
  return {
    ...state,
    vault: replaceVaultNoteBodyId(state.vault, noteId, noteBody.id),
    noteBodies: [...state.noteBodies.filter((body) => body.id !== noteBody.id), noteBody],
    noteAisleBodies: [
      ...(state.noteAisleBodies ?? []).filter((body) => !aisleBodies.some((aisleBody) => aisleBody.id === body.id)),
      ...aisleBodies,
    ],
  }
}

function cloneAisleBodyAsIndependentCopy(source: NoteAisleBody, idGenerator: IdGenerator): NoteAisleBody {
  const timestamp = nowIso()
  return {
    ...source,
    id: idGenerator(),
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [...(source.tags ?? [])],
    frontmatter: source.frontmatter && typeof source.frontmatter === 'object' ? { ...source.frontmatter } : source.frontmatter,
    frontmatterMeta:
      source.frontmatterMeta && typeof source.frontmatterMeta === 'object' ? { ...source.frontmatterMeta } : source.frontmatterMeta,
  }
}

function countAisleBodyReferences(noteBodies: NoteBody[], aisleBodyId: string): number {
  return noteBodies.reduce(
    (count, body) => count + body.aisles.filter((aisle) => aisle.aisleBodyId === aisleBodyId).length,
    0,
  )
}

export function decoupleVaultNoteBodyInState(
  state: AppState,
  noteId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
): AppState {
  const notePath = findVaultNote(state.vault.items, noteId)
  const body = notePath ? state.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) : null
  if (!notePath || !body || !isNoteBodyLinked(state.vault.items, body.id)) return state
  const cloned = cloneNoteBodyAsIndependentCopy(body, state.noteAisleBodies, idGenerator)
  return {
    ...state,
    vault: replaceVaultNoteBodyId(state.vault, notePath.note.id, cloned.noteBody.id),
    noteBodies: [...state.noteBodies, cloned.noteBody],
    noteAisleBodies: [...(state.noteAisleBodies ?? []), ...cloned.aisleBodies],
  }
}

export function decoupleVaultAisleBodyInState(
  state: AppState,
  noteId: string,
  aisleId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
): AppState {
  const notePath = findVaultNote(state.vault.items, noteId)
  const noteBody = notePath ? state.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) : null
  const aisle = noteBody?.aisles.find((candidate) => candidate.id === aisleId)
  if (!noteBody || !aisle || countAisleBodyReferences(state.noteBodies, aisle.aisleBodyId) <= 1) return state
  const sourceBody = (state.noteAisleBodies ?? []).find((candidate) => candidate.id === aisle.aisleBodyId)
  if (!sourceBody) return state
  const clonedAisleBody = cloneAisleBodyAsIndependentCopy(sourceBody, idGenerator)
  return {
    ...state,
    noteBodies: state.noteBodies.map((candidate) =>
      candidate.id === noteBody.id
        ? {
            ...candidate,
            updatedAt: nowIso(),
            aisles: candidate.aisles.map((candidateAisle) =>
              candidateAisle.id === aisle.id
                ? {
                    ...candidateAisle,
                    aisleBodyId: clonedAisleBody.id,
                  }
                : candidateAisle,
            ),
          }
        : candidate,
    ),
    noteAisleBodies: [...(state.noteAisleBodies ?? []), clonedAisleBody],
  }
}

export function createVaultNoteInState(
  state: AppState,
  title: string,
  parentFolderId: string | null = getContainingFolderId(state.vault.items, state.vault.activeNoteId),
  markdown = '',
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
  index?: number,
): CreatedVaultNote {
  const { noteBody, aisleBody, aisleId, aisleBodyId } = createNoteBodyWithAisle(markdown, idGenerator)
  const note = createVaultNote(title, noteBody.id, idGenerator)
  const vault = openVaultRetainedTab(
    {
      ...insertVaultItem(state.vault, note, parentFolderId, index),
      activeNoteId: note.id,
    },
    note.id,
  )
  return {
    state: {
      ...state,
      vault,
      noteBodies: [...state.noteBodies, noteBody],
      noteAisleBodies: [...(state.noteAisleBodies ?? []), aisleBody],
    },
    noteId: note.id,
    noteBodyId: noteBody.id,
    aisleId,
    aisleBodyId,
  }
}

export function createVaultFolderInState(
  state: AppState,
  title: string,
  parentFolderId: string | null = getContainingFolderId(state.vault.items, state.vault.activeNoteId),
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
  index?: number,
): CreatedVaultFolder {
  const folder = createVaultFolder(title, [], idGenerator)
  return {
    state: {
      ...state,
      vault: insertVaultItem(state.vault, folder, parentFolderId, index),
    },
    folderId: folder.id,
  }
}

export function deleteVaultItemInState(
  state: AppState,
  itemId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
): AppState {
  return {
    ...state,
    vault: deleteVaultItem(state.vault, itemId, idGenerator),
  }
}

export function deleteVaultItemsInState(
  state: AppState,
  itemIds: string[],
  idGenerator: IdGenerator = createReservedIdAllocator(collectVaultIds(state)),
): AppState {
  return {
    ...state,
    vault: deleteVaultItems(state.vault, itemIds, idGenerator),
  }
}

export function restoreDeletedVaultItemInState(state: AppState, deletedItemId: string): AppState {
  return {
    ...state,
    vault: restoreDeletedVaultItem(state.vault, deletedItemId),
  }
}

export function collectVaultIds(state: AppState): Set<string> {
  const ids = new Set<string>()
  walkVaultItems(state.vault.items, ({ item }) => {
    ids.add(item.id)
    if (item.type === 'note') ids.add(item.noteBodyId)
  })
  state.vault.deletedItems.forEach((entry) => {
    ids.add(entry.id)
    walkVaultItems([entry.item], ({ item }) => {
      ids.add(item.id)
      if (item.type === 'note') ids.add(item.noteBodyId)
    })
  })
  state.noteBodies.forEach((body) => {
    ids.add(body.id)
    body.aisles.forEach((aisle) => {
      ids.add(aisle.id)
      ids.add(aisle.aisleBodyId)
    })
  })
  state.noteAisleBodies?.forEach((body) => ids.add(body.id))
  return ids
}

export function getFolderNotesRecursive(items: VaultTreeItem[], folderId: string | null): VaultNotePath[] {
  if (folderId === null) return listVaultNotes(items)
  const folder = findVaultFolder(items, folderId)
  return folder ? listVaultNotes(folder.folder.children) : []
}

export function isNoteBodyLinked(items: VaultTreeItem[], noteBodyId: string): boolean {
  let count = 0
  walkVaultItems(items, ({ item }) => {
    if (item.type === 'note' && item.noteBodyId === noteBodyId) {
      count += 1
      if (count > 1) return false
    }
    return undefined
  })
  return count > 1
}
