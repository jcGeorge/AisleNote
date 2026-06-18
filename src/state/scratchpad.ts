import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { extractMarkdownTags } from '../tags/tags.js'
import {
  getAisleBodyId,
  resolveNoteBody,
  syncNoteBodyAislesInState,
  syncNoteBodyAisleStructureInState,
} from '../notes/aisle-body-state'
import type { AppState, NoteAisle, NoteAisleBody, NoteBody, ResolvedNoteAisle, ScratchpadState } from '../types/app'
import { createId, createNoteBodyContent, createTimestamp } from '../notes/note-content'
export {
  DEFAULT_SCRATCHPAD_AISLE_LIMIT,
  MAX_SCRATCHPAD_AISLE_LIMIT,
  MIN_SCRATCHPAD_AISLE_LIMIT,
  clampScratchpadAisleLimit,
} from './scratchpad-limits'

export const SCRATCHPAD_CURSOR_LOCATION_KEY = 'scratchpad'
export const SCRATCHPAD_CONTENT_TARGET_ID = '__tabs_scratchpad__'

export function createScratchpadState(noteBodyId = createId()): ScratchpadState {
  return { noteBodyId }
}

export function normalizeScratchpadState(raw: unknown): ScratchpadState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createScratchpadState()
  const candidate = raw as Record<string, unknown>
  const noteBodyId = typeof candidate.noteBodyId === 'string' && candidate.noteBodyId ? candidate.noteBodyId : createId()
  const activeAisleId =
    typeof candidate.activeAisleId === 'string' && candidate.activeAisleId ? candidate.activeAisleId : undefined
  return activeAisleId ? { noteBodyId, activeAisleId } : { noteBodyId }
}

function createAisleBody(aisleBodyId: string, markdown = ''): NoteAisleBody {
  const timestamp = createTimestamp()
  return {
    id: aisleBodyId,
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: normalizeMarkdownForPersistence(markdown),
    tags: extractMarkdownTags(markdown),
    frontmatter: null,
    frontmatterStatus: 'none',
  }
}

function ensureAisleBodiesForBody(
  body: NoteBody,
  aisleBodiesById: Map<string, NoteAisleBody>,
): Map<string, NoteAisleBody> {
  const nextAisleBodiesById = new Map(aisleBodiesById)
  body.aisles.forEach((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    if (!nextAisleBodiesById.has(aisleBodyId)) {
      nextAisleBodiesById.set(aisleBodyId, createAisleBody(aisleBodyId))
    }
  })
  return nextAisleBodiesById
}

export function ensureScratchpadInAppState(appState: AppState): AppState {
  const scratchpad = normalizeScratchpadState(appState.scratchpad)
  const noteBodiesById = new Map(appState.noteBodies.map((body) => [body.id, body]))
  let noteAisleBodiesById = new Map((appState.noteAisleBodies ?? []).map((body) => [body.id, body]))
  let body = noteBodiesById.get(scratchpad.noteBodyId)

  if (!body) {
    const content = createNoteBodyContent('', () => createId())
    body = { ...content.noteBody, id: scratchpad.noteBodyId }
    noteBodiesById.set(body.id, body)
    noteAisleBodiesById.set(content.aisleBody.id, content.aisleBody)
  }

  if (body.aisles.length === 0) {
    const aisleBodyId = createId()
    body = {
      ...body,
      aisles: [{ id: createId(), aisleBodyId }],
    }
    noteBodiesById.set(body.id, body)
    noteAisleBodiesById.set(aisleBodyId, createAisleBody(aisleBodyId))
  }

  noteAisleBodiesById = ensureAisleBodiesForBody(body, noteAisleBodiesById)
  const activeAisleId = body.aisles.some((aisle) => aisle.id === scratchpad.activeAisleId)
    ? scratchpad.activeAisleId
    : body.aisles[0]?.id

  return {
    ...appState,
    scratchpad: {
      noteBodyId: body.id,
      ...(activeAisleId ? { activeAisleId } : {}),
    },
    noteBodies: Array.from(noteBodiesById.values()),
    noteAisleBodies: Array.from(noteAisleBodiesById.values()),
  }
}

export function getScratchpadNoteBody(appState: AppState): NoteBody | null {
  const scratchpad = normalizeScratchpadState(appState.scratchpad)
  return appState.noteBodies.find((body) => body.id === scratchpad.noteBodyId) ?? null
}

export function resolveScratchpadNoteBody(appState: AppState) {
  const body = getScratchpadNoteBody(appState)
  return body ? resolveNoteBody(body, appState.noteAisleBodies) : null
}

export function getScratchpadAisles(appState: AppState): ResolvedNoteAisle[] {
  return resolveScratchpadNoteBody(appState)?.aisles ?? []
}

export function getScratchpadActiveAisleId(appState: AppState, fallbackAisleId = ''): string {
  const body = getScratchpadNoteBody(appState)
  if (!body) return fallbackAisleId
  const requested = normalizeScratchpadState(appState.scratchpad).activeAisleId || fallbackAisleId
  return body.aisles.some((aisle) => aisle.id === requested) ? requested : body.aisles[0]?.id ?? ''
}

export function setScratchpadActiveAisleId(appState: AppState, aisleId: string): AppState {
  const body = getScratchpadNoteBody(appState)
  if (!body || !body.aisles.some((aisle) => aisle.id === aisleId)) return appState
  return {
    ...appState,
    scratchpad: {
      ...normalizeScratchpadState(appState.scratchpad),
      activeAisleId: aisleId,
    },
  }
}

export function syncScratchpadAislesInState(appState: AppState, aisles: Array<NoteAisle & { markdown?: string }>): AppState {
  const scratchpad = normalizeScratchpadState(appState.scratchpad)
  return ensureScratchpadInAppState(syncNoteBodyAislesInState(appState, scratchpad.noteBodyId, aisles))
}

export function syncScratchpadAisleStructureInState(
  appState: AppState,
  aisles: Array<NoteAisle & { markdown?: string }>,
): AppState {
  const scratchpad = normalizeScratchpadState(appState.scratchpad)
  return ensureScratchpadInAppState(syncNoteBodyAisleStructureInState(appState, scratchpad.noteBodyId, aisles))
}
