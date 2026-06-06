import { appendNoteFilterCount, getNoteFilterCountLabel } from '../filters/note-filter'

export function getVisibleNoteFilterCount(filterActive: boolean, count: number): number {
  return filterActive ? count : 0
}

export function appendVisibleNoteFilterCount(filterActive: boolean, label: string, count: number): string {
  return appendNoteFilterCount(label, getVisibleNoteFilterCount(filterActive, count))
}

export function getVisibleNoteFilterCountLabel(filterActive: boolean, count: number): string {
  const visibleCount = getVisibleNoteFilterCount(filterActive, count)
  return visibleCount > 0 ? getNoteFilterCountLabel(visibleCount) : ''
}
