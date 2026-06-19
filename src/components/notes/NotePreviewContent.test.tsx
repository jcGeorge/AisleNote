import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../types/app'
import { NotePreviewContent } from './NotePreviewContent'

function createState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-a',
      items: [
        { type: 'note', id: 'note-a', title: 'Parent', noteBodyId: 'body-a' },
        { type: 'note', id: 'note-b', title: 'Welcome Copy', noteBodyId: 'body-b' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] },
      { id: 'body-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'aisle-body-b' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-a', markdown: 'Parent body' },
      { id: 'aisle-body-b', markdown: 'preview content' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('NotePreviewContent', () => {
  it('renders bounded preview controls without duplicating a title-only breadcrumb', () => {
    const html = renderToStaticMarkup(
      <NotePreviewContent
        appState={createState()}
        target={{ noteId: 'note-b' }}
        currentNoteBodyId="body-a"
        onOpenNote={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(html).toContain('class="note-context-widget note-preview-widget is-size-normal"')
    expect(html).toContain('data-note-preview-size="normal"')
    expect(html).toContain('aria-label="Make note preview smaller"')
    expect(html).toContain('aria-label="Make note preview larger"')
    expect(html).toContain('aria-label="Collapse note preview"')
    expect(html).toContain('aria-label="Delete note preview"')
    expect(html).toContain('data-app-icon="minus"')
    expect(html).toContain('data-app-icon="plus"')
    expect(html).toContain('data-app-icon="minimize"')
    expect(html).toContain('data-app-icon="trash"')
    expect(html).toContain('preview content')
    expect(html.match(/Welcome Copy/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('context-preview-navigation-status">Welcome Copy')
  })

  it('defines size, boundary, hidden-source, and internal scroll styles', () => {
    const editorShellCss = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')
    const editorContentCss = readFileSync(new URL('../../styles/editor-content.css', import.meta.url), 'utf8')

    expect(editorShellCss).toContain('.tabs-note-preview-widget-host')
    expect(editorShellCss).toContain('.note-preview-widget.is-size-compact')
    expect(editorShellCss).toContain('.note-preview-widget.is-size-expanded')
    expect(editorShellCss).toContain('overflow-y: auto;')
    expect(editorContentCss).toContain('.tabs-note-preview-source-block-hidden')
  })
})
