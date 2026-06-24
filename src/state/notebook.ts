import type {
  AppState,
  DeletedNotebookItem,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NotebookFolder,
  NotebookNote,
  NotebookState,
  NotebookTreeItem,
  TabSortMode,
} from '../types/app'
import { cloneNoteBodyAsIndependentCopy } from '../notes/aisle-body-state'
import { createRandomId, createReservedIdAllocator, type IdGenerator } from './navigation-ids'

export type NotebookItemPathSegment = {
  id: string
  title: string
  type: NotebookTreeItem['type'] | 'root'
}

export type NotebookNotePath = {
  note: NotebookNote
  parentFolderId: string | null
  path: NotebookItemPathSegment[]
}

type WalkContext = {
  parentFolderId: string | null
  index: number
  path: NotebookItemPathSegment[]
}

export type NotebookWalkEntry = WalkContext & {
  item: NotebookTreeItem
}

export type CreatedNotebookNote = {
  state: AppState
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
}

export type CreatedNotebookFolder = {
  state: AppState
  folderId: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function ensureTitle(title: string, fallback: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export function createNotebookNote(title: string, noteBodyId: string, idGenerator: IdGenerator = createRandomId): NotebookNote {
  return {
    type: 'note',
    id: idGenerator(),
    title: ensureTitle(title, 'Untitled'),
    noteBodyId,
  }
}

export function createNotebookFolder(
  title: string,
  children: NotebookTreeItem[] = [],
  idGenerator: IdGenerator = createRandomId,
): NotebookFolder {
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

export function createDefaultNotebookState(idGenerator: IdGenerator = createRandomId): {
  notebook: NotebookState
  noteBodies: NoteBody[]
  noteAisleBodies: NoteAisleBody[]
} {
  const { noteBody, aisleBody } = createNoteBodyWithAisle('', idGenerator)
  const note = createNotebookNote('Welcome', noteBody.id, idGenerator)
  return {
    notebook: {
      activeNoteId: note.id,
      items: [note],
      deletedItems: [],
      settings: {
        autoRemoveDeletedDays: 30,
      },
    },
    noteBodies: [noteBody],
    noteAisleBodies: [aisleBody],
  }
}

export function walkNotebookItems(
  items: NotebookTreeItem[],
  visitor: (entry: NotebookWalkEntry) => void | false,
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
      const childResult = walkNotebookItems(item.children, visitor, {
        parentFolderId: item.id,
        path,
      })
      if (childResult === false) return false
    }
  }
}

export function listNotebookNotes(items: NotebookTreeItem[]): NotebookNotePath[] {
  const notes: NotebookNotePath[] = []
  walkNotebookItems(items, ({ item, parentFolderId, path }) => {
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

export function listNotebookFolders(items: NotebookTreeItem[]): Array<{ folder: NotebookFolder; path: NotebookItemPathSegment[] }> {
  const folders: Array<{ folder: NotebookFolder; path: NotebookItemPathSegment[] }> = []
  walkNotebookItems(items, ({ item, path }) => {
    if (item.type === 'folder') folders.push({ folder: item, path })
  })
  return folders
}

export function findNotebookItem(items: NotebookTreeItem[], itemId: string): NotebookWalkEntry | null {
  let found: NotebookWalkEntry | null = null
  walkNotebookItems(items, (entry) => {
    if (entry.item.id === itemId) {
      found = entry
      return false
    }
    return undefined
  })
  return found
}

export function findNotebookNote(items: NotebookTreeItem[], noteId: string): NotebookNotePath | null {
  const entry = findNotebookItem(items, noteId)
  if (!entry || entry.item.type !== 'note') return null
  return {
    note: entry.item,
    parentFolderId: entry.parentFolderId,
    path: entry.path,
  }
}

export function findNotebookFolder(
  items: NotebookTreeItem[],
  folderId: string,
): { folder: NotebookFolder; parentFolderId: string | null; path: NotebookItemPathSegment[] } | null {
  const entry = findNotebookItem(items, folderId)
  if (!entry || entry.item.type !== 'folder') return null
  return {
    folder: entry.item,
    parentFolderId: entry.parentFolderId,
    path: entry.path,
  }
}

export function getFirstNotebookNote(items: NotebookTreeItem[]): NotebookNote | null {
  let first: NotebookNote | null = null
  walkNotebookItems(items, ({ item }) => {
    if (item.type === 'note') {
      first = item
      return false
    }
    return undefined
  })
  return first
}

export function getContainingFolderId(items: NotebookTreeItem[], itemId: string): string | null {
  const entry = findNotebookItem(items, itemId)
  return entry?.parentFolderId ?? null
}

export function getNotebookNoteFolderPath(items: NotebookTreeItem[], noteId: string): NotebookItemPathSegment[] {
  const notePath = findNotebookNote(items, noteId)
  if (!notePath) return []
  return notePath.path.slice(0, -1)
}

export function getNotebookNotePathLabel(items: NotebookTreeItem[], noteId: string): string {
  const notePath = findNotebookNote(items, noteId)
  if (!notePath) return ''
  return notePath.path.map((segment) => segment.title).join('/')
}

export function getNotebookFolderPathLabel(items: NotebookTreeItem[], folderId: string | null): string {
  if (!folderId) return ''
  const folder = findNotebookFolder(items, folderId)
  if (!folder) return ''
  return folder.path.map((segment) => segment.title).join('/')
}

export function ensureValidActiveNote(notebook: NotebookState): NotebookState {
  if (findNotebookNote(notebook.items, notebook.activeNoteId)) return notebook
  const firstNote = getFirstNotebookNote(notebook.items)
  if (firstNote) {
    return {
      ...notebook,
      activeNoteId: firstNote.id,
    }
  }
  return {
    ...notebook,
    activeNoteId: '',
  }
}

function updateFolderChildren(
  items: NotebookTreeItem[],
  folderId: string | null,
  updater: (children: NotebookTreeItem[]) => NotebookTreeItem[],
): { items: NotebookTreeItem[]; changed: boolean } {
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

const NOTEBOOK_ITEM_TITLE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

type NotebookSortDirection = 'asc' | 'desc'
type NotebookDateSortField = 'createdAt' | 'updatedAt'
type NotebookSortDescriptor =
  | { kind: 'title'; direction: NotebookSortDirection }
  | { kind: 'date'; direction: NotebookSortDirection; field: NotebookDateSortField }

function getNotebookSortDescriptor(sortMode: TabSortMode): NotebookSortDescriptor {
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

function normalizeNotebookSortTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getNotebookItemDateSortValue(
  item: NotebookTreeItem,
  field: NotebookDateSortField,
  noteBodiesById: Map<string, NoteBody>,
): number | null {
  if (item.type === 'note') {
    return normalizeNotebookSortTimestamp(noteBodiesById.get(item.noteBodyId)?.[field])
  }

  let folderTimestamp: number | null = null
  walkNotebookItems(item.children, ({ item: child }) => {
    if (child.type !== 'note') return undefined
    const childTimestamp = normalizeNotebookSortTimestamp(noteBodiesById.get(child.noteBodyId)?.[field])
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

function sortNotebookSiblingItems(
  items: NotebookTreeItem[],
  sortMode: TabSortMode,
  noteBodiesById: Map<string, NoteBody>,
): NotebookTreeItem[] {
  const descriptor = getNotebookSortDescriptor(sortMode)
  const sortedItems = items
    .map((item, index) => ({
      item,
      index,
      dateValue: descriptor.kind === 'date'
        ? getNotebookItemDateSortValue(item, descriptor.field, noteBodiesById)
        : null,
    }))
    .sort((left, right) => {
      let comparison = 0
      if (descriptor.kind === 'title') {
        comparison = NOTEBOOK_ITEM_TITLE_COLLATOR.compare(left.item.title, right.item.title)
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

export function sortNotebookItemsInScope(
  notebook: NotebookState,
  parentFolderId: string | null,
  sortMode: TabSortMode,
  noteBodies: NoteBody[],
): NotebookState {
  const noteBodiesById = new Map(noteBodies.map((body) => [body.id, body]))
  if (parentFolderId === null) {
    const sortedItems = sortNotebookSiblingItems(notebook.items, sortMode, noteBodiesById)
    return sortedItems === notebook.items ? notebook : { ...notebook, items: sortedItems }
  }

  let changed = false
  const sortFolderChildren = (items: NotebookTreeItem[]): NotebookTreeItem[] => {
    let childChanged = false
    const nextItems = items.map((item): NotebookTreeItem => {
      if (item.type !== 'folder') return item
      if (item.id === parentFolderId) {
        const sortedChildren = sortNotebookSiblingItems(item.children, sortMode, noteBodiesById)
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

  const items = sortFolderChildren(notebook.items)
  return changed ? { ...notebook, items } : notebook
}

function removeNotebookItem(
  items: NotebookTreeItem[],
  itemId: string,
): {
  items: NotebookTreeItem[]
  removed: NotebookTreeItem | null
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
      const childResult = removeNotebookItem(item.children, itemId)
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

function removeNotebookItems(
  items: NotebookTreeItem[],
  itemIds: Set<string>,
  parentFolderId: string | null = null,
): {
  items: NotebookTreeItem[]
  removed: Array<{ item: NotebookTreeItem; parentFolderId: string | null; index: number }>
} {
  const removed: Array<{ item: NotebookTreeItem; parentFolderId: string | null; index: number }> = []
  const nextItems: NotebookTreeItem[] = []

  items.forEach((item, index) => {
    if (itemIds.has(item.id)) {
      removed.push({ item, parentFolderId, index })
      return
    }

    if (item.type === 'folder') {
      const childResult = removeNotebookItems(item.children, itemIds, item.id)
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

export function insertNotebookItem(
  notebook: NotebookState,
  item: NotebookTreeItem,
  parentFolderId: string | null = null,
  index?: number,
): NotebookState {
  const result = updateFolderChildren(notebook.items, parentFolderId, (children) => {
    const boundedIndex = typeof index === 'number' ? Math.max(0, Math.min(index, children.length)) : children.length
    return [...children.slice(0, boundedIndex), item, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return notebook
  return ensureValidActiveNote({
    ...notebook,
    items: result.items,
  })
}

export function moveNotebookItem(
  notebook: NotebookState,
  itemId: string,
  targetParentFolderId: string | null,
  targetIndex: number,
): NotebookState {
  const source = findNotebookItem(notebook.items, itemId)
  if (!source) return notebook
  if (source.item.type === 'folder' && targetParentFolderId) {
    if (targetParentFolderId === source.item.id || findNotebookItem(source.item.children, targetParentFolderId)) {
      return notebook
    }
  }

  const removal = removeNotebookItem(notebook.items, itemId)
  if (!removal.removed) return notebook

  const targetParentExists =
    targetParentFolderId === null || Boolean(findNotebookFolder(removal.items, targetParentFolderId))
  if (!targetParentExists) return notebook

  const adjustedTargetIndex =
    removal.parentFolderId === targetParentFolderId && removal.index < targetIndex
      ? Math.max(0, targetIndex - 1)
      : targetIndex
  const result = updateFolderChildren(removal.items, targetParentFolderId, (children) => {
    const boundedIndex = Math.max(0, Math.min(adjustedTargetIndex, children.length))
    return [...children.slice(0, boundedIndex), removal.removed as NotebookTreeItem, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return notebook

  return ensureValidActiveNote({
    ...notebook,
    items: result.items,
  })
}

export function moveNotebookItems(
  notebook: NotebookState,
  itemIds: string[],
  targetParentFolderId: string | null,
  targetIndex: number,
): NotebookState {
  const uniqueItemIds = Array.from(new Set(itemIds))
  if (uniqueItemIds.length === 0) return notebook

  const sources = uniqueItemIds.map((itemId) => findNotebookItem(notebook.items, itemId))
  if (sources.some((source) => !source || source.item.type !== 'note')) return notebook

  const itemIdSet = new Set(uniqueItemIds)
  const removal = removeNotebookItems(notebook.items, itemIdSet)
  if (removal.removed.length !== uniqueItemIds.length) return notebook

  const targetParentExists =
    targetParentFolderId === null || Boolean(findNotebookFolder(removal.items, targetParentFolderId))
  if (!targetParentExists) return notebook

  const removedBeforeTarget = removal.removed.filter(
    (entry) => entry.parentFolderId === targetParentFolderId && entry.index < targetIndex,
  ).length
  const adjustedTargetIndex = Math.max(0, targetIndex - removedBeforeTarget)
  const movingItems = removal.removed.map((entry) => entry.item)
  const result = updateFolderChildren(removal.items, targetParentFolderId, (children) => {
    const boundedIndex = Math.max(0, Math.min(adjustedTargetIndex, children.length))
    return [...children.slice(0, boundedIndex), ...movingItems, ...children.slice(boundedIndex)]
  })
  if (!result.changed) return notebook

  return ensureValidActiveNote({
    ...notebook,
    items: result.items,
  })
}

export function renameNotebookItem(notebook: NotebookState, itemId: string, title: string): NotebookState {
  const nextTitle = ensureTitle(title, 'Untitled')
  let changed = false
  const renameItems = (items: NotebookTreeItem[]): NotebookTreeItem[] =>
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
  const items = renameItems(notebook.items)
  return changed ? { ...notebook, items } : notebook
}

export function deleteNotebookItem(notebook: NotebookState, itemId: string, idGenerator: IdGenerator = createRandomId): NotebookState {
  const removal = removeNotebookItem(notebook.items, itemId)
  if (!removal.removed) return notebook
  const deletedEntry: DeletedNotebookItem = {
    id: idGenerator(),
    deletedAt: Date.now(),
    item: removal.removed,
    originalParentFolderId: removal.parentFolderId,
    originalIndex: removal.index,
  }
  return ensureValidActiveNote({
    ...notebook,
    items: removal.items,
    deletedItems: [deletedEntry, ...notebook.deletedItems],
  })
}

export function restoreDeletedNotebookItem(notebook: NotebookState, deletedItemId: string): NotebookState {
  const entry = notebook.deletedItems.find((candidate) => candidate.id === deletedItemId)
  if (!entry) return notebook
  const deletedItems = notebook.deletedItems.filter((candidate) => candidate.id !== deletedItemId)
  const targetFolderExists = entry.originalParentFolderId === null || Boolean(findNotebookFolder(notebook.items, entry.originalParentFolderId))
  const parentFolderId = targetFolderExists ? entry.originalParentFolderId : null
  const restored = insertNotebookItem(
    {
      ...notebook,
      deletedItems,
    },
    entry.item,
    parentFolderId,
    entry.originalIndex,
  )
  return {
    ...restored,
    activeNoteId: entry.item.type === 'note' ? entry.item.id : restored.activeNoteId,
  }
}

export function purgeOldDeletedNotebookItems(notebook: NotebookState, now = Date.now()): NotebookState {
  const days = notebook.settings.autoRemoveDeletedDays
  if (!Number.isFinite(days) || days <= 0) return notebook
  const cutoff = now - days * 24 * 60 * 60 * 1000
  const deletedItems = notebook.deletedItems.filter((entry) => entry.deletedAt >= cutoff)
  return deletedItems.length === notebook.deletedItems.length ? notebook : { ...notebook, deletedItems }
}

export function replaceNotebookNoteBodyId(notebook: NotebookState, noteId: string, noteBodyId: string): NotebookState {
  let changed = false
  const replaceItems = (items: NotebookTreeItem[]): NotebookTreeItem[] =>
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
  const items = replaceItems(notebook.items)
  return changed ? { ...notebook, items } : notebook
}

type NoteBodyLocation = {
  noteId: string
  noteBodyId: string
}

function collectNoteBodyLocations(items: NotebookTreeItem[], locations: NoteBodyLocation[] = []): NoteBodyLocation[] {
  items.forEach((item) => {
    if (item.type === 'note') {
      locations.push({ noteId: item.id, noteBodyId: item.noteBodyId })
      return
    }
    collectNoteBodyLocations(item.children, locations)
  })
  return locations
}

function replaceNotebookItemNoteBodyIds(
  items: NotebookTreeItem[],
  replacements: Map<string, string>,
): { items: NotebookTreeItem[]; changed: boolean } {
  let changed = false
  const nextItems = items.map((item): NotebookTreeItem => {
    if (item.type === 'note') {
      const noteBodyId = replacements.get(item.id)
      if (!noteBodyId || noteBodyId === item.noteBodyId) return item
      changed = true
      return { ...item, noteBodyId }
    }

    const childResult = replaceNotebookItemNoteBodyIds(item.children, replacements)
    if (!childResult.changed) return item
    changed = true
    return { ...item, children: childResult.items }
  })
  return { items: nextItems, changed }
}

function replaceDeletedNotebookItemNoteBodyIds(
  item: NotebookTreeItem,
  replacements: Map<string, string>,
): { item: NotebookTreeItem; changed: boolean } {
  if (item.type === 'note') {
    const noteBodyId = replacements.get(item.id)
    return noteBodyId && noteBodyId !== item.noteBodyId
      ? { item: { ...item, noteBodyId }, changed: true }
      : { item, changed: false }
  }

  const childResult = replaceNotebookItemNoteBodyIds(item.children, replacements)
  return childResult.changed
    ? { item: { ...item, children: childResult.items }, changed: true }
    : { item, changed: false }
}

export function materializeSyncedNoteBodiesInState(
  state: AppState,
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
): AppState {
  const locations = collectNoteBodyLocations(state.notebook.items)
  state.notebook.deletedItems.forEach((entry) => collectNoteBodyLocations([entry.item], locations))

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

  const notebookItemsResult = replaceNotebookItemNoteBodyIds(state.notebook.items, replacements)
  let deletedItemsChanged = false
  const deletedItems = state.notebook.deletedItems.map((entry) => {
    const itemResult = replaceDeletedNotebookItemNoteBodyIds(entry.item, replacements)
    if (!itemResult.changed) return entry
    deletedItemsChanged = true
    return { ...entry, item: itemResult.item }
  })

  return {
    ...state,
    notebook: {
      ...state.notebook,
      items: notebookItemsResult.items,
      deletedItems: deletedItemsChanged ? deletedItems : state.notebook.deletedItems,
    },
    noteBodies: [...state.noteBodies, ...noteBodies],
  }
}

export function replaceNotebookNoteBody(state: AppState, noteId: string, noteBody: NoteBody, aisleBodies: NoteAisleBody[]): AppState {
  return {
    ...state,
    notebook: replaceNotebookNoteBodyId(state.notebook, noteId, noteBody.id),
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

export function decoupleNotebookNoteBodyInState(
  state: AppState,
  noteId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
): AppState {
  const notePath = findNotebookNote(state.notebook.items, noteId)
  const body = notePath ? state.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) : null
  if (!notePath || !body || !isNoteBodyLinked(state.notebook.items, body.id)) return state
  const cloned = cloneNoteBodyAsIndependentCopy(body, state.noteAisleBodies, idGenerator)
  return {
    ...state,
    notebook: replaceNotebookNoteBodyId(state.notebook, notePath.note.id, cloned.noteBody.id),
    noteBodies: [...state.noteBodies, cloned.noteBody],
    noteAisleBodies: [...(state.noteAisleBodies ?? []), ...cloned.aisleBodies],
  }
}

export function decoupleNotebookAisleBodyInState(
  state: AppState,
  noteId: string,
  aisleId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
): AppState {
  const notePath = findNotebookNote(state.notebook.items, noteId)
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

export function createNotebookNoteInState(
  state: AppState,
  title: string,
  parentFolderId: string | null = getContainingFolderId(state.notebook.items, state.notebook.activeNoteId),
  markdown = '',
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
  index?: number,
): CreatedNotebookNote {
  const { noteBody, aisleBody, aisleId, aisleBodyId } = createNoteBodyWithAisle(markdown, idGenerator)
  const note = createNotebookNote(title, noteBody.id, idGenerator)
  const notebook = insertNotebookItem(state.notebook, note, parentFolderId, index)
  return {
    state: {
      ...state,
      notebook: {
        ...notebook,
        activeNoteId: note.id,
      },
      noteBodies: [...state.noteBodies, noteBody],
      noteAisleBodies: [...(state.noteAisleBodies ?? []), aisleBody],
    },
    noteId: note.id,
    noteBodyId: noteBody.id,
    aisleId,
    aisleBodyId,
  }
}

export function createNotebookFolderInState(
  state: AppState,
  title: string,
  parentFolderId: string | null = getContainingFolderId(state.notebook.items, state.notebook.activeNoteId),
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
  index?: number,
): CreatedNotebookFolder {
  const folder = createNotebookFolder(title, [], idGenerator)
  return {
    state: {
      ...state,
      notebook: insertNotebookItem(state.notebook, folder, parentFolderId, index),
    },
    folderId: folder.id,
  }
}

export function deleteNotebookItemInState(
  state: AppState,
  itemId: string,
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
): AppState {
  return {
    ...state,
    notebook: deleteNotebookItem(state.notebook, itemId, idGenerator),
  }
}

export function restoreDeletedNotebookItemInState(state: AppState, deletedItemId: string): AppState {
  return {
    ...state,
    notebook: restoreDeletedNotebookItem(state.notebook, deletedItemId),
  }
}

export function collectNotebookIds(state: AppState): Set<string> {
  const ids = new Set<string>()
  walkNotebookItems(state.notebook.items, ({ item }) => {
    ids.add(item.id)
    if (item.type === 'note') ids.add(item.noteBodyId)
  })
  state.notebook.deletedItems.forEach((entry) => {
    ids.add(entry.id)
    walkNotebookItems([entry.item], ({ item }) => {
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

export function getFolderNotesRecursive(items: NotebookTreeItem[], folderId: string | null): NotebookNotePath[] {
  if (folderId === null) return listNotebookNotes(items)
  const folder = findNotebookFolder(items, folderId)
  return folder ? listNotebookNotes(folder.folder.children) : []
}

export function isNoteBodyLinked(items: NotebookTreeItem[], noteBodyId: string): boolean {
  let count = 0
  walkNotebookItems(items, ({ item }) => {
    if (item.type === 'note' && item.noteBodyId === noteBodyId) {
      count += 1
      if (count > 1) return false
    }
    return undefined
  })
  return count > 1
}
