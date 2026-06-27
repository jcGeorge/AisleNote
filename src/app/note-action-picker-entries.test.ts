import { describe, expect, it } from 'vitest'
import type { NoteSearchEntry } from '../notes/note-locations'
import { filterNoteActionPickerEntries, getNoteActionPickerActionsForNote } from './note-action-picker-entries'

const entries: NoteSearchEntry[] = [
  {
    noteId: 'note-active',
    noteBodyId: 'body-active',
    parentFolderId: null,
    folderName: '',
    folderPath: '',
    noteName: 'Welcome',
    label: 'Welcome',
    searchText: 'welcome',
  },
  {
    noteId: 'note-target',
    noteBodyId: 'body-target',
    parentFolderId: null,
    folderName: '',
    folderPath: '',
    noteName: 'Target',
    label: 'Target',
    searchText: 'target',
  },
]

describe('note action picker entries', () => {
  it('keeps the active note searchable when a self note link is available', () => {
    expect(
      filterNoteActionPickerEntries(entries, 'wel', {
        actions: ['note-link', 'note-preview', 'independent-copy', 'synced-copy'],
        activeNoteId: 'note-active',
      }).map((entry) => entry.noteId),
    ).toEqual(['note-active'])
  })

  it('excludes the active note when every available action would be invalid for itself', () => {
    expect(
      filterNoteActionPickerEntries(entries, 'wel', {
        actions: ['note-preview'],
        activeNoteId: 'note-active',
      }),
    ).toEqual([])
    expect(
      filterNoteActionPickerEntries(entries, 'wel', {
        actions: ['independent-copy', 'synced-copy'],
        activeNoteId: 'note-active',
      }),
    ).toEqual([])
  })

  it('reduces active-note actions to note links only', () => {
    expect(
      getNoteActionPickerActionsForNote(
        ['note-link', 'note-preview', 'independent-copy', 'synced-copy'],
        'note-active',
        'note-active',
      ),
    ).toEqual(['note-link'])
    expect(
      getNoteActionPickerActionsForNote(
        ['note-link', 'note-preview', 'independent-copy', 'synced-copy'],
        'note-target',
        'note-active',
      ),
    ).toEqual(['note-link', 'note-preview', 'independent-copy', 'synced-copy'])
  })
})
