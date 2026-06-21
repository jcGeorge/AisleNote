import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../types/app'

vi.mock('./ReadOnlyMarkdownViewer', async () => {
  const ReactModule = await import('react')
  return {
    ReadOnlyMarkdownViewer: ({ markdown }: { markdown: string }) =>
      ReactModule.createElement('div', { 'data-note-preview-readonly-viewer': 'mock' }, markdown),
  }
})

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
      {
        id: 'body-b',
        aisles: [
          { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
          { id: 'aisle-b-2', aisleBodyId: 'aisle-body-b-2' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-a', markdown: 'Parent body' },
      { id: 'aisle-body-b', markdown: 'preview content' },
      { id: 'aisle-body-b-2', markdown: 'second aisle content' },
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
        onConvertToLink={vi.fn()}
      />,
    )

    expect(html).toContain('class="note-context-widget note-preview-widget is-size-normal"')
    expect(html).toContain('data-note-preview-size="normal"')
    expect(html).toContain('aria-label="Make note preview smaller"')
    expect(html).toContain('aria-label="Make note preview larger"')
    expect(html).toContain('aria-label="Open note preview menu"')
    expect(html).toContain('convert to link')
    expect(html).toContain('>delete</button>')
    expect(html).toContain('data-app-icon="minimize"')
    expect(html).toContain('data-app-icon="maximize"')
    expect(html).toContain('data-app-icon="ellipsisVertical"')
    expect(html).not.toContain('data-app-icon="trash"')
    expect(html).not.toContain('context-preview-action-menu-delete-icon')
    expect(html).not.toContain('data-app-icon="minus"')
    expect(html).not.toContain('data-app-icon="plus"')
    expect(html).toContain('preview content')
    expect(html.match(/Welcome Copy/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('context-preview-navigation-status">Welcome Copy')
  })

  it('uses the note preview token label as the visible title', () => {
    const html = renderToStaticMarkup(
      <NotePreviewContent
        appState={createState()}
        target={{ noteId: 'note-b' }}
        currentNoteBodyId="body-a"
        label="Custom preview"
        onOpenNote={vi.fn()}
        onDelete={vi.fn()}
        onRenameLabel={vi.fn()}
      />,
    )

    expect(html).toContain('Custom preview')
    expect(html).toContain('Press and hold to rename this preview label.')
    expect(html).not.toContain('>Welcome Copy</button>')
  })

  it('renders the selected preview aisle when aisle ids are supplied', () => {
    const html = renderToStaticMarkup(
      <NotePreviewContent
        appState={createState()}
        target={{ noteId: 'note-b' }}
        currentNoteBodyId="body-a"
        aisleIds={['aisle-b-2']}
      />,
    )

    expect(html).toContain('second aisle content')
    expect(html).not.toContain('preview content')
  })

  it('defines size, boundary, hidden-source, and internal scroll styles', () => {
    const editorShellCss = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')
    const editorContentCss = readFileSync(new URL('../../styles/editor-content.css', import.meta.url), 'utf8')
    const readonlyViewerSource = readFileSync(new URL('./ReadOnlyMarkdownViewer.tsx', import.meta.url), 'utf8')

    expect(editorShellCss).toContain('.tabs-note-preview-widget-host')
    expect(editorShellCss).toContain('.note-preview-widget.is-size-compact')
    expect(editorShellCss).toContain('.note-preview-widget.is-size-expanded')
    expect(editorShellCss).toContain('.tabs-note-preview-widget-host:has(.note-preview-widget.is-action-menu-open)')
    expect(editorShellCss).toContain('.note-preview-widget.is-action-menu-open')
    expect(editorShellCss).toContain('right: 0.5rem;')
    expect(editorShellCss).toContain('z-index: 60;')
    expect(editorShellCss).toContain('.context-preview-action-menu')
    expect(editorShellCss).toContain('font-size: var(--ui-font-body);')
    expect(editorShellCss).toContain('.context-preview-action-menu-item')
    expect(editorShellCss).toContain('font-size: 1em;')
    expect(editorShellCss).not.toContain('.context-preview-action-menu-delete-icon')
    expect(editorShellCss).toContain('box-sizing: border-box;')
    expect(editorShellCss).toContain('overflow-y: auto;')
    expect(editorShellCss).toContain('.context-preview-editor-host .toastui-editor-contents')
    expect(editorShellCss).toContain('overflow-y: visible !important;')
    expect(editorShellCss).not.toContain('.context-preview-editor-host.tabs-rendered-markdown-surface > p')
    expect(editorShellCss).not.toContain('.context-preview-editor-host.tabs-rendered-markdown-surface li > p')
    expect(editorShellCss).toContain('.note-preview-widget .context-bar-lower')
    expect(editorContentCss).not.toContain('.context-preview-editor-host.tabs-rendered-markdown-surface')
    expect(editorContentCss).toContain('.tabs-note-preview-source-block-hidden')
    expect(readonlyViewerSource).toContain('listMarkerPlugin')
    expect(readonlyViewerSource).toContain('annotationLinePlugin')
    expect(readonlyViewerSource).toContain('highlightPlugin')
    expect(readonlyViewerSource).toContain("initialEditType: 'wysiwyg'")
    expect(readonlyViewerSource).not.toContain('viewer: true')
    expect(readonlyViewerSource).toContain('stopReadonlyTaskMutation')
  })
})
