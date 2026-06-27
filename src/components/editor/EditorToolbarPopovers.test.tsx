import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CopyToolbarMenu, EditorToolbarPopovers } from './EditorToolbarPopovers'

describe('EditorToolbarPopovers', () => {
  it('does not render toolbar popovers while disabled', () => {
    const html = renderToStaticMarkup(
      <EditorToolbarPopovers
        disabled
        copyMenuOpen
        headingMenuOpen
        activeHeadingLevel={0}
        toolbarPopoverPosition={{
          copy: { top: 1, left: 1 },
          heading: { top: 1, left: 1 },
        }}
        onExecuteToolbarCommand={() => undefined}
        onOpenCopyModal={() => undefined}
        onFilterSyncedItem={() => undefined}
        onQuickDecoupleSyncedItem={() => undefined}
        onShowSyncedItems={() => undefined}
      />,
    )

    expect(html).toBe('')
  })

  it('does not render an aisle popover because the toolbar button opens edit aisles directly', () => {
    const html = renderToStaticMarkup(
      <EditorToolbarPopovers
        copyMenuOpen={false}
        headingMenuOpen={false}
        activeHeadingLevel={0}
        toolbarPopoverPosition={{
          copy: null,
          heading: null,
        }}
        onExecuteToolbarCommand={() => undefined}
        onOpenCopyModal={() => undefined}
        onFilterSyncedItem={() => undefined}
        onQuickDecoupleSyncedItem={() => undefined}
        onShowSyncedItems={() => undefined}
      />,
    )

    expect(html).not.toContain('note-toolbar-aisle-popover')
    expect(html).not.toContain('edit aisles')
    expect(html).not.toContain('add aisle')
  })
})

describe('CopyToolbarMenu', () => {
  it('renders make this a copy of without synced choices when nothing is synced', () => {
    const html = renderToStaticMarkup(
      <CopyToolbarMenu
        onOpenCopyModal={() => undefined}
        onFilterSyncedItem={() => undefined}
        onQuickDecoupleSyncedItem={() => undefined}
        onShowSyncedItems={() => undefined}
      />,
    )

    expect(html).toContain('make this a copy of')
    expect(html).not.toContain('filter synced')
    expect(html).not.toContain('decouple')
    expect(html).not.toContain('show synced')
  })

  it('renders synced aisle choices when a synced aisle is active', () => {
    const html = renderToStaticMarkup(
      <CopyToolbarMenu
        syncedItemKind="aisle"
        onOpenCopyModal={() => undefined}
        onFilterSyncedItem={() => undefined}
        onQuickDecoupleSyncedItem={() => undefined}
        onShowSyncedItems={() => undefined}
      />,
    )

    expect(html).toContain('filter synced aisle')
    expect(html).toContain('decouple aisle')
    expect(html).toContain('show synced aisles')
    expect(html).not.toContain('filter synced note')
  })
})
