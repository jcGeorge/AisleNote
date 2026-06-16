import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  NotebookEditorContextMenu,
  getNotebookEditorContextMenuAisleIdFromTarget,
  type NotebookEditorContextMenuState,
} from './NotebookEditorContextMenu'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const notebookAppSource = readFileSync(join(sourceDir, '../../app/NotebookApp.tsx'), 'utf8')
const notebookEditorsSource = readFileSync(join(sourceDir, '../../editor/useNotebookAisleEditors.ts'), 'utf8')

function renderMenu(options: {
  menu?: NotebookEditorContextMenuState | null
  canDecoupleNote?: boolean
  canDecoupleAisle?: boolean
} = {}) {
  return renderToStaticMarkup(
    <NotebookEditorContextMenu
      menu={options.menu ?? { x: 10, y: 20, aisleId: 'aisle-1' }}
      canDecoupleNote={options.canDecoupleNote ?? false}
      canDecoupleAisle={options.canDecoupleAisle ?? false}
      onClose={vi.fn()}
      onClipboard={vi.fn()}
      onCommand={vi.fn()}
      onInsertUrlLink={vi.fn()}
      onInsertAisle={vi.fn()}
      onInsertAttachment={vi.fn()}
      onCreateSyncedCopy={vi.fn()}
      onDecoupleNote={vi.fn()}
      onDecoupleAisle={vi.fn()}
    />,
  )
}

function fakeTarget(aisleId: string, ignored = false): Element {
  return {
    closest: vi.fn((selector: string) => {
      if (selector.includes('data-note-workspace-skip-aisle-activation')) return ignored ? {} : null
      if (selector === '.note-aisle-pane') return { dataset: { aisleId } }
      return null
    }),
  } as unknown as Element
}

describe('NotebookEditorContextMenu', () => {
  it('renders restored editor-essential actions without stale rows', () => {
    const html = renderMenu()

    ;[
      'cut',
      'copy',
      'paste',
      'paste as plain text',
      'new aisle on left',
      'new aisle on right',
      'make this a copy of',
      'format',
      'bold',
      'italic',
      'strikethrough',
      'highlight',
      'inline code',
      'paragraph',
      'bullet list',
      'dash list',
      'numbered list',
      'task list',
      'heading 1',
      'heading 6',
      'quote block',
      'block indent',
      'remove block indent',
      'insert',
      'url link',
      'to the left',
      'to the right',
      'attachment',
      'table',
      'horizontal rule',
      'code block',
    ].forEach((label) => expect(html).toContain(label))

    expect(html).not.toContain('No synced item')
    expect(html).not.toContain('note link')
    expect(html).not.toContain('find &amp; replace')
    expect(html).not.toContain('find & replace')
  })

  it('shows de-couple actions only when they are available', () => {
    expect(renderMenu()).not.toContain('de-couple note')
    expect(renderMenu()).not.toContain('de-couple aisle')

    const linkedNoteHtml = renderMenu({ canDecoupleNote: true, canDecoupleAisle: true })
    expect(linkedNoteHtml).toContain('de-couple note')
    expect(linkedNoteHtml).not.toContain('de-couple aisle')

    const linkedAisleHtml = renderMenu({ canDecoupleAisle: true })
    expect(linkedAisleHtml).toContain('de-couple aisle')
    expect(linkedAisleHtml).not.toContain('de-couple note')
  })

  it('routes ordinary aisle/editor targets and ignores toolbar or menu targets', () => {
    expect(getNotebookEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1'))).toBe('aisle-1')
    expect(getNotebookEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', true))).toBeNull()
    expect(getNotebookEditorContextMenuAisleIdFromTarget(null)).toBeNull()
  })
})

describe('notebook editor context menu wiring', () => {
  it('routes note right-clicks to the editor menu instead of the synced-item menu', () => {
    expect(notebookAppSource).toContain('onContextMenu={openNotebookEditorContextMenuFromPointer}')
    expect(notebookAppSource).toContain('getNotebookEditorContextMenuAisleIdFromTarget(target)')
    expect(notebookAppSource).toContain('setEditorContextMenu({ aisleId, x, y })')
    expect(notebookAppSource).toContain("if (!menu || (!canDecoupleNote && !canDecoupleAisle)) return null")
    expect(notebookAppSource).not.toContain('openAisleContextMenuFromPointer')
    expect(notebookAppSource).not.toContain('No synced item')
  })

  it('wires context-menu paste, commands, and attachments to notebook editor helpers', () => {
    expect(notebookAppSource).toContain(
      "addAisle(destination === 'new-aisle-left' ? 'left' : 'right', aisleId, result.markdown)",
    )
    expect(notebookAppSource).toContain('onCommand={notebookEditors.runCommand}')
    expect(notebookAppSource).toContain('onInsertAttachment={notebookEditors.insertAttachmentFile}')
    expect(notebookEditorsSource).toContain('readClipboardMarkdownForPaste')
    expect(notebookEditorsSource).toContain('insertVisualClipboardMarkdownIntoView')
    expect(notebookEditorsSource).toContain('insertAssetLinksIntoWysiwygView')
    expect(notebookEditorsSource).toContain('buildMediaMarkdownLink')
  })
})
