import type {
  NoteBody,
  StageManagerDestinationSortMode,
  SubTab,
  Tab,
  TabSortMode,
} from '../types/app'

export const TAB_SORT_OPTIONS: Array<{ mode: TabSortMode; label: string }> = [
  { mode: 'alpha-asc', label: 'a-z' },
  { mode: 'alpha-desc', label: 'z-a' },
  { mode: 'created-asc', label: 'created ascending' },
  { mode: 'created-desc', label: 'created descending' },
  { mode: 'updated-asc', label: 'updated ascending' },
  { mode: 'updated-desc', label: 'updated descending' },
]

export const STAGE_MANAGER_DESTINATION_SORT_OPTIONS: Array<{ mode: StageManagerDestinationSortMode; label: string }> = [
  { mode: 'default', label: 'default (moves to end)' },
  ...TAB_SORT_OPTIONS,
]

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

type SortableNoteLocation = {
  title: string
  noteBodyId: string
}

type IndexedItem<T> = {
  item: T
  index: number
}

export function getDestinationSortLabel(mode: StageManagerDestinationSortMode): string {
  return STAGE_MANAGER_DESTINATION_SORT_OPTIONS.find((option) => option.mode === mode)?.label ?? 'default (moves to end)'
}

function buildNoteBodyMap(noteBodies: NoteBody[] | Map<string, NoteBody>): Map<string, NoteBody> {
  return noteBodies instanceof Map ? noteBodies : new Map(noteBodies.map((body) => [body.id, body]))
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function compareTimestamp(left: number | null, right: number | null, descending: boolean): number {
  const leftValid = left !== null
  const rightValid = right !== null

  if (leftValid && rightValid) {
    const delta = left - right
    return descending ? -delta : delta
  }

  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1
  }

  return 0
}

function compareIndexedNoteLocations<T extends SortableNoteLocation>(
  left: IndexedItem<T>,
  right: IndexedItem<T>,
  noteBodyMap: Map<string, NoteBody>,
  mode: TabSortMode,
): number {
  if (mode === 'alpha-asc' || mode === 'alpha-desc') {
    const comparison = titleCollator.compare(left.item.title, right.item.title)
    if (comparison !== 0) return mode === 'alpha-desc' ? -comparison : comparison
    return left.index - right.index
  }

  const timestampKey = mode.startsWith('created') ? 'createdAt' : 'updatedAt'
  const descending = mode.endsWith('desc')
  const leftTime = parseTimestamp(noteBodyMap.get(left.item.noteBodyId)?.[timestampKey])
  const rightTime = parseTimestamp(noteBodyMap.get(right.item.noteBodyId)?.[timestampKey])
  const comparison = compareTimestamp(leftTime, rightTime, descending)
  return comparison === 0 ? left.index - right.index : comparison
}

export function sortNoteLocations<T extends SortableNoteLocation>(
  items: T[],
  noteBodies: NoteBody[] | Map<string, NoteBody>,
  mode: TabSortMode,
): T[] {
  const noteBodyMap = buildNoteBodyMap(noteBodies)
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareIndexedNoteLocations(left, right, noteBodyMap, mode))
    .map(({ item }) => item)
}

export function sortTabs(tabs: Tab[], noteBodies: NoteBody[] | Map<string, NoteBody>, mode: TabSortMode): Tab[] {
  return sortNoteLocations(tabs, noteBodies, mode)
}

export function sortSubTabs(subTabs: SubTab[], noteBodies: NoteBody[] | Map<string, NoteBody>, mode: TabSortMode): SubTab[] {
  return sortNoteLocations(subTabs, noteBodies, mode)
}
