import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  VaultEditorContextMenu,
  getVaultEditorContextMenuAisleIdFromTarget,
  type VaultEditorContextMenuState,
} from './VaultEditorContextMenu'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const vaultAppSource = readFileSync(join(sourceDir, '../../app/VaultApp.tsx'), 'utf8')
const vaultEditorsSource = readFileSync(join(sourceDir, '../../editor/useVaultAisleEditors.ts'), 'utf8')

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
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1'))).toBe('aisle-1')
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { ignored: true }))).toBeNull()
    expect(getVaultEditorContextMenuAisleIdFromTarget(fakeTarget('aisle-1', { tableCell: true }))).toBeNull()
    expect(getVaultEditorContextMenuAisleIdFromTarget(null)).toBeNull()
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
    expect(vaultAppSource).toContain('pasteFrontmatterClipboard(aisleId)')
    expect(vaultAppSource).toContain('pasteVaultStructureClipboard(aisleId)')
    expect(vaultAppSource).toContain('buildFrontmatterClipboardPasteForAisle(')
    expect(vaultAppSource).toContain('buildVaultStructureClipboardPayload(currentState')
    expect(vaultAppSource).toContain('writeVaultStructureClipboardPayload(result.payload, result.markdown)')
    expect(vaultAppSource).toContain('onCommand={vaultEditors.runCommand}')
    expect(vaultAppSource).toContain('onEditLink={openUrlLinkPrompt}')
    expect(vaultAppSource).toContain('onInsertAttachment={vaultEditors.insertAttachmentFile}')
    expect(vaultAppSource).toContain('onCopyAs={copyVaultStructureAs}')
    expect(vaultAppSource).toContain('onRevealLocation={revealEditorContextLocation}')
    expect(vaultAppSource).toContain("trigger: 'vault-editor-reveal-location'")
    expect(vaultAppSource).toContain('const latest = getLatestVaultStateFromMountedEditors()')
    expect(vaultAppSource).toContain('pendingEditorCount: latest.pendingEditorCount')
    expect(vaultAppSource).toContain('revealNoteLocation(payload)')
    expect(vaultEditorsSource).toContain('onVaultStructurePaste')
    expect(vaultEditorsSource).toContain('onFrontmatterPaste')
    expect(vaultEditorsSource).toContain('readFrontmatterClipboardPayloadFromDataTransfer(event.clipboardData, {')
    expect(vaultEditorsSource).toContain('readFrontmatterClipboardPayloadFromNavigator(undefined, {')
    expect(vaultEditorsSource).toContain('readVaultStructureClipboardPayloadFromDataTransfer(event.clipboardData)')
    expect(vaultEditorsSource).toContain('readClipboardMarkdownForPaste')
    expect(vaultEditorsSource).toContain('insertVisualClipboardMarkdownIntoView')
    expect(vaultEditorsSource).toContain('insertAssetLinksIntoWysiwygView')
    expect(vaultEditorsSource).toContain('buildMediaMarkdownLink')
  })
})
