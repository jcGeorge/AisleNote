import type { AppState, NoteLocation, NotebookNote } from '../types/app'
import { getAisleMarkdown } from './aisle-body-state'
import {
  findNotebookNote,
  getFirstNotebookNote,
  getNotebookNotePathLabel,
  listNotebookNotes,
  replaceNotebookNoteBodyId,
} from '../state/notebook'

export type NoteLocationInfo = {
  note: NotebookNote | null
  noteBodyId: string
  title: string
  folderPath: string
}

export type NoteLocationListEntry = NoteLocation & {
  title: string
  label: string
}

export type NoteSearchEntry = NoteLocation & {
  noteBodyId: string
  folderName: string
  folderPath: string
  noteName: string
  label: string
  searchText: string
}

export function buildNoteLocationKey(location: NoteLocation): string {
  return location.noteId
}

export function getLocationInfo(sourceState: AppState, location: NoteLocation): NoteLocationInfo {
  const notePath = findNotebookNote(sourceState.notebook.items, location.noteId)
  if (!notePath) {
    return {
      note: null,
      noteBodyId: '',
      title: 'note',
      folderPath: '',
    }
  }
  const folderSegments = notePath.path.slice(0, -1)
  return {
    note: notePath.note,
    noteBodyId: notePath.note.noteBodyId,
    title: notePath.note.title,
    folderPath: folderSegments.map((segment) => segment.title).join('/'),
  }
}

export function getNoteLocationBreadcrumbLabel(sourceState: AppState, location: NoteLocation): string {
  return getNotebookNotePathLabel(sourceState.notebook.items, location.noteId) || 'note'
}

export function getDefaultNoteLinkLabel(sourceState: AppState, source: NoteLocation, target: NoteLocation): string {
  const sourceInfo = getLocationInfo(sourceState, source)
  const targetInfo = getLocationInfo(sourceState, target)
  if (!targetInfo.note) return targetInfo.title
  if (sourceInfo.folderPath && sourceInfo.folderPath === targetInfo.folderPath) return targetInfo.note.title
  return getNoteLocationBreadcrumbLabel(sourceState, target)
}

export function listSearchableNoteLocations(sourceState: AppState): NoteSearchEntry[] {
  return listNotebookNotes(sourceState.notebook.items).map(({ note, path }) => {
    const folderSegments = path.slice(0, -1)
    const folderPath = folderSegments.map((segment) => segment.title).join('/')
    const folderName = folderSegments.at(-1)?.title ?? ''
    const label = path.map((segment) => segment.title).join(' > ')
    return {
      noteId: note.id,
      noteBodyId: note.noteBodyId,
      folderName,
      folderPath,
      noteName: note.title,
      label,
      searchText: `${label} ${folderPath} ${note.title}`.toLowerCase(),
    }
  })
}

export function filterNoteSearchEntries(entries: NoteSearchEntry[], query: string, limit = 10): NoteSearchEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return entries.slice(0, limit)
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const phraseMatches = entries.filter((entry) => entry.searchText.includes(normalizedQuery))
  const matches =
    phraseMatches.length > 0
      ? phraseMatches
      : entries.filter((entry) => {
          const words = entry.searchText.split(/[^a-z0-9]+/).filter(Boolean)
          let wordIndex = 0
          return tokens.every((token) => {
            const matchIndex = words.findIndex((word, index) => index >= wordIndex && word.startsWith(token))
            if (matchIndex < 0) return false
            wordIndex = matchIndex + 1
            return true
          })
        })
  return matches.slice(0, limit)
}

export function getFirstNoteLocation(
  sourceState: AppState,
  excludedLocation?: NoteLocation,
  fallbackLocation?: NoteLocation,
): NoteLocation {
  const excludedKey = excludedLocation ? buildNoteLocationKey(excludedLocation) : ''
  const first = listNotebookNotes(sourceState.notebook.items).find(
    ({ note }) => buildNoteLocationKey({ noteId: note.id }) !== excludedKey,
  )?.note
  if (first) return { noteId: first.id }
  const fallback = getFirstNotebookNote(sourceState.notebook.items)
  return fallback ? { noteId: fallback.id } : fallbackLocation ?? { noteId: '' }
}

export function getDefaultNoteReferenceTarget(
  sourceState: AppState,
  source: NoteLocation,
  fallbackLocation: NoteLocation = source,
): NoteLocation {
  return getFirstNoteLocation(sourceState, source, fallbackLocation)
}

export function listNoteLocationsForBody(sourceState: AppState, noteBodyId: string): NoteLocationListEntry[] {
  return listNotebookNotes(sourceState.notebook.items)
    .filter(({ note }) => note.noteBodyId === noteBodyId)
    .map(({ note }) => ({
      noteId: note.id,
      title: note.title,
      label: getNotebookNotePathLabel(sourceState.notebook.items, note.id),
    }))
}

export function getNoteMarkdown(sourceState: AppState, location: NoteLocation): string {
  const info = getLocationInfo(sourceState, location)
  const noteBody = sourceState.noteBodies.find((body) => body.id === info.noteBodyId)
  if (!noteBody) return ''
  return noteBody.aisles
    .map((aisle) => getAisleMarkdown(sourceState.noteAisleBodies, aisle.aisleBodyId))
    .join('\n\n')
}

export function updateNoteLocationBody(sourceState: AppState, location: NoteLocation, noteBodyId: string): AppState {
  return {
    ...sourceState,
    notebook: replaceNotebookNoteBodyId(sourceState.notebook, location.noteId, noteBodyId),
  }
}
