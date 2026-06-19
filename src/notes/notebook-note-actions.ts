import type { AppState, NoteAisle, NoteAisleBody, NoteBody, NoteLocation } from '../types/app'
import { MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { createReservedIdAllocator, type IdGenerator } from '../state/navigation-ids'
import {
  collectNotebookIds,
  findNotebookNote,
  listNotebookNotes,
  replaceNotebookNoteBodyId,
} from '../state/notebook'
import { buildInternalNoteLinkToken, buildPreviewToken } from './note-references'
import { getNotebookNotePathLabel } from '../state/notebook'
import { getLocationInfo, listNoteLocationsForBody } from './note-locations'

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

export type NotebookDecoupleRow = {
  key: string
  label: string
  noteId: string
  noteBodyId: string
  aisleId?: string
  aisleBodyId?: string
}

const TARGET_NOTE_MISSING_MESSAGE = 'Choose a notebook note that still exists.'
const ACTIVE_NOTE_MISSING_MESSAGE = 'Open a note before using note actions.'
const MAX_AISLE_COPY_MESSAGE = `That copy would exceed the ${MAX_NOTE_AISLES} aisle limit for a note.`

function nowIso(): string {
  return new Date().toISOString()
}

function getNoteBody(state: AppState, noteBodyId: string): NoteBody | null {
  return state.noteBodies.find((body) => body.id === noteBodyId) ?? null
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
): string {
  return kind === 'note-preview'
    ? buildPreviewToken(state, { id: `preview:${target.noteId}`, target })
    : buildInternalNoteLinkToken(state, target)
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
  return listNoteLocationsForBody(state, noteBodyId).map((location) => ({
    key: location.noteId,
    label: location.label || location.title,
    noteId: location.noteId,
    noteBodyId,
  }))
}

export function getNotebookAisleDecoupleRows(state: AppState, aisleBodyId: string): NotebookDecoupleRow[] {
  const rows: NotebookDecoupleRow[] = []
  for (const { note } of listNotebookNotes(state.notebook.items)) {
    const noteBody = getNoteBody(state, note.noteBodyId)
    if (!noteBody) continue
    noteBody.aisles.forEach((aisle, index) => {
      if (aisle.aisleBodyId !== aisleBodyId) return
      const noteLabel = getNotebookNotePathLabel(state.notebook.items, note.id) || note.title
      rows.push({
        key: `${note.id}:${aisle.id}`,
        label: noteBody.aisles.length > 1 ? `${noteLabel} / aisle ${index + 1}` : noteLabel,
        noteId: note.id,
        noteBodyId: noteBody.id,
        aisleId: aisle.id,
        aisleBodyId,
      })
    })
  }
  return rows
}

export function getNotePreviewRenderMarkdown(state: AppState, target: NoteLocation, blockedNoteBodyId = ''): {
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
  return {
    status: 'ok',
    title: info.title,
    breadcrumb: getNotebookNotePathLabel(state.notebook.items, target.noteId),
    markdown: targetBody.aisles.map((aisle) => sourceBodies.get(aisle.aisleBodyId) ?? '').join('\n\n'),
  }
}
