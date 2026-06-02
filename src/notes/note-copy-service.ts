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
import { getAisleBodyTags } from '../tags/tags.js'
import type { AppState, FrontmatterMeta, NoteAisle, NoteAisleBody, NoteBody, NoteCopyDestinationMode, NoteCopyMode, NoteLocation, ResolvedNoteAisle } from '../types/app'
import { ensureScratchpadInAppState, getScratchpadNoteBody } from '../state/scratchpad'

export type ApplyNoteCopyResult =
  | { status: 'applied'; state: AppState; mode: NoteCopyMode }
  | { status: 'already-linked'; state: AppState; mode: NoteCopyMode }
  | { status: 'missing-target'; state: AppState; mode: NoteCopyMode }
  | { status: 'self-copy'; state: AppState; mode: NoteCopyMode }

export type StructuralAisleCopyPayload = {
  scope: 'note' | 'aisle'
  action: 'copy' | 'duplicate'
  source: NoteLocation
  aisleId?: string
}

export type MaterializeStructuralAisleCopiesResult =
  | {
      status: 'applied'
      mode: NoteCopyMode
      aisles: ResolvedNoteAisle[]
      aisleBodies: NoteAisleBody[]
    }
  | {
      status: 'blocked'
      mode: NoteCopyMode
      message: string
    }

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
  }
}

function createIndependentAisleCopies(
  sourceState: AppState,
  aisles: ResolvedNoteAisle[],
): { aisles: NoteAisle[]; aisleBodies: NoteAisleBody[] } {
  const timestamp = createTimestamp()
  const fallbackAisleBodyId = createId()
  const sourceAisles = aisles.length > 0 ? aisles : [{ id: createId(), aisleBodyId: fallbackAisleBodyId, markdown: '' }]
  const aisleBodyMap = new Map((sourceState.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const aisleBodies = sourceAisles.map((aisle) => {
    const sourceBody = aisleBodyMap.get(getAisleBodyId(aisle))
    return {
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown: aisle.markdown,
      tags: getAisleBodyTags(sourceBody ?? aisle),
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
    })),
    aisleBodies,
  }
}

function createLinkedAisleCopies(aisles: ResolvedNoteAisle[]): NoteAisle[] {
  return aisles.length > 0
    ? aisles.map((aisle) => ({
        id: createId(),
        aisleBodyId: getAisleBodyId(aisle),
      }))
    : [{ id: createId(), aisleBodyId: createId() }]
}

function resolveAisleMarkdowns(sourceState: AppState, aisles: NoteAisle[]): ResolvedNoteAisle[] {
  return aisles.map((aisle) => ({
    ...aisle,
    aisleBodyId: getAisleBodyId(aisle),
    markdown: getAisleMarkdown(aisle, sourceState.noteAisleBodies),
  }))
}

export function materializeStructuralAisleCopiesForInsertion(
  sourceState: AppState,
  payload: StructuralAisleCopyPayload,
): MaterializeStructuralAisleCopiesResult {
  const mode: NoteCopyMode = payload.action === 'duplicate' ? 'linked' : 'independent'
  const workingState = ensureNoteBodiesForAppState(sourceState)
  const sourceInfo = getLocationInfo(workingState, payload.source)
  const sourceBody = sourceInfo.noteBodyId
    ? workingState.noteBodies.find((candidate) => candidate.id === sourceInfo.noteBodyId) ?? null
    : null
  if (!sourceInfo.noteBodyId || !sourceBody) {
    return { status: 'blocked', mode, message: 'copied note no longer exists.' }
  }

  const selectedSourceAisles =
    payload.scope === 'aisle'
      ? sourceBody.aisles.filter((aisle) => aisle.id === payload.aisleId)
      : sourceBody.aisles
  if (selectedSourceAisles.length <= 0) {
    return { status: 'blocked', mode, message: 'copied aisle no longer exists.' }
  }

  const resolvedSourceAisles = resolveAisleMarkdowns(workingState, selectedSourceAisles)
  const copied = mode === 'linked'
    ? { aisles: createLinkedAisleCopies(resolvedSourceAisles), aisleBodies: [] }
    : createIndependentAisleCopies(workingState, resolvedSourceAisles)
  const stateWithCopiedBodies = copied.aisleBodies.length > 0
    ? { ...workingState, noteAisleBodies: [...(workingState.noteAisleBodies ?? []), ...copied.aisleBodies] }
    : workingState

  return {
    status: 'applied',
    mode,
    aisles: resolveAisleMarkdowns(stateWithCopiedBodies, copied.aisles),
    aisleBodies: copied.aisleBodies,
  }
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

export function applyIndependentCopyToScratchpad(
  sourceState: AppState,
  target: NoteCopyTarget,
  destinationMode: NoteCopyDestinationMode = 'replace',
  maxAisles = Number.POSITIVE_INFINITY,
): ApplyNoteCopyResult {
  const workingState = ensureScratchpadInAppState(ensureNoteBodiesForAppState(sourceState))
  const targetInfo = getLocationInfo(workingState, target)
  const targetBody = targetInfo.noteBodyId
    ? workingState.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId) ?? null
    : null
  const scratchpadBody = getScratchpadNoteBody(workingState)
  if (!targetInfo.noteBodyId || !targetBody || !scratchpadBody) {
    return { status: 'missing-target', state: workingState, mode: 'independent' }
  }

  const selectedAisles = resolveAisleMarkdowns(workingState, getSelectedTargetAisles(targetBody, target.aisleIds))
  if (selectedAisles.length === 0) return { status: 'missing-target', state: workingState, mode: 'independent' }
  if (destinationMode === 'append' && scratchpadBody.aisles.length + selectedAisles.length > maxAisles) {
    return { status: 'missing-target', state: workingState, mode: 'independent' }
  }
  const copied = createIndependentAisleCopies(workingState, selectedAisles)
  const nextAisles = destinationMode === 'append' ? [...scratchpadBody.aisles, ...copied.aisles] : copied.aisles
  return {
    status: 'applied',
    state: ensureScratchpadInAppState(updateNoteBodyAisles(
      {
        ...workingState,
        noteAisleBodies: [...(workingState.noteAisleBodies ?? []), ...copied.aisleBodies],
      },
      scratchpadBody.id,
      nextAisles,
    )),
    mode: 'independent',
  }
}
