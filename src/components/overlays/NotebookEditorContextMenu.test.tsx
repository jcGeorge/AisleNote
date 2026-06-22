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
  canDecoupleAisle?: boolean
} = {}) {
  return renderToStaticMarkup(
    <NotebookEditorContextMenu
      menu={options.menu ?? { x: 10, y: 20, aisleId: 'aisle-1' }}
      canDecoupleAisle={options.canDecoupleAisle ?? false}
      revealLabel="Reveal in Finder"
      canReveal
      onClose={vi.fn()}
      onClipboard={vi.fn()}
      onCommand={vi.fn()}
      onInsertUrlLink={vi.fn()}
      onEditLink={vi.fn()}
      onInsertNoteLink={vi.fn()}
      onInsertNotePreview={vi.fn()}
      onInsertAisle={vi.fn()}
      onInsertAttachment={vi.fn()}
      onCopyAs={vi.fn()}
      onCreateSyncedCopy={vi.fn()}
      onFilterSyncedAisle={vi.fn()}
      onDecoupleAisle={vi.fn()}
      onShowSyncedAisle={vi.fn()}
      onRevealLocation={vi.fn()}
    />,
  )
}

function fakeTarget(aisleId: string, options: { ignored?: boolean; tableCell?: boolean } = {}): Element {
  return {
    closest: vi.fn((selector: string) => {
      if (options.tableCell && selector.includes('td')) return {}
      if (selector.includes('data-note-workspace-skip-aisle-activation')) return options.ignored ? {} : null
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
      'copy note as',
      'copy aisle as',
      'independent copy',
      'synced copy',
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
      'note link',
      'note preview',
      'to the left',
      'to the right',
      'attachment',
      'table',
      'horizontal rule',
      'code block',
      'Reveal in Finder',
    ].forEach((label) => expect(html).toContain(label))

    expect(html.indexOf('code block')).toBeLessThan(html.lastIndexOf('Reveal in Finder'))
    expect(html).not.toContain('No synced item')
    expect(html).not.toContain('find &amp; replace')
    expect(html).not.toContain('find & replace')
  })

  it('shows de-couple actions only when they are available', () => {
    expect(renderMenu()).not.toContain('de-couple note')
    expect(renderMenu()).not.toContain('decouple aisle')
    expect(renderMenu()).not.toContain('filter synced note')
    expect(renderMenu()).not.toContain('show synced aisles')

    const linkedAisleHtml = renderMenu({ canDecoupleAisle: true })
    expect(linkedAisleHtml).toContain('filter synced aisle')
    expect(linkedAisleHtml).toContain('decouple aisle')
    expect(linkedAisleHtml).toContain('show synced aisles')
    expect(linkedAisleHtml).not.toContain('filter synced note')
    expect(linkedAisleHtml).not.toContain('de-couple note')
  })

  it('shows edit link only when the right-click target is a link', () => {
    expect(renderMenu()).not.toContain('edit link')
    expect(renderMenu({
      menu: {
        x: 10,
        y: 20,
        aisleId: 'aisle-1',
        linkPrompt: {
          open: true,
          top: 72,
          left: 320,
          url: 'https://example.com',
          text: 'Example',
          urlEditable: true,
          centered: true,
          editRange: { from: 1, to: 8, href: 'https://example.com' },
        },
      },
    })).toContain('edit link')
  })

  it('routes ordinary aisle/editor targets and ignores toolbar or menu targets', () => {
    expect(getNotebookEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1'))).toBe('aisle-1')
    expect(getNotebookEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { ignored: true }))).toBeNull()
    expect(getNotebookEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { tableCell: true }))).toBeNull()
    expect(getNotebookEditorContextMenuAisleIdFromTarget(null)).toBeNull()
  })
})

describe('notebook editor context menu wiring', () => {
  it('routes note right-clicks to the editor menu instead of the synced-item menu', () => {
    expect(notebookAppSource).toContain('onContextMenu={openNotebookEditorContextMenuFromPointer}')
    expect(notebookAppSource).toContain('getNotebookEditorContextMenuAisleIdFromTarget(target)')
    expect(notebookAppSource).toContain('setEditorContextMenu({ aisleId, x, y, linkPrompt: options.linkPrompt ?? null })')
    expect(notebookAppSource).toContain('if (!menu || !canDecoupleAisle) return null')
    expect(notebookAppSource).not.toContain('openAisleContextMenuFromPointer')
    expect(notebookAppSource).not.toContain('No synced item')
  })

  it('wires context-menu paste, commands, and attachments to notebook editor helpers', () => {
    expect(notebookAppSource).toContain(
      "addAisle(destination === 'new-aisle-left' ? 'left' : 'right', aisleId, result.markdown)",
    )
    expect(notebookAppSource).toContain('pasteNotebookStructureClipboard(aisleId)')
    expect(notebookAppSource).toContain('buildNotebookStructureClipboardPayload(currentState')
    expect(notebookAppSource).toContain('writeNotebookStructureClipboardPayload(result.payload, result.markdown)')
    expect(notebookAppSource).toContain('onCommand={notebookEditors.runCommand}')
    expect(notebookAppSource).toContain('onEditLink={openUrlLinkPrompt}')
    expect(notebookAppSource).toContain('onInsertAttachment={notebookEditors.insertAttachmentFile}')
    expect(notebookAppSource).toContain('onCopyAs={copyNotebookStructureAs}')
    expect(notebookAppSource).toContain('onRevealLocation={revealEditorContextLocation}')
    expect(notebookAppSource).toContain("trigger: 'notebook-editor-reveal-location'")
    expect(notebookAppSource).toContain('revealNoteLocation(payload)')
    expect(notebookEditorsSource).toContain('onNotebookStructurePaste')
    expect(notebookEditorsSource).toContain('readNotebookStructureClipboardPayloadFromDataTransfer(event.clipboardData)')
    expect(notebookEditorsSource).toContain('readClipboardMarkdownForPaste')
    expect(notebookEditorsSource).toContain('insertVisualClipboardMarkdownIntoView')
    expect(notebookEditorsSource).toContain('insertAssetLinksIntoWysiwygView')
    expect(notebookEditorsSource).toContain('buildMediaMarkdownLink')
  })
})
