import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrashRailDragPreviewOverlay, type TrashRailDragPreview } from './TrashRailDragPreviewOverlay'

const componentDir = dirname(fileURLToPath(import.meta.url))

function preview(kind: TrashRailDragPreview['kind']): TrashRailDragPreview {
  return {
    kind,
    draggedId: 'item-a',
    selectedIds: ['item-a', 'item-b'],
    targets: [{ type: 'trash-domain', deletedDomainEntryId: 'deleted-a', domainId: 'domain-a' }],
    label: 'Item A',
    dragCount: 2,
    ghostItems: [{ id: 'item-b', label: 'Item B', x: -32, y: 0, width: 92, height: 26 }],
    currentX: 120,
    currentY: 90,
    offsetX: 12,
    offsetY: 8,
    width: 96,
    height: 28,
  }
}

describe('TrashRailDragPreviewOverlay', () => {
  it('renders selected trash item stacks with existing rail preview classes', () => {
    const domainHtml = renderToStaticMarkup(<TrashRailDragPreviewOverlay preview={preview('domain')} />)
    const parentHtml = renderToStaticMarkup(<TrashRailDragPreviewOverlay preview={preview('parent')} />)

    expect(domainHtml).toContain('compact-scope-arrange-preview')
    expect(domainHtml).toContain('compact-domain-btn')
    expect(parentHtml).toContain('tab-arrange-preview is-parent')
    expect(parentHtml).toContain('Item A')
    expect(parentHtml).toContain('Item B')
  })

  it('keeps trash rail data attributes available for drag ghost lookup', () => {
    expect(readFileSync(join(componentDir, 'CompactScopeRails.tsx'), 'utf8')).toContain('data-trash-domain-id')
    expect(readFileSync(join(componentDir, 'CompactScopeRails.tsx'), 'utf8')).toContain('data-trash-space-id')
    expect(readFileSync(join(componentDir, 'TopBar.tsx'), 'utf8')).toContain('data-trash-parent-id')
    expect(readFileSync(join(componentDir, 'SubTabRail.tsx'), 'utf8')).toContain('data-trash-subtab-id')
  })
})

