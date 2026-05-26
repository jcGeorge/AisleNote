import { getHeadingOutlineFromMarkdown, type HeadingOutlineItem } from '../editor/heading-outline'
import type { AppState, NoteAisle, NoteBody, NoteHeadingAnchor, NoteLocation, NotePreviewStart } from '../types/app'
import { getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'

export type NoteReferenceTarget = NoteLocation & {
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  previewStart?: NotePreviewStart
}

export type ResolvedNoteReferenceTarget = {
  target: NoteReferenceTarget
  noteBody: NoteBody | null
  selectedAisle: NoteAisle | null
  headings: HeadingOutlineItem[]
}

function getTargetBody(sourceState: AppState, target: NoteLocation) {
  const targetInfo = getLocationInfo(sourceState, target)
  return targetInfo.noteBodyId
    ? sourceState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
    : null
}

function getSelectedAisle(body: NoteBody | null, target: NoteReferenceTarget) {
  if (!body || body.aisles.length === 0) return null
  const selectedAisleId = target.aisleIds?.[0] ?? target.heading?.aisleId ?? ''
  return body.aisles.find((aisle) => aisle.id === selectedAisleId) ?? body.aisles[0] ?? null
}

export function getHeadingOutlineForNoteReferenceAisle(
  sourceState: AppState,
  aisle: NoteAisle | null,
): HeadingOutlineItem[] {
  return aisle ? getHeadingOutlineFromMarkdown(aisle.id, getAisleMarkdown(aisle, sourceState.noteAisleBodies)) : []
}

export function resolveNoteReferenceTarget(
  sourceState: AppState,
  target: NoteReferenceTarget,
): ResolvedNoteReferenceTarget {
  const noteBody = getTargetBody(sourceState, target)
  const selectedAisle = getSelectedAisle(noteBody, target)
  const headings = getHeadingOutlineForNoteReferenceAisle(sourceState, selectedAisle)
  const heading =
    selectedAisle &&
    target.heading?.aisleId === selectedAisle.id &&
    headings.some((candidate) => candidate.key === target.heading?.headingKey)
      ? target.heading
      : undefined
  const previewStart = heading ? undefined : target.previewStart === 'last-position' ? target.previewStart : undefined

  return {
    target: {
      ...target,
      aisleIds: selectedAisle ? [selectedAisle.id] : undefined,
      heading,
      previewStart,
    },
    noteBody,
    selectedAisle,
    headings,
  }
}

export function normalizeNoteReferenceTarget(sourceState: AppState, target: NoteReferenceTarget): NoteReferenceTarget {
  return resolveNoteReferenceTarget(sourceState, target).target
}
