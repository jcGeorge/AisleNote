import { EDITOR_BLANK_LINE_PLACEHOLDER, normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  cloneAisles,
  getAisleSignature,
  getAisleStructureSignature,
  resolveNoteAisles,
  syncNoteBodyAisleStructureInState,
  syncNoteBodyAislesInState,
} from '../notes/aisle-body-state'
import {
  applyCursorLocationSnapshot,
  applyNoteLocationToState,
} from '../notes/note-state'
import { setScratchpadActiveAisleId } from '../state/scratchpad'
import type { AppState, NoteAisle, NoteCursorLocation, NoteLocation, ResolvedNoteAisle } from '../types/app'

export type AisleStructuralSnapshot = {
  scope?: 'note' | 'scratchpad'
  location?: NoteLocation
  locationKey: string
  noteBodyId: string
  aisles: ResolvedNoteAisle[]
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

export function getResolvedAislesForStructuralSnapshot(sourceState: AppState, noteBodyId: string): ResolvedNoteAisle[] | null {
  const body = sourceState.noteBodies.find((candidate) => candidate.id === noteBodyId) ?? null
  return body ? cloneAisles(body.aisles, sourceState.noteAisleBodies) : null
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
  const normalized = normalizeMarkdownForPersistence(value)
  const hasMeaningfulContent = normalized.split('\n').some((line) => {
    const withoutBlankPlaceholders = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
    return withoutBlankPlaceholders.trim().length > 0
  })
  return hasMeaningfulContent ? normalized : ''
}

function hasSameAisleOrder(left: NoteAisle[], right: NoteAisle[]) {
  return getAisleStructureSignature(left) === getAisleStructureSignature(right)
}

function hasAisleBodyIdChanges(left: NoteAisle[], right: NoteAisle[]) {
  const leftBodyIdByAisleId = new Map(left.map((aisle) => [aisle.id, aisle.aisleBodyId ?? aisle.id]))
  return right.some((aisle) => {
    const leftBodyId = leftBodyIdByAisleId.get(aisle.id)
    return leftBodyId !== undefined && leftBodyId !== (aisle.aisleBodyId ?? aisle.id)
  })
}

export function canApplyAisleStructuralEntryToAisles(
  entry: AisleStructuralHistoryEntry,
  direction: 'undo' | 'redo',
  currentAisles: ResolvedNoteAisle[],
) {
  const source = getAisleStructuralSourceSnapshot(entry, direction)
  const target = getAisleStructuralTargetSnapshot(entry, direction)
  if (getAisleSignature(currentAisles) === getAisleSignature(source.aisles)) return true
  if (!hasSameAisleOrder(currentAisles, source.aisles)) return false
  if (hasAisleBodyIdChanges(source.aisles, target.aisles)) return false

  if (entry.type !== 'add-aisle') return true

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

export function applyAisleStructuralEntryToState(
  previous: AppState,
  entry: AisleStructuralHistoryEntry,
  direction: 'undo' | 'redo',
): AppState | null {
  const body = previous.noteBodies.find((candidate) => candidate.id === entry.noteBodyId) ?? null
  if (!body) return null

  const currentAisles = resolveNoteAisles(body.aisles, previous.noteAisleBodies)
  if (!canApplyAisleStructuralEntryToAisles(entry, direction, currentAisles)) return null

  const target = getAisleStructuralTargetSnapshot(entry, direction)
  const withAisles = entry.type === 'add-aisle'
    ? syncNoteBodyAislesInState(previous, entry.noteBodyId, target.aisles)
    : syncNoteBodyAisleStructureInState(previous, entry.noteBodyId, target.aisles)
  const withLocation = target.scope === 'scratchpad' || !target.location
    ? setScratchpadActiveAisleId(withAisles, target.activeAisleId)
    : applyNoteLocationToState(withAisles, target.location)
  return applyCursorLocationSnapshot(withLocation, target.locationKey, target.cursorLocation)
}
