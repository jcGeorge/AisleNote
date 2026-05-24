import {
  cloneNoteBodyAsIndependentCopy,
  cloneNoteBodyMetadataWithAisles,
  getAisleBodyId,
  getAisleMarkdown,
  syncNoteBodyAislesInState,
} from './aisle-body-state'
import { buildNoteLocationKey, getLocationInfo, updateNoteLocationBody } from './note-locations'
import { ensureNoteBodiesForAppState } from '../state/app-state'
import { createId, createTimestamp } from '../state/workspace'
import type { AppState, FrontmatterMeta, NoteAisle, NoteAisleBody, NoteBody, NoteCopyDestinationMode, NoteCopyMode, NoteLocation } from '../types/app'

export type ApplyNoteCopyResult =
  | { status: 'applied'; state: AppState; mode: NoteCopyMode }
  | { status: 'already-linked'; state: AppState; mode: NoteCopyMode }
  | { status: 'missing-target'; state: AppState; mode: NoteCopyMode }
  | { status: 'self-copy'; state: AppState; mode: NoteCopyMode }

type NoteCopyTarget = NoteLocation & { aisleIds?: string[] }

function getSelectedTargetAisles(targetBody: NoteBody, aisleIds: string[] | undefined): NoteAisle[] {
  return aisleIds && aisleIds.length > 0
    ? targetBody.aisles.filter((aisle) => aisleIds.includes(aisle.id))
    : targetBody.aisles
}

function cloneFrontmatterMeta(meta: FrontmatterMeta | undefined): FrontmatterMeta | undefined {
  if (!meta) return undefined
  return {
    ...meta,
    templateFieldOrigins: meta.templateFieldOrigins
      ? Object.fromEntries(Object.entries(meta.templateFieldOrigins).map(([key, origin]) => [key, { ...origin }]))
      : undefined,
    templateRemovedFieldIds: meta.templateRemovedFieldIds ? [...meta.templateRemovedFieldIds] : undefined,
    computedFields: meta.computedFields ? { ...meta.computedFields } : undefined,
    templateDetachedKeys: meta.templateDetachedKeys ? [...meta.templateDetachedKeys] : undefined,
  }
}

function createIndependentAisleCopies(
  sourceState: AppState,
  aisles: NoteAisle[],
): { aisles: NoteAisle[]; aisleBodies: NoteAisleBody[] } {
  const timestamp = createTimestamp()
  const sourceAisles = aisles.length > 0 ? aisles : [{ id: createId(), markdown: '' }]
  const aisleBodyMap = new Map((sourceState.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const aisleBodies = sourceAisles.map((aisle) => {
    const sourceBody = aisleBodyMap.get(getAisleBodyId(aisle))
    return {
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown: aisle.markdown,
      frontmatter: sourceBody?.frontmatter && typeof sourceBody.frontmatter === 'object'
        ? { ...sourceBody.frontmatter }
        : sourceBody?.frontmatter ?? null,
      frontmatterStatus: sourceBody?.frontmatterStatus ?? (sourceBody?.frontmatter ? 'valid' : 'none'),
      frontmatterParseError: sourceBody?.frontmatterParseError,
      frontmatterRaw: sourceBody?.frontmatterRaw,
      frontmatterMeta: cloneFrontmatterMeta(sourceBody?.frontmatterMeta),
    }
  })
  return {
    aisles: aisleBodies.map((aisleBody) => ({
      id: createId(),
      aisleBodyId: aisleBody.id,
      markdown: aisleBody.markdown,
    })),
    aisleBodies,
  }
}

function createLinkedAisleCopies(aisles: NoteAisle[]): NoteAisle[] {
  return aisles.length > 0
    ? aisles.map((aisle) => ({
        id: createId(),
        aisleBodyId: getAisleBodyId(aisle),
        markdown: aisle.markdown,
      }))
    : [{ id: createId(), aisleBodyId: createId(), markdown: '' }]
}

function resolveAisleMarkdowns(sourceState: AppState, aisles: NoteAisle[]): NoteAisle[] {
  return aisles.map((aisle) => ({
    ...aisle,
    aisleBodyId: getAisleBodyId(aisle),
    markdown: getAisleMarkdown(aisle, sourceState.noteAisleBodies),
  }))
}

function updateNoteBodyAisles(
  sourceState: AppState,
  noteBodyId: string,
  aisles: NoteAisle[],
  aisleBodies: NoteAisleBody[] = [],
): AppState {
  if (!sourceState.noteBodies.some((body) => body.id === noteBodyId)) return sourceState
  return syncNoteBodyAislesInState(
    { ...sourceState, noteAisleBodies: [...(sourceState.noteAisleBodies ?? []), ...aisleBodies] },
    noteBodyId,
    aisles,
  )
}

export function applyNoteCopyToState(
  sourceState: AppState,
  source: NoteLocation,
  target: NoteCopyTarget,
  mode: NoteCopyMode,
  destinationMode: NoteCopyDestinationMode = 'replace',
): ApplyNoteCopyResult {
  const isExactSelfCopy = buildNoteLocationKey(source) === buildNoteLocationKey(target)
  const hasSelectedAisles = Boolean(target.aisleIds && target.aisleIds.length > 0)
  if (isExactSelfCopy && destinationMode === 'replace' && !hasSelectedAisles) {
    return { status: 'self-copy', state: sourceState, mode }
  }

  const workingState = ensureNoteBodiesForAppState(sourceState)
  const sourceInfo = getLocationInfo(workingState, source)
  const targetInfo = getLocationInfo(workingState, target)
  if (!targetInfo.noteBodyId) {
    return { status: 'missing-target', state: workingState, mode }
  }
  const sourceBody = sourceInfo.noteBodyId
    ? workingState.noteBodies.find((candidate) => candidate.id === sourceInfo.noteBodyId) ?? null
    : null
  const targetBody = workingState.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId) ?? null
  const selectedAisles = targetBody ? resolveAisleMarkdowns(workingState, getSelectedTargetAisles(targetBody, target.aisleIds)) : []
  if ((destinationMode === 'append' || hasSelectedAisles) && (!sourceBody || !targetBody || selectedAisles.length === 0)) {
    return { status: 'missing-target', state: workingState, mode }
  }

  if (mode === 'linked' && destinationMode === 'replace' && !hasSelectedAisles) {
    if (sourceInfo.noteBodyId && sourceInfo.noteBodyId === targetInfo.noteBodyId) {
      return { status: 'already-linked', state: sourceState, mode }
    }

    return {
      status: 'applied',
      state: updateNoteLocationBody(workingState, source, targetInfo.noteBodyId),
      mode,
    }
  }

  if (!targetBody) {
    return { status: 'missing-target', state: workingState, mode }
  }

  if (destinationMode === 'append') {
    if (!sourceBody || !sourceInfo.noteBodyId) return { status: 'missing-target', state: workingState, mode }
    const copied = mode === 'linked'
      ? { aisles: createLinkedAisleCopies(selectedAisles), aisleBodies: [] }
      : createIndependentAisleCopies(workingState, selectedAisles)
    return {
      status: 'applied',
      state: updateNoteBodyAisles(
        workingState,
        sourceInfo.noteBodyId,
        [...sourceBody.aisles, ...copied.aisles],
        copied.aisleBodies,
      ),
      mode,
    }
  }

  if (hasSelectedAisles) {
    if (!sourceBody) return { status: 'missing-target', state: workingState, mode }
    const copied = mode === 'linked'
      ? { aisles: createLinkedAisleCopies(selectedAisles), aisleBodies: [] }
      : createIndependentAisleCopies(workingState, selectedAisles)
    const copiedBody = cloneNoteBodyMetadataWithAisles(sourceBody, copied.aisles)
    return {
      status: 'applied',
      state: updateNoteLocationBody(
        {
          ...workingState,
          noteBodies: [...workingState.noteBodies, copiedBody],
          noteAisleBodies: [...(workingState.noteAisleBodies ?? []), ...copied.aisleBodies],
        },
        source,
        copiedBody.id,
      ),
      mode,
    }
  }

  const copied = cloneNoteBodyAsIndependentCopy(targetBody, workingState.noteAisleBodies)
  return {
    status: 'applied',
    state: updateNoteLocationBody(
      {
        ...workingState,
        noteBodies: [...workingState.noteBodies, copied.body],
        noteAisleBodies: [...(workingState.noteAisleBodies ?? []), ...copied.aisleBodies],
      },
      source,
      copied.body.id,
    ),
    mode,
  }
}
