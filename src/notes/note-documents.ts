import type { AppState, NoteAisle, NoteBody } from '../types/app'
import { cloneAisles, syncNoteBodyAislesInState } from './note-state'

export type NoteDocument = {
  noteBodyId: string
  aisles: NoteAisle[]
}

export type NoteDocumentWrite = {
  noteBodyId: string
  aisles: NoteAisle[]
}

export function getNoteDocument(state: AppState, noteBodyId: string): NoteDocument | null {
  const body = state.noteBodies.find((candidate) => candidate.id === noteBodyId)
  if (!body) return null
  return {
    noteBodyId: body.id,
    aisles: cloneAisles(body.aisles),
  }
}

export function getNoteDocumentForBody(body: NoteBody): NoteDocument {
  return {
    noteBodyId: body.id,
    aisles: cloneAisles(body.aisles),
  }
}

export function writeNoteDocumentAisles(state: AppState, document: NoteDocumentWrite): AppState {
  return syncNoteBodyAislesInState(state, document.noteBodyId, document.aisles)
}

export function readAisleMarkdown(document: NoteDocument, aisleId: string): string | null {
  return document.aisles.find((aisle) => aisle.id === aisleId)?.markdown ?? null
}

export function updateAisleMarkdown(document: NoteDocument, aisleId: string, markdown: string): NoteDocument {
  return {
    ...document,
    aisles: document.aisles.map((aisle) => (aisle.id === aisleId ? { ...aisle, markdown } : aisle)),
  }
}
