import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuState } from '../../types/app'
import { ContextMenuHost } from './ContextMenuHost'

function renderContextMenu(contextMenu: ContextMenuState, duplicateCount = 1) {
  const noop = vi.fn()
  return renderToStaticMarkup(
    <ContextMenuHost
      contextMenu={contextMenu}
      canDeleteSpace
      duplicateCount={duplicateCount}
      onClose={noop}
      onEnterArrangeMode={noop}
      onDuplicateSpace={noop}
      onRenameSpace={noop}
      onRenameDomain={noop}
      onCopyImage={noop}
      onOpenInternalNoteLink={noop}
      onRenameInternalNoteLink={noop}
      onOpenDeleteModal={noop}
      onOpenDeduplicateModal={noop}
      onOpenCopyModal={noop}
      onMoveToTrash={noop}
    />,
  )
}

describe('ContextMenuHost copy actions', () => {
  it('shows one make copy action for normal tabs and no make duplicate action', () => {
    const html = renderContextMenu({ type: 'tab', tabId: 'tab-1', x: 0, y: 0 })

    expect(html).toContain('make copy')
    expect(html).not.toContain('make duplicate')
  })

  it('keeps de-couple available for already linked notes', () => {
    const html = renderContextMenu({ type: 'subtab', tabId: 'tab-1', subTabId: 'sub-1', x: 0, y: 0 }, 2)

    expect(html).toContain('make copy')
    expect(html).toContain('de-couple')
  })

  it('only shows make copy for the home subtab context menu', () => {
    const html = renderContextMenu({ type: 'home-tab', tabId: 'tab-1', x: 0, y: 0 })

    expect(html).toContain('make copy')
    expect(html).not.toContain('arrange')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('delete now')
    expect(html).not.toContain('de-couple')
  })
})
