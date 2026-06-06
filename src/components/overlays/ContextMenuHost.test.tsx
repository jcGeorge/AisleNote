import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuState } from '../../types/app'
import { ContextMenuHost } from './ContextMenuHost'
import { clampContextMenuPosition, getSubmenuPosition } from './context-menu-position'

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
    onRevealMediaFile: noop,
    onOpenInternalNoteLink: noop,
    onRenameInternalNoteLink: noop,
    onOpenDeduplicateModal: noop,
    onOpenCopyModal: noop,
    onMoveToTrash: noop,
    onRestoreFromTrash: noop,
    onEditorClipboard: noop,
    onEditorCommand: noop,
    onEditorInsertLink: noop,
    onEditorInsertAisle: noop,
    onEditorInsertAttachment: noop,
    onEditorFindReplace: noop,
    onEditorOpenContextLink: noop,
    onEditorEditContextLink: noop,
    onEditorReplaceMisspelling: noop,
    onEditorAddWordToDictionary: noop,
    onEditorLookUpSelection: noop,
    onRevealNoteLocation: noop,
    editorNoteRevealLabel: null,
    onOpenScratchpadAbout: noop,
    copyAsMenu: null,
    onCopyAs: noop,
    onCopyAsUnavailable: noop,
    ...overrides,
  }
}

function renderContextMenu(contextMenu: ContextMenuState, duplicateCount = 1) {
  return renderToStaticMarkup(<ContextMenuHost {...createContextMenuProps(contextMenu, duplicateCount)} />)
}

describe('ContextMenuHost copy actions', () => {
  it('shows make copy for normal tabs', () => {
    const html = renderContextMenu({ type: 'tab', tabId: 'tab-1', x: 0, y: 0 })

    expect(html).toContain('make copy')
    expect(html).toContain('trash it')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('delete now')
  })

  it('shows copy note as and copy aisle as submenus for multi-aisle notes', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'tab', tabId: 'tab-1', x: 0, y: 0 }, 1, {
          copyAsMenu: {
            note: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: false, reason: 'Copy a specific aisle as preview for notes with multiple aisles.' },
            },
            aisle: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
          },
        })}
      />,
    )

    expect(html).toContain('copy note as')
    expect(html).toContain('copy aisle as')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('synced copy')
    expect(html).toContain('note preview')
    expect(html).toMatch(
      /copy note as[\s\S]*>independent copy<\/button>[\s\S]*>synced copy<\/button>[\s\S]*role="separator"[\s\S]*>note link<\/button>[\s\S]*>note preview<\/button>/,
    )
  })

  it('shows copy note as and copy aisle as submenus for the active editor note', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'editor', x: 0, y: 0 }, 1, {
          copyAsMenu: {
            note: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: false, reason: 'Copy a specific aisle as preview for notes with multiple aisles.' },
            },
            aisle: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
          },
        })}
      />,
    )

    expect(html).toContain('make copy')
    expect(html).toContain('copy note as')
    expect(html).toContain('copy aisle as')
  })

  it('shows copy aisle as for a plain single-aisle editor note', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'editor', x: 0, y: 0 }, 1, {
          copyAsMenu: {
            note: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
            aisle: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
          },
        })}
      />,
    )

    expect(html).toContain('copy note as')
    expect(html).toContain('copy aisle as')
  })

  it('hides copy aisle as from subtab rail context menus', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'subtab', tabId: 'tab-1', subTabId: 'sub-1', x: 0, y: 0 }, 1, {
          copyAsMenu: {
            note: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
            aisle: {
              duplicate: { available: true },
              link: { available: true },
              copy: { available: true },
              preview: { available: true },
            },
          },
        })}
      />,
    )

    expect(html).toContain('copy note as')
    expect(html).not.toContain('copy aisle as')
  })

  it('renders unavailable copy-as actions as clickable aria-disabled menu rows', () => {
    const onCopyAsUnavailable = vi.fn()
    const props = createContextMenuProps({ type: 'tab', tabId: 'tab-1', x: 0, y: 0 }, 1, {
      copyAsMenu: {
        note: {
          duplicate: { available: true },
          link: { available: true },
          copy: { available: true },
          preview: { available: false, reason: 'no preview' },
        },
      },
      onCopyAsUnavailable,
    })
    const html = renderToStaticMarkup(<ContextMenuHost {...props} />)

    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('disabled=""')
  })

  it('keeps de-couple available for already linked notes', () => {
    const html = renderContextMenu({ type: 'subtab', tabId: 'tab-1', subTabId: 'sub-1', x: 0, y: 0 }, 2)

    expect(html).toContain('make copy')
    expect(html).toContain('de-couple')
  })

  it('keeps home subtab context menus limited to copy actions', () => {
    const html = renderContextMenu({ type: 'home-tab', tabId: 'tab-1', x: 0, y: 0 })

    expect(html).toContain('make copy')
    expect(html).not.toContain('arrange')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('trash it')
    expect(html).not.toContain('delete now')
    expect(html).not.toContain('de-couple')
  })

  it('shows arrange, rename, and trash it for domain context menus', () => {
    const html = renderContextMenu({ type: 'domain', domainId: 'domain-1', x: 0, y: 0 })

    expect(html).toContain('arrange')
    expect(html).toContain('rename')
    expect(html).toContain('trash it')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('delete now')
  })

  it('shows duplicate, rename, and trash it for space context menus', () => {
    const html = renderContextMenu({ type: 'space', spaceId: 'space-1', x: 0, y: 0 })

    expect(html).toContain('duplicate')
    expect(html).toContain('rename')
    expect(html).toContain('trash it')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('delete now')
  })

  it('keeps the space trash action clickable when it is the only space', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'space', spaceId: 'space-1', x: 0, y: 0 }, 1, {
          canDeleteSpace: false,
        })}
      />,
    )

    expect(html).toContain('trash it')
    expect(html).not.toContain('disabled=""')
  })

  it('keeps domain trash action clickable when it is the only domain', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'domain', domainId: 'domain-1', x: 0, y: 0 }, 1, {
          canDeleteDomain: false,
        })}
      />,
    )

    expect(html).toContain('trash it')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('delete now')
    expect(html).not.toContain('disabled=""')
  })

  it('shows reveal file for media context menus', () => {
    const html = renderContextMenu({
      type: 'media',
      kind: 'audio',
      source: 'tabs-asset:///assets/song.mp3',
      x: 0,
      y: 0,
    })

    expect(html).toContain('reveal file')
    expect(html).not.toContain('copy image')
  })

  it('shows editor clipboard actions, root make copy, and expandable command groups', () => {
    const html = renderContextMenu({ type: 'editor', x: 0, y: 0 })

    expect(html).toContain('cut')
    expect(html).toContain('copy')
    expect(html).toContain('paste as plain text')
    expect(html).toContain('new aisle on left')
    expect(html).toContain('new aisle on right')
    expect(html).toContain('here')
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
    expect(html).toContain('aisle')
    expect(html).toContain('to the left')
    expect(html).toContain('to the right')
    expect(html).toContain('attachment')
    expect(html).toContain('code block')
    expect(html).toMatch(
      /paste[\s\S]*>new aisle on left<\/button>[\s\S]*>new aisle on right<\/button>[\s\S]*>here<\/button>[\s\S]*paste as plain text[\s\S]*>new aisle on left<\/button>[\s\S]*>new aisle on right<\/button>[\s\S]*>here<\/button>/,
    )
    expect(html).toMatch(
      /insert[\s\S]*>note link<\/button>[\s\S]*>url link<\/button>[\s\S]*role="separator"[\s\S]*>aisle<span aria-hidden="true">›<\/span><\/button>[\s\S]*>to the left<\/button>[\s\S]*>to the right<\/button>[\s\S]*role="separator"[\s\S]*>attachment<\/button>[\s\S]*>table<\/button>[\s\S]*>horizontal rule<\/button>[\s\S]*role="separator"[\s\S]*>code block<\/button>/,
    )
  })

  it('shows dictionary actions at the top of editor context menus', () => {
    const html = renderContextMenu({
      type: 'editor',
      x: 0,
      y: 0,
      dictionary: {
        suggestions: ['receive', 'recipe'],
        misspelledWord: 'recieve',
        selectionText: 'recieve',
        canLookUpSelection: true,
      },
    })

    expect(html).toMatch(
      />receive<\/button>[\s\S]*>recipe<\/button>[\s\S]*>Add to Dictionary<\/button>[\s\S]*>Look Up<\/button>[\s\S]*role="separator"[\s\S]*>cut<\/button>/,
    )
  })

  it('shows note reveal at the bottom of desktop editor context menus', () => {
    const html = renderToStaticMarkup(
      <ContextMenuHost
        {...createContextMenuProps({ type: 'editor', x: 0, y: 0 }, 1, {
          editorNoteRevealLabel: 'Reveal in Finder',
        })}
      />,
    )

    expect(html).toMatch(/>code block<\/button>[\s\S]*role="separator"[\s\S]*>Reveal in Finder<\/button>/)
  })

  it('hides note reveal in browser editor context menus', () => {
    const html = renderContextMenu({ type: 'editor', x: 0, y: 0 })

    expect(html).not.toContain('Reveal in Finder')
    expect(html).not.toContain('Show in Folder')
  })

  it('shows only about scratchpad for scratchpad context menus', () => {
    const html = renderContextMenu({ type: 'scratchpad', x: 0, y: 0 })

    expect(html).toContain('about scratchpad')
    expect(html).not.toContain('make copy')
    expect(html).not.toContain('move to trash')
    expect(html).not.toContain('trash it')
    expect(html).not.toContain('arrange')
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

  it('shows restore without permanent delete actions for trash items', () => {
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
    expect(html).not.toContain('delete for real')
    expect(html).not.toContain('delete now')
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
