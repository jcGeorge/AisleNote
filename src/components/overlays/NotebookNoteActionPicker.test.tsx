import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  NotebookNoteActionPicker,
  getNotebookNoteActionPickerActionIntent,
  getNotebookNoteActionPickerKeyboardIntent,
} from './NotebookNoteActionPicker'
import type { NoteSearchEntry } from '../../notes/note-locations'

const appCss = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')

const entries: NoteSearchEntry[] = [
  {
    noteId: 'note-1',
    noteBodyId: 'body-1',
    parentFolderId: null,
    folderName: '',
    folderPath: '',
    noteName: 'Alpha',
    label: 'Alpha',
    searchText: 'alpha',
  },
  {
    noteId: 'note-2',
    noteBodyId: 'body-2',
    parentFolderId: 'folder-1',
    folderName: 'Work',
    folderPath: 'Work',
    noteName: 'Specs',
    label: 'Work > Specs',
    searchText: 'work specs',
  },
]

describe('NotebookNoteActionPicker', () => {
  it('renders note suggestions and restored mention actions without the mention header', () => {
    const html = renderToStaticMarkup(
      <NotebookNoteActionPicker
        title="Select note"
        entries={entries}
        query="spe"
        showSearchInput={false}
        showHeader={false}
        initialSelectedNoteId="note-2"
        actions={['note-link', 'note-preview', 'independent-copy', 'synced-copy']}
        onQueryChange={vi.fn()}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('Alpha')
    expect(html).toContain('Specs')
    expect(html).toContain('note link')
    expect(html).toContain('note preview')
    expect(html).toContain('independent copy')
    expect(html).toContain('synced copy')
    expect(html).toContain('Current note search')
    expect(html).toContain('@spe')
    expect(html).not.toContain('<h2>')
    expect(html).toContain('notebook-note-action-choice-row')
  })

  it('keeps the restored mention actions on one row with a wider picker', () => {
    expect(appCss).toContain('width: min(520px, calc(100vw - 28px));')
    expect(appCss).toContain('.notebook-note-action-query')
    expect(appCss).toContain('flex-wrap: nowrap;')
    expect(appCss).toContain('white-space: nowrap;')
  })

  it('keeps URL insertion available for the toolbar link flow', () => {
    const html = renderToStaticMarkup(
      <NotebookNoteActionPicker
        title="Insert link"
        entries={entries}
        query=""
        initialSelectedNoteId="note-1"
        actions={['note-link', 'note-preview']}
        urlEnabled
        onQueryChange={vi.fn()}
        onSubmitUrl={vi.fn()}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('url link')
    expect(html).toContain('note link')
    expect(html).toContain('note preview')
  })

  it('chooses the aisle step only for multi-aisle note previews', () => {
    expect(getNotebookNoteActionPickerActionIntent('note-preview', 0)).toBe('run-action')
    expect(getNotebookNoteActionPickerActionIntent('note-preview', 1)).toBe('run-action')
    expect(getNotebookNoteActionPickerActionIntent('note-preview', 2)).toBe('choose-preview-aisle')
    expect(getNotebookNoteActionPickerActionIntent('note-link', 2)).toBe('run-action')
    expect(getNotebookNoteActionPickerActionIntent('independent-copy', 2)).toBe('run-action')
    expect(getNotebookNoteActionPickerActionIntent('synced-copy', 2)).toBe('run-action')
  })

  it('defines picker styles for the preview aisle chooser', () => {
    expect(appCss).toContain('.notebook-note-action-preview-aisles')
    expect(appCss).toContain('.notebook-note-action-preview-aisle-row')
    expect(appCss).toContain('.notebook-note-action-preview-insert')
  })

  it('routes Enter from results into the action row before running an action', () => {
    expect(getNotebookNoteActionPickerKeyboardIntent({
      key: 'Enter',
      activeRegion: 'results',
      hasSelectedEntry: false,
    })).toBe('select-result')
    expect(getNotebookNoteActionPickerKeyboardIntent({
      key: 'Enter',
      activeRegion: 'actions',
      hasSelectedEntry: true,
    })).toBe('run-action')
    expect(getNotebookNoteActionPickerKeyboardIntent({
      key: 'ArrowRight',
      activeRegion: 'actions',
      hasSelectedEntry: true,
    })).toBe('next-action')
  })
})
