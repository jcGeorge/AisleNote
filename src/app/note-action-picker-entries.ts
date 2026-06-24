import type { NoteSearchEntry } from '../notes/note-locations'
import { filterNoteSearchEntries } from '../notes/note-locations'
import type { NotebookNoteActionPickerAction } from '../components/overlays/NotebookNoteActionPicker'

export function getNoteActionPickerActionsForNote(
  actions: NotebookNoteActionPickerAction[],
  noteId: string,
  activeNoteId: string,
): NotebookNoteActionPickerAction[] {
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
    actions: NotebookNoteActionPickerAction[]
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
