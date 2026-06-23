import type { AppState, NoteAisle, NoteAisleBody, NoteBody } from '../types/app'
import { MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { createReservedIdAllocator, type IdGenerator } from '../state/navigation-ids'
import { collectNotebookIds, findNotebookNote, getNotebookNotePathLabel } from '../state/notebook'

export const AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME = 'application/x-aislenote-notebook-structure'

export type NotebookStructureClipboardKind = 'note' | 'aisle'
export type NotebookStructureClipboardMode = 'independent' | 'synced'

export type NotebookStructureClipboardAisle = {
  aisleId: string
  aisleBodyId: string
  markdown: string
  body?: NoteAisleBody
}

export type NotebookStructureClipboardPayload = {
  version: 1
  kind: NotebookStructureClipboardKind
  mode: NotebookStructureClipboardMode
  source: {
    noteId: string
    noteTitle: string
    noteBodyId: string
    label: string
    aisleId?: string
  }
  aisles: NotebookStructureClipboardAisle[]
}

export type NotebookStructureClipboardBuildResult =
  | { status: 'ok'; payload: NotebookStructureClipboardPayload; markdown: string }
  | { status: 'blocked'; message: string }

export type NotebookStructureClipboardApplyResult =
  | { status: 'ok'; state: AppState; activeAisleId?: string }
  | { status: 'blocked'; message: string }

export const NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_NOTE_MISSING_MESSAGE = 'Open a note before copying note content.'
export const NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_AISLE_MISSING_MESSAGE = 'Choose an aisle to copy.'
export const NOTEBOOK_STRUCTURE_CLIPBOARD_STALE_SYNCED_MESSAGE =
  'That synced copy references note content that no longer exists in this notebook.'
export const NOTEBOOK_STRUCTURE_CLIPBOARD_MAX_AISLES_MESSAGE =
  `That paste would exceed the ${MAX_NOTE_AISLES} aisle limit for a note.`

type DataTransferReadLike = Pick<DataTransfer, 'getData'> | null | undefined

let rememberedClipboard: { payload: NotebookStructureClipboardPayload; markdown: string } | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function getNoteBody(state: AppState, noteBodyId: string): NoteBody | null {
  return state.noteBodies.find((body) => body.id === noteBodyId) ?? null
}

function getAisleBodyMap(state: AppState): Map<string, NoteAisleBody> {
  return new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((entry) => cloneJsonLike(entry)) as T
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneJsonLike(entry)]),
    ) as T
  }
  return value
}

function cloneAisleBodySnapshot(body: NoteAisleBody | undefined, fallbackMarkdown: string): NoteAisleBody {
  return {
    ...(body ? cloneJsonLike(body) : { markdown: fallbackMarkdown }),
    id: body?.id ?? '',
    markdown: body?.markdown ?? fallbackMarkdown,
  }
}

function cloneAisleBodyForPaste(snapshot: NoteAisleBody | undefined, id: string, markdown: string): NoteAisleBody {
  const timestamp = nowIso()
  return {
    ...(snapshot ? cloneJsonLike(snapshot) : { markdown }),
    id,
    markdown: snapshot?.markdown ?? markdown,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function buildFallbackMarkdown(aisles: NotebookStructureClipboardAisle[]): string {
  return aisles.map((aisle) => aisle.markdown).join('\n\n')
}

function buildPayloadFromAisles(
  state: AppState,
  options: {
    noteId: string
    noteBody: NoteBody
    noteTitle: string
    label: string
    kind: NotebookStructureClipboardKind
    mode: NotebookStructureClipboardMode
    aisles: NoteAisle[]
    sourceAisleId?: string
  },
): NotebookStructureClipboardBuildResult {
  if (options.aisles.length === 0) {
    return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_AISLE_MISSING_MESSAGE }
  }

  const bodyMap = getAisleBodyMap(state)
  const aisles = options.aisles.map((aisle) => {
    const body = bodyMap.get(aisle.aisleBodyId)
    const markdown = body?.markdown ?? ''
    return {
      aisleId: aisle.id,
      aisleBodyId: aisle.aisleBodyId,
      markdown,
      ...(options.mode === 'independent'
        ? { body: cloneAisleBodySnapshot(body, markdown) }
        : {}),
    }
  })
  const payload: NotebookStructureClipboardPayload = {
    version: 1,
    kind: options.kind,
    mode: options.mode,
    source: {
      noteId: options.noteId,
      noteTitle: options.noteTitle,
      noteBodyId: options.noteBody.id,
      label: options.label,
      ...(options.sourceAisleId ? { aisleId: options.sourceAisleId } : {}),
    },
    aisles,
  }
  return { status: 'ok', payload, markdown: buildFallbackMarkdown(aisles) }
}

export function buildNotebookStructureClipboardPayload(
  state: AppState,
  options: {
    activeNoteId: string
    kind: NotebookStructureClipboardKind
    mode: NotebookStructureClipboardMode
    aisleId?: string
  },
): NotebookStructureClipboardBuildResult {
  const notePath = findNotebookNote(state.notebook.items, options.activeNoteId)
  if (!notePath) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_NOTE_MISSING_MESSAGE }

  const noteBody = getNoteBody(state, notePath.note.noteBodyId)
  if (!noteBody) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_NOTE_MISSING_MESSAGE }

  const label = getNotebookNotePathLabel(state.notebook.items, notePath.note.id) || notePath.note.title
  if (options.kind === 'note') {
    return buildPayloadFromAisles(state, {
      noteId: notePath.note.id,
      noteBody,
      noteTitle: notePath.note.title,
      label,
      kind: 'note',
      mode: options.mode,
      aisles: noteBody.aisles,
    })
  }

  const aisle = noteBody.aisles.find((candidate) => candidate.id === options.aisleId)
  if (!aisle) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_AISLE_MISSING_MESSAGE }
  return buildPayloadFromAisles(state, {
    noteId: notePath.note.id,
    noteBody,
    noteTitle: notePath.note.title,
    label,
    kind: 'aisle',
    mode: options.mode,
    aisles: [aisle],
    sourceAisleId: aisle.id,
  })
}

function isNotebookStructureClipboardAisle(value: unknown): value is NotebookStructureClipboardAisle {
  const candidate = value as NotebookStructureClipboardAisle
  return (
    Boolean(candidate) &&
    typeof candidate === 'object' &&
    typeof candidate.aisleId === 'string' &&
    typeof candidate.aisleBodyId === 'string' &&
    typeof candidate.markdown === 'string'
  )
}

export function parseNotebookStructureClipboardPayload(value: string): NotebookStructureClipboardPayload | null {
  try {
    const parsed = JSON.parse(value) as NotebookStructureClipboardPayload
    if (
      parsed?.version !== 1 ||
      (parsed.kind !== 'note' && parsed.kind !== 'aisle') ||
      (parsed.mode !== 'independent' && parsed.mode !== 'synced') ||
      !parsed.source ||
      typeof parsed.source.noteId !== 'string' ||
      typeof parsed.source.noteTitle !== 'string' ||
      typeof parsed.source.noteBodyId !== 'string' ||
      typeof parsed.source.label !== 'string' ||
      !Array.isArray(parsed.aisles) ||
      parsed.aisles.length === 0 ||
      !parsed.aisles.every(isNotebookStructureClipboardAisle)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function serializeNotebookStructureClipboardPayload(payload: NotebookStructureClipboardPayload): string {
  return JSON.stringify(payload)
}

export function rememberNotebookStructureClipboardPayload(
  payload: NotebookStructureClipboardPayload,
  markdown = buildFallbackMarkdown(payload.aisles),
) {
  rememberedClipboard = { payload, markdown }
}

export function readRememberedNotebookStructureClipboardPayload(markdown: string): NotebookStructureClipboardPayload | null {
  return rememberedClipboard && rememberedClipboard.markdown === markdown ? rememberedClipboard.payload : null
}

export function readNotebookStructureClipboardPayloadFromDataTransfer(
  dataTransfer: DataTransferReadLike,
): NotebookStructureClipboardPayload | null {
  if (!dataTransfer) return null
  try {
    const structured = dataTransfer.getData(AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME)
    const payload = structured ? parseNotebookStructureClipboardPayload(structured) : null
    if (payload) return payload
  } catch {
    // Fall through to remembered clean-text fallback.
  }

  try {
    const text = dataTransfer.getData('text/plain')
    return text ? readRememberedNotebookStructureClipboardPayload(text) : null
  } catch {
    return null
  }
}

export async function readNotebookStructureClipboardPayloadFromNavigator(
  clipboard: Clipboard | null | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : null,
): Promise<NotebookStructureClipboardPayload | null> {
  if (!clipboard) return null

  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        if (!item.types.includes(AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME)) continue
        const blob = await item.getType(AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME)
        const payload = parseNotebookStructureClipboardPayload(await blob.text())
        if (payload) return payload
      }
    } catch {
      // Fall through to clean-text in-memory fallback.
    }
  }

  if (typeof clipboard.readText === 'function') {
    try {
      const text = await clipboard.readText()
      return readRememberedNotebookStructureClipboardPayload(text)
    } catch {
      return null
    }
  }

  return null
}

export async function writeNotebookStructureClipboardPayload(
  payload: NotebookStructureClipboardPayload,
  markdown = buildFallbackMarkdown(payload.aisles),
  clipboard: Clipboard | null | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : null,
): Promise<boolean> {
  rememberNotebookStructureClipboardPayload(payload, markdown)
  if (!clipboard) return false

  if (typeof clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          [AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME]: new Blob([serializeNotebookStructureClipboardPayload(payload)], {
            type: AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME,
          }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch {
      // Some platforms reject custom MIME types. The text fallback plus remembered payload still covers same-app paste.
    }
  }

  if (typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(markdown)
      return true
    } catch {
      return false
    }
  }

  return false
}

export function applyNotebookStructureClipboardPayload(
  state: AppState,
  options: {
    activeNoteId: string
    focusedAisleId: string
    payload: NotebookStructureClipboardPayload
    idGenerator?: IdGenerator
  },
): NotebookStructureClipboardApplyResult {
  const activePath = findNotebookNote(state.notebook.items, options.activeNoteId)
  if (!activePath) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_NOTE_MISSING_MESSAGE }

  const activeBody = getNoteBody(state, activePath.note.noteBodyId)
  if (!activeBody) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_NOTE_MISSING_MESSAGE }

  const focusedIndex = activeBody.aisles.findIndex((aisle) => aisle.id === options.focusedAisleId)
  if (focusedIndex < 0) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_ACTIVE_AISLE_MISSING_MESSAGE }
  if (activeBody.aisles.length - 1 + options.payload.aisles.length > MAX_NOTE_AISLES) {
    return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_MAX_AISLES_MESSAGE }
  }

  const sourceBodies = getAisleBodyMap(state)
  if (options.payload.mode === 'synced') {
    const missingSyncedBody = options.payload.aisles.some((aisle) => !sourceBodies.has(aisle.aisleBodyId))
    if (missingSyncedBody) return { status: 'blocked', message: NOTEBOOK_STRUCTURE_CLIPBOARD_STALE_SYNCED_MESSAGE }
  }

  const idGenerator = options.idGenerator ?? createReservedIdAllocator(collectNotebookIds(state))
  const addedAisleBodies: NoteAisleBody[] = []
  const replacementAisles = options.payload.aisles.map((aisle) => {
    if (options.payload.mode === 'synced') {
      return {
        id: idGenerator(),
        aisleBodyId: aisle.aisleBodyId,
      }
    }

    const aisleBodyId = idGenerator()
    addedAisleBodies.push(cloneAisleBodyForPaste(aisle.body, aisleBodyId, aisle.markdown))
    return {
      id: idGenerator(),
      aisleBodyId,
    }
  })

  const nextBody: NoteBody = {
    ...activeBody,
    updatedAt: nowIso(),
    aisles: [
      ...activeBody.aisles.slice(0, focusedIndex),
      ...replacementAisles,
      ...activeBody.aisles.slice(focusedIndex + 1),
    ],
  }

  return {
    status: 'ok',
    state: {
      ...state,
      noteBodies: state.noteBodies.map((body) => (body.id === activeBody.id ? nextBody : body)),
      noteAisleBodies: [...(state.noteAisleBodies ?? []), ...addedAisleBodies],
    },
    activeAisleId: replacementAisles[0]?.id,
  }
}
