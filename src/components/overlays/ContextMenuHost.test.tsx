import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuState } from '../../types/app'
import { clampContextMenuPosition, ContextMenuHost, getSubmenuPosition } from './ContextMenuHost'

type ContextMenuHostProps = Parameters<typeof ContextMenuHost>[0]

function createContextMenuProps(
  contextMenu: ContextMenuState,
  duplicateCount = 1,
  overrides: Partial<ContextMenuHostProps> = {},
): ContextMenuHostProps {
  const noop = vi.fn()
  return {
    contextMenu,
    canDeleteSpace: true,
    canDeleteDomain: true,
    duplicateCount,
    onClose: noop,
    onEnterArrangeMode: noop,
    onDuplicateSpace: noop,
    onRenameSpace: noop,
    onRenameDomain: noop,
    onCopyImage: noop,
    onOpenInternalNoteLink: noop,
    onRenameInternalNoteLink: noop,
    onOpenDeleteModal: noop,
    onOpenDeduplicateModal: noop,
    onOpenCopyModal: noop,
    onMoveToTrash: noop,
    onRestoreFromTrash: noop,
    onEditorClipboard: noop,
    onEditorCommand: noop,
    onEditorInsertLink: noop,
    onEditorInsertAttachment: noop,
    onEditorFindReplace: noop,
    onEditorOpenContextLink: noop,
    onEditorEditContextLink: noop,
    ...overrides,
  }
}

function renderContextMenu(contextMenu: ContextMenuState, duplicateCount = 1) {
  return renderToStaticMarkup(<ContextMenuHost {...createContextMenuProps(contextMenu, duplicateCount)} />)
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

  it('shows arrange, rename, and delete for domain context menus', () => {
    const html = renderContextMenu({ type: 'domain', domainId: 'domain-1', x: 0, y: 0 })

    expect(html).toContain('arrange')
    expect(html).toContain('rename')
    expect(html).toContain('delete')
  })

  it('shows editor clipboard actions, root make copy, and expandable command groups', () => {
    const html = renderContextMenu({ type: 'editor', x: 0, y: 0 })

    expect(html).toContain('cut')
    expect(html).toContain('copy')
    expect(html).toContain('paste as plain text')
    expect(html).toContain('add link')
    expect(html).toContain('find &amp; replace')
    expect(html).toContain('make copy')
    expect(html).toContain('format')
    expect(html).toContain('paragraph')
    expect(html).toContain('insert')
    expect(html).toContain('inline code')
    expect(html).toContain('task list')
    expect(html).toContain('heading 6')
    expect(html).toContain('note link')
    expect(html).toContain('attachment')
    expect(html).toContain('code block')
  })

  it('shows contextual link actions inside the editor menu', () => {
    const html = renderContextMenu({
      type: 'editor',
      x: 0,
      y: 0,
      link: {
        type: 'external',
        label: 'docs',
        href: 'https://example.com',
        range: null,
      },
    })

    expect(html).toContain('open link')
    expect(html).toContain('edit link')
    expect(html).toContain('find &amp; replace')
  })

  it('shows restore and permanent delete actions for trash items', () => {
    const html = renderContextMenu({
      type: 'trash-subtab',
      source: 'subtabs-only',
      deletedTabEntryId: null,
      parentTabId: 'parent-1',
      subTabId: 'deleted-sub-1',
      x: 0,
      y: 0,
    })

    expect(html).toContain('restore')
    expect(html).toContain('delete for real')
  })
})

describe('ContextMenuHost positioning', () => {
  it('clamps root menus to the right and bottom viewport edges', () => {
    expect(
      clampContextMenuPosition(
        { x: 790, y: 590 },
        { width: 100, height: 50 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ left: 692, top: 542 })
  })

  it('opens submenus to the right when there is room', () => {
    expect(
      getSubmenuPosition(
        { x: 100, y: 100, width: 120, height: 24, right: 220, bottom: 124 },
        { width: 160, height: 120 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ left: 219, top: 100 })
  })

  it('flips submenus left when the right side would clip', () => {
    expect(
      getSubmenuPosition(
        { x: 700, y: 100, width: 80, height: 24, right: 780, bottom: 124 },
        { width: 160, height: 120 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ left: 541, top: 100 })
  })

  it('clamps submenu top upward near the bottom edge', () => {
    expect(
      getSubmenuPosition(
        { x: 100, y: 560, width: 120, height: 24, right: 220, bottom: 584 },
        { width: 160, height: 120 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ left: 219, top: 472 })
  })
})
