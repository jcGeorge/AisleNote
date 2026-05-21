import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getAisleSignature, getAisleStructureSignature } from '../notes/note-state'
import type { NoteAisle, NoteCursorLocation, NoteLocation } from '../types/app'

export type AisleStructuralSnapshot = {
  location: NoteLocation
  locationKey: string
  noteBodyId: string
  aisles: NoteAisle[]
  activeAisleId: string
  cursorLocation: NoteCursorLocation | null
}

export type AisleStructuralHistoryEntry = {
  type: 'add-aisle' | 'delete-aisle' | 'edit-aisles'
  noteBodyId: string
  before: AisleStructuralSnapshot
  after: AisleStructuralSnapshot
  beforeSignature: string
  afterSignature: string
}

export function createAisleStructuralHistoryEntry(
  type: AisleStructuralHistoryEntry['type'],
  before: AisleStructuralSnapshot,
  after: AisleStructuralSnapshot,
): AisleStructuralHistoryEntry {
  return {
    type,
    noteBodyId: before.noteBodyId,
    before,
    after,
    beforeSignature: getAisleSignature(before.aisles),
    afterSignature: getAisleSignature(after.aisles),
  }
}

export function getAisleStructuralSourceSnapshot(
  entry: AisleStructuralHistoryEntry,
  direction: 'undo' | 'redo',
) {
  return direction === 'undo' ? entry.after : entry.before
}

export function getAisleStructuralTargetSnapshot(
  entry: AisleStructuralHistoryEntry,
  direction: 'undo' | 'redo',
) {
  return direction === 'undo' ? entry.before : entry.after
}

function normalizedMarkdown(value: string) {
  return normalizeMarkdownForPersistence(value)
}

function hasSameAisleOrder(left: NoteAisle[], right: NoteAisle[]) {
  return getAisleStructureSignature(left) === getAisleStructureSignature(right)
}

export function canApplyAisleStructuralEntryToAisles(
  entry: AisleStructuralHistoryEntry,
  direction: 'undo' | 'redo',
  currentAisles: NoteAisle[],
) {
  const source = getAisleStructuralSourceSnapshot(entry, direction)
  const target = getAisleStructuralTargetSnapshot(entry, direction)
  if (getAisleSignature(currentAisles) === getAisleSignature(source.aisles)) return true
  if (!hasSameAisleOrder(currentAisles, source.aisles)) return false

  if (entry.type !== 'add-aisle' || direction !== 'undo') return true

  const sourceById = new Map(source.aisles.map((aisle) => [aisle.id, normalizedMarkdown(aisle.markdown)]))
  const targetById = new Map(target.aisles.map((aisle) => [aisle.id, normalizedMarkdown(aisle.markdown)]))

  return currentAisles.every((aisle) => {
    const currentMarkdown = normalizedMarkdown(aisle.markdown)
    const sourceMarkdown = sourceById.get(aisle.id)
    if (sourceMarkdown === undefined) return false
    const targetMarkdown = targetById.get(aisle.id)
    if (targetMarkdown === undefined) return currentMarkdown === sourceMarkdown
    return currentMarkdown === sourceMarkdown || currentMarkdown === targetMarkdown
  })
}
