import type { NoteSearchEntry } from '../notes/note-locations'
import { filterNoteSearchEntries } from '../notes/note-locations'
import type { VaultNoteActionPickerAction } from '../components/overlays/VaultNoteActionPicker'

export function getNoteActionPickerActionsForNote(
  actions: VaultNoteActionPickerAction[],
  noteId: string,
  activeNoteId: string,
): VaultNoteActionPickerAction[] {
  if (!activeNoteId || noteId !== activeNoteId) return actions
  return actions.filter((action) => action === 'note-link')
}

export function filterNoteActionPickerEntries(
  entries: NoteSearchEntry[],
  query: string,
  {
    actions,
    activeNoteId,
    limit = 10,
  }: {
    actions: VaultNoteActionPickerAction[]
    activeNoteId: string
    limit?: number
  },
): NoteSearchEntry[] {
  return filterNoteSearchEntries(
    entries.filter((entry) => getNoteActionPickerActionsForNote(actions, entry.noteId, activeNoteId).length > 0),
    query,
    limit,
  )
}
