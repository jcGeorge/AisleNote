import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  VaultEditorContextMenu,
  getVaultEditorContextMenuViewport,
  getVaultEditorContextMenuAisleIdFromTarget,
  type VaultEditorContextMenuState,
} from './VaultEditorContextMenu'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const vaultAppSource = readFileSync(join(sourceDir, '../../app/VaultApp.tsx'), 'utf8')
const vaultEditorsSource = readFileSync(join(sourceDir, '../../editor/useVaultAisleEditors.ts'), 'utf8')
const overlaysCssSource = readFileSync(join(sourceDir, '../../styles/overlays.css'), 'utf8')

function renderMenu(options: {
  menu?: VaultEditorContextMenuState | null
  canDecoupleAisle?: boolean
} = {}) {
  return renderToStaticMarkup(
    <VaultEditorContextMenu
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
      onPrintAisle={vi.fn()}
      onExportPdf={vi.fn()}
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

describe('VaultEditorContextMenu', () => {
  it('uses the editor scroll area as its bottom positioning boundary', () => {
    vi.stubGlobal('window', { innerWidth: 480, innerHeight: 520 })
    try {
      const editorScroll = {
        getBoundingClientRect: () => ({ bottom: 360 }),
      }
      const editorSurface = {
        querySelector: vi.fn((selector: string) => (selector === '.note-aisle-scroll' ? editorScroll : null)),
      }
      const menuElement = {
        closest: vi.fn((selector: string) => (selector === '.vault-editor-surface' ? editorSurface : null)),
      } as unknown as Element

      expect(getVaultEditorContextMenuViewport(menuElement)).toEqual({ width: 480, height: 360 })
      expect(editorSurface.querySelector).toHaveBeenCalledWith('.note-aisle-scroll')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renders restored editor-essential actions without stale rows', () => {
    const html = renderMenu()

    ;[
      'Cut',
      'Copy',
      'Paste',
      'Paste as plain text',
      'Here',
      'New aisle on left',
      'New aisle on right',
      'Copy note as',
      'Copy aisle as',
      'Independent copy',
      'Synced copy',
      'Make this a copy of',
      'Format',
      'Bold',
      'Italic',
      'Strikethrough',
      'Highlight',
      'Inline code',
      'Paragraph',
      'Bullet list',
      'Dash list',
      'Numbered list',
      'Task list',
      'Heading 1',
      'Heading 6',
      'Quote block',
      'Block indent',
      'Remove block indent',
      'Insert',
      'URL link',
      'Note link',
      'Note preview',
      'To the left',
      'To the right',
      'Attachment',
      'Table',
      'Horizontal rule',
      'Code block',
      'Print aisle',
      'Export to PDF',
      'Export aisle',
      'Export note',
      'Reveal in Finder',
    ].forEach((label) => expect(html).toContain(label))

    expect(html.indexOf('Code block')).toBeLessThan(html.lastIndexOf('Reveal in Finder'))
    expect(html.indexOf('Print aisle')).toBeLessThan(html.lastIndexOf('Reveal in Finder'))
    expect(html.indexOf('Export to PDF')).toBeLessThan(html.lastIndexOf('Reveal in Finder'))
    expect(html.indexOf('Here')).toBeLessThan(html.indexOf('New aisle on left'))
    expect(html.indexOf('New aisle on left')).toBeLessThan(html.indexOf('New aisle on right'))
    expect(html).not.toContain('No synced item')
    expect(html).not.toContain('find &amp; replace')
    expect(html).not.toContain('find & replace')
  })

  it('shows de-couple actions only when they are available', () => {
    expect(renderMenu()).not.toContain('de-couple note')
    expect(renderMenu()).not.toContain('Decouple aisle')
    expect(renderMenu()).not.toContain('filter synced note')
    expect(renderMenu()).not.toContain('Show synced aisles')

    const linkedAisleHtml = renderMenu({ canDecoupleAisle: true })
    expect(linkedAisleHtml).toContain('Filter synced aisle')
    expect(linkedAisleHtml).toContain('Decouple aisle')
    expect(linkedAisleHtml).toContain('Show synced aisles')
    expect(linkedAisleHtml).not.toContain('filter synced note')
    expect(linkedAisleHtml).not.toContain('de-couple note')
  })

  it('shows edit link only when the right-click target is a link', () => {
    expect(renderMenu()).not.toContain('Edit link')
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
    })).toContain('Edit link')
  })

  it('routes ordinary aisle/editor targets and ignores toolbar or menu targets', () => {
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1'))).toBe('aisle-1')
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { ignored: true }))).toBeNull()
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { tableCell: true }))).toBeNull()
    expect(getVaultEditorContextMenuAisleIdFromTarget(null)).toBeNull()
  })

  it('keeps editor context menus above workspace chrome while clamping before it', () => {
    expect(overlaysCssSource).toContain('.tab-context-menu {\n  position: fixed;\n  z-index: 3300;')
    expect(overlaysCssSource).toContain('.tab-context-submenu-panel {\n  position: fixed;\n  z-index: 3301;')
    expect(readFileSync(join(sourceDir, './VaultEditorContextMenu.tsx'), 'utf8')).toContain(
      "?.querySelector<HTMLElement>('.note-aisle-scroll')",
    )
  })
})

describe('vault editor context menu wiring', () => {
  it('routes note right-clicks to the editor menu instead of the synced-item menu', () => {
    expect(vaultAppSource).toContain('onContextMenu={openVaultEditorContextMenuFromPointer}')
    expect(vaultAppSource).toContain('getVaultEditorContextMenuAisleIdFromTarget(target)')
    expect(vaultAppSource).toContain('setEditorContextMenu({ aisleId, x, y, linkPrompt: options.linkPrompt ?? null })')
    expect(vaultAppSource).toContain('if (!menu || !canDecoupleAisle) return null')
    expect(vaultAppSource).not.toContain('openAisleContextMenuFromPointer')
    expect(vaultAppSource).not.toContain('No synced item')
  })

  it('wires context-menu paste, commands, and attachments to vault editor helpers', () => {
    expect(vaultAppSource).toContain(
      "addAisle(destination === 'new-aisle-left' ? 'left' : 'right', aisleId, result.markdown)",
    )
    expect(vaultAppSource).toContain('pasteVaultStructureClipboard(aisleId)')
    expect(vaultAppSource).not.toContain('pasteFrontmatterClipboard(aisleId)')
    expect(vaultAppSource).not.toContain('buildFrontmatterClipboardPasteForAisle(')
    expect(vaultAppSource).toContain('buildVaultStructureClipboardPayload(currentState')
    expect(vaultAppSource).toContain('writeVaultStructureClipboardPayload(result.payload, result.markdown)')
    expect(vaultAppSource).toContain('onCommand={vaultEditors.runCommand}')
    expect(vaultAppSource).toContain('onEditLink={openUrlLinkPrompt}')
    expect(vaultAppSource).toContain('onInsertAttachment={vaultEditors.insertAttachmentFile}')
    expect(vaultAppSource).toContain('onCopyAs={copyVaultStructureAs}')
    expect(vaultAppSource).toContain('onRevealLocation={revealEditorContextLocation}')
    expect(vaultAppSource).toContain('onPrintAisle={printAisle}')
    expect(vaultAppSource).toContain('onExportPdf={exportPdf}')
    expect(vaultAppSource).toContain('window.electronAPI?.onPrintActiveAisleRequested?.(() => printAisle(renderedActiveAisleId))')
    expect(readFileSync(join(sourceDir, './VaultEditorContextMenu.tsx'), 'utf8')).toContain('runAisleAction(onPrintAisle)')
    expect(readFileSync(join(sourceDir, './VaultEditorContextMenu.tsx'), 'utf8')).toContain('runPdfExport')
    expect(vaultAppSource).toContain("trigger: 'vault-editor-reveal-location'")
    expect(vaultAppSource).toContain('const latest = getLatestVaultStateFromMountedEditors()')
    expect(vaultAppSource).toContain('pendingEditorCount: latest.pendingEditorCount')
    expect(vaultAppSource).toContain('revealNoteLocation(payload)')
    expect(vaultEditorsSource).toContain('onVaultStructurePaste')
    expect(vaultEditorsSource).not.toContain('onFrontmatterPaste')
    expect(vaultEditorsSource).not.toContain('readFrontmatterClipboardPayloadFromDataTransfer')
    expect(vaultEditorsSource).not.toContain('readFrontmatterClipboardPayloadFromNavigator')
    expect(vaultEditorsSource).toContain('readVaultStructureClipboardPayloadFromDataTransfer(event.clipboardData)')
    expect(vaultEditorsSource).toContain('readClipboardMarkdownForPaste')
    expect(vaultEditorsSource).toContain('insertVisualClipboardMarkdownIntoView')
    expect(vaultEditorsSource).toContain('insertAssetLinksIntoWysiwygView')
    expect(vaultEditorsSource).toContain('buildMediaMarkdownLink')
  })
})
