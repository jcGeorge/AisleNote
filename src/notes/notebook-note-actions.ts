import type { AppState, NoteAisle, NoteAisleBody, NoteBody, NoteLocation } from '../types/app'
import { MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { createReservedIdAllocator, type IdGenerator } from '../state/navigation-ids'
import {
  collectNotebookIds,
  createNoteBodyWithAisle,
  findNotebookNote,
  replaceNotebookNoteBodyId,
} from '../state/notebook'
import { buildInternalNoteLinkToken, buildMarkdownNoteReferenceToken, buildPreviewToken, parseMarkdownNoteReferenceToken } from './note-references'
import { getNotebookNotePathLabel } from '../state/notebook'
import { buildNoteLocationKey, getLocationInfo, listNoteLocationsForBody } from './note-locations'
import { listLinkedAisleSlotsForAisleBody } from './aisle-links'

export type NotebookNoteReferenceActionKind = 'note-link' | 'note-preview'
export type NotebookNoteCopyMode = 'independent' | 'synced'

export type NotebookNoteActionResult =
  | {
      status: 'ok'
      state: AppState
      activeAisleId?: string
    }
  | {
      status: 'blocked'
      message: string
    }

export type DecoupleNotebookNoteLocationsResult =
  | { status: 'applied'; state: AppState; changedCount: number }
  | { status: 'blocked'; state: AppState; message: string }

export type NotebookDecoupleRow = {
  key: string
  label: string
  primaryLabel: string
  secondaryLabel: string
  noteId: string
  noteBodyId: string
  aisleId?: string
  aisleBodyId?: string
}

const TARGET_NOTE_MISSING_MESSAGE = 'Choose a notebook note that still exists.'
const ACTIVE_NOTE_MISSING_MESSAGE = 'Open a note before using note actions.'
const MAX_AISLE_COPY_MESSAGE = `That copy would exceed the ${MAX_NOTE_AISLES} aisle limit for a note.`
const ROOT_NOTEBOOK_LABEL = 'Notebook'

function nowIso(): string {
  return new Date().toISOString()
}

function getNoteBody(state: AppState, noteBodyId: string): NoteBody | null {
  return state.noteBodies.find((body) => body.id === noteBodyId) ?? null
}

function formatNotebookFolderLabel(folderPath: string): string {
  return folderPath
    ? folderPath.split('/').filter(Boolean).join(' > ')
    : ROOT_NOTEBOOK_LABEL
}

function cloneAisleBody(source: NoteAisleBody | undefined, id: string, timestamp: string): NoteAisleBody {
  return {
    ...(source ?? { markdown: '' }),
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: source?.tags ? [...source.tags] : source?.tags,
    frontmatter:
      source?.frontmatter && typeof source.frontmatter === 'object'
        ? { ...source.frontmatter }
        : source?.frontmatter ?? null,
    frontmatterMeta:
      source?.frontmatterMeta && typeof source.frontmatterMeta === 'object'
        ? { ...source.frontmatterMeta }
        : source?.frontmatterMeta,
  }
}

function buildReplacementAisles(
  state: AppState,
  targetBody: NoteBody,
  mode: NotebookNoteCopyMode,
  idGenerator: IdGenerator,
): { aisles: NoteAisle[]; aisleBodies: NoteAisleBody[] } {
  if (mode === 'synced') {
    return {
      aisles: targetBody.aisles.map((aisle) => ({
        id: idGenerator(),
        aisleBodyId: aisle.aisleBodyId,
      })),
      aisleBodies: [],
    }
  }

  const timestamp = nowIso()
  const sourceBodies = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const aisleBodies: NoteAisleBody[] = []
  const aisles = targetBody.aisles.map((aisle) => {
    const aisleBodyId = idGenerator()
    aisleBodies.push(cloneAisleBody(sourceBodies.get(aisle.aisleBodyId), aisleBodyId, timestamp))
    return {
      id: idGenerator(),
      aisleBodyId,
    }
  })
  return { aisles, aisleBodies }
}

function buildClonedNoteBody(
  state: AppState,
  targetBody: NoteBody,
  idGenerator: IdGenerator,
): { noteBody: NoteBody; aisleBodies: NoteAisleBody[] } {
  const timestamp = nowIso()
  const replacement = buildReplacementAisles(state, targetBody, 'independent', idGenerator)
  return {
    noteBody: {
      ...targetBody,
      id: idGenerator(),
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles: replacement.aisles,
    },
    aisleBodies: replacement.aisleBodies,
  }
}

export function buildNotebookNoteReferenceInsertionText(
  state: AppState,
  target: NoteLocation,
  kind: NotebookNoteReferenceActionKind,
  options: { aisleId?: string } = {},
): string {
  if (kind !== 'note-preview') return buildInternalNoteLinkToken(state, target)

  const info = getLocationInfo(state, target)
  const targetBody = getNoteBody(state, info.noteBodyId)
  const selectedAisle = targetBody?.aisles.find((aisle) => aisle.id === options.aisleId) ?? targetBody?.aisles[0] ?? null
  const token = buildPreviewToken(state, {
    id: `preview:${target.noteId}${selectedAisle ? `:${selectedAisle.id}` : ''}`,
    target,
    ...(selectedAisle ? { aisleIds: [selectedAisle.id] } : {}),
  })
  const parsed = parseMarkdownNoteReferenceToken(token)
  return parsed ? buildMarkdownNoteReferenceToken({ embed: true, target: parsed.target, label: info.title }) : token
}

export function replaceFocusedAisleFromTargetNote(
  state: AppState,
  options: {
    activeNoteId: string
    focusedAisleId: string
    targetNoteId: string
    mode: NotebookNoteCopyMode
    idGenerator?: IdGenerator
  },
): NotebookNoteActionResult {
  const activePath = findNotebookNote(state.notebook.items, options.activeNoteId)
  const targetPath = findNotebookNote(state.notebook.items, options.targetNoteId)
  if (!activePath) return { status: 'blocked', message: ACTIVE_NOTE_MISSING_MESSAGE }
  if (!targetPath || targetPath.note.id === activePath.note.id) {
    return { status: 'blocked', message: TARGET_NOTE_MISSING_MESSAGE }
  }

  const activeBody = getNoteBody(state, activePath.note.noteBodyId)
  const targetBody = getNoteBody(state, targetPath.note.noteBodyId)
  if (!activeBody) return { status: 'blocked', message: ACTIVE_NOTE_MISSING_MESSAGE }
  if (!targetBody) return { status: 'blocked', message: TARGET_NOTE_MISSING_MESSAGE }

  const focusedIndex = activeBody.aisles.findIndex((aisle) => aisle.id === options.focusedAisleId)
  if (focusedIndex < 0) return { status: 'blocked', message: 'Focus an aisle before using copy actions.' }
  if (activeBody.aisles.length - 1 + targetBody.aisles.length > MAX_NOTE_AISLES) {
    return { status: 'blocked', message: MAX_AISLE_COPY_MESSAGE }
  }

  const idGenerator = options.idGenerator ?? createReservedIdAllocator(collectNotebookIds(state))
  const replacement = buildReplacementAisles(state, targetBody, options.mode, idGenerator)
  const nextBody: NoteBody = {
    ...activeBody,
    updatedAt: nowIso(),
    aisles: [
      ...activeBody.aisles.slice(0, focusedIndex),
      ...replacement.aisles,
      ...activeBody.aisles.slice(focusedIndex + 1),
    ],
  }

  return {
    status: 'ok',
    state: {
      ...state,
      noteBodies: state.noteBodies.map((body) => (body.id === activeBody.id ? nextBody : body)),
      noteAisleBodies: [...(state.noteAisleBodies ?? []), ...replacement.aisleBodies],
    },
    activeAisleId: replacement.aisles[0]?.id,
  }
}

export function replaceActiveNoteBodyFromTargetNote(
  state: AppState,
  options: {
    activeNoteId: string
    targetNoteId: string
    mode: NotebookNoteCopyMode
    idGenerator?: IdGenerator
  },
): NotebookNoteActionResult {
  const activePath = findNotebookNote(state.notebook.items, options.activeNoteId)
  const targetPath = findNotebookNote(state.notebook.items, options.targetNoteId)
  if (!activePath) return { status: 'blocked', message: ACTIVE_NOTE_MISSING_MESSAGE }
  if (!targetPath || targetPath.note.id === activePath.note.id) {
    return { status: 'blocked', message: TARGET_NOTE_MISSING_MESSAGE }
  }

  const targetBody = getNoteBody(state, targetPath.note.noteBodyId)
  if (!targetBody) return { status: 'blocked', message: TARGET_NOTE_MISSING_MESSAGE }

  if (options.mode === 'synced') {
    return {
      status: 'ok',
      state: {
        ...state,
        notebook: replaceNotebookNoteBodyId(state.notebook, activePath.note.id, targetBody.id),
      },
      activeAisleId: targetBody.aisles[0]?.id,
    }
  }

  const idGenerator = options.idGenerator ?? createReservedIdAllocator(collectNotebookIds(state))
  const cloned = buildClonedNoteBody(state, targetBody, idGenerator)
  return {
    status: 'ok',
    state: {
      ...state,
      notebook: replaceNotebookNoteBodyId(state.notebook, activePath.note.id, cloned.noteBody.id),
      noteBodies: [...state.noteBodies, cloned.noteBody],
      noteAisleBodies: [...(state.noteAisleBodies ?? []), ...cloned.aisleBodies],
    },
    activeAisleId: cloned.noteBody.aisles[0]?.id,
  }
}

export function getNotebookNoteDecoupleRows(state: AppState, noteBodyId: string): NotebookDecoupleRow[] {
  return listNoteLocationsForBody(state, noteBodyId).map((location) => {
    const info = getLocationInfo(state, location)
    return {
      key: buildNoteLocationKey(location),
      label: location.label || location.title,
      primaryLabel: formatNotebookFolderLabel(info.folderPath),
      secondaryLabel: info.title,
      noteId: location.noteId,
      noteBodyId,
    }
  })
}

export function decoupleNotebookNoteLocationsInState(
  state: AppState,
  noteBodyId: string,
  keepLocationKeys: Set<string>,
  keepData: boolean,
  idGenerator: IdGenerator = createReservedIdAllocator(collectNotebookIds(state)),
): DecoupleNotebookNoteLocationsResult {
  const locations = listNoteLocationsForBody(state, noteBodyId)
  if (locations.length <= 0) {
    return { status: 'blocked', state, message: 'Synced note no longer exists.' }
  }
  if (!locations.some((location) => keepLocationKeys.has(buildNoteLocationKey(location)))) {
    return { status: 'blocked', state, message: 'Select at least one note to retain the information.' }
  }

  const locationsToDecouple = locations.filter((location) => !keepLocationKeys.has(buildNoteLocationKey(location)))
  if (locationsToDecouple.length <= 0) return { status: 'applied', state, changedCount: 0 }

  const sourceBody = getNoteBody(state, noteBodyId)
  let notebook = state.notebook
  const noteBodies: NoteBody[] = []
  const aisleBodies: NoteAisleBody[] = []

  for (const location of locationsToDecouple) {
    const cloned = keepData && sourceBody
      ? buildClonedNoteBody(state, sourceBody, idGenerator)
      : (() => {
          const created = createNoteBodyWithAisle('', idGenerator)
          return {
            noteBody: created.noteBody,
            aisleBodies: [created.aisleBody],
          }
        })()
    noteBodies.push(cloned.noteBody)
    aisleBodies.push(...cloned.aisleBodies)
    notebook = replaceNotebookNoteBodyId(notebook, location.noteId, cloned.noteBody.id)
  }

  return {
    status: 'applied',
    changedCount: locationsToDecouple.length,
    state: {
      ...state,
      notebook,
      noteBodies: [...state.noteBodies, ...noteBodies],
      noteAisleBodies: [...(state.noteAisleBodies ?? []), ...aisleBodies],
    },
  }
}

export function getNotebookAisleDecoupleRows(state: AppState, aisleBodyId: string): NotebookDecoupleRow[] {
  return listLinkedAisleSlotsForAisleBody(state, aisleBodyId).map((slot) => ({
    key: slot.key,
    label: slot.label,
    primaryLabel: formatNotebookFolderLabel(slot.parentName),
    secondaryLabel: `${slot.noteName} / aisle ${slot.aisleIndex + 1}`,
    noteId: slot.locationKey,
    noteBodyId: slot.noteBodyId,
    aisleId: slot.aisleId,
    aisleBodyId,
  }))
}

export function getNotePreviewRenderMarkdown(
  state: AppState,
  target: NoteLocation,
  blockedNoteBodyId = '',
  aisleIds: string[] = [],
): {
  status: 'ok' | 'missing' | 'blocked'
  title: string
  breadcrumb: string
  markdown: string
} {
  const info = getLocationInfo(state, target)
  const targetBody = getNoteBody(state, info.noteBodyId)
  if (!info.note || !targetBody) {
    return { status: 'missing', title: 'Missing note', breadcrumb: '', markdown: '' }
  }
  if (blockedNoteBodyId && info.noteBodyId === blockedNoteBodyId) {
    return {
      status: 'blocked',
      title: info.title,
      breadcrumb: getNotebookNotePathLabel(state.notebook.items, target.noteId),
      markdown: '',
    }
  }
  const sourceBodies = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body.markdown]))
  const selectedAisleId = aisleIds[0] ?? ''
  const selectedAisle = targetBody.aisles.find((aisle) => aisle.id === selectedAisleId) ?? targetBody.aisles[0] ?? null
  return {
    status: 'ok',
    title: info.title,
    breadcrumb: getNotebookNotePathLabel(state.notebook.items, target.noteId),
    markdown: selectedAisle ? sourceBodies.get(selectedAisle.aisleBodyId) ?? '' : '',
  }
}
