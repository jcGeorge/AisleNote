import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import { buildNoteAisleBodyMap } from '../notes/note-markdown'
import { listSearchableNoteLocations, type NoteSearchEntry } from '../notes/note-locations'
import { getScratchpadNoteBody } from '../state/scratchpad'
import type { AppState, FrontmatterTemplate, NoteAisleBody, NoteBody, NoteLocation } from '../types/app'

export type VaultOrderedLocation = {
  location: NoteLocation
  noteBodyId: string
  entry: NoteSearchEntry
}

export type VaultIndexContext = {
  state: AppState
  locations: NoteSearchEntry[]
  orderedLocations: VaultOrderedLocation[]
  orderedNoteLocations: NoteLocation[]
  noteBodiesById: Map<string, NoteBody>
  aisleBodiesById: Map<string, NoteAisleBody>
  templatesById: Map<string, FrontmatterTemplate>
  scratchpadBody: NoteBody | null
  scratchpadLocation: NoteLocation
}

export function createVaultIndexContext(state: AppState): VaultIndexContext {
  const locations = listSearchableNoteLocations(state)
  const noteBodiesById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodiesById = buildNoteAisleBodyMap(state.noteAisleBodies)
  const templatesById = new Map(state.frontmatter.templates.map((template) => [template.id, template]))
  const orderedLocations = locations.map((entry) => ({
    location: { noteId: entry.noteId },
    noteBodyId: entry.noteBodyId,
    entry,
  }))

  return {
    state,
    locations,
    orderedLocations,
    orderedNoteLocations: orderedLocations.map((entry) => entry.location),
    noteBodiesById,
    aisleBodiesById,
    templatesById,
    scratchpadBody: getScratchpadNoteBody(state),
    scratchpadLocation: SCRATCHPAD_FIND_LOCATION,
  }
}

export function getVaultIndexContext(
  state: AppState,
  context?: VaultIndexContext,
): VaultIndexContext {
  return context ?? createVaultIndexContext(state)
}
