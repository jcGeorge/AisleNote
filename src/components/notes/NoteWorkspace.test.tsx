import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { NoteWorkspace } from './NoteWorkspace'
import { shouldExitArrangeModeFromNoteWorkspacePointer } from './note-workspace-events'
import type { ResolvedNoteAisle } from '../../types/app'

const aisles: ResolvedNoteAisle[] = [
  { id: 'a', aisleBodyId: 'a', markdown: 'active' },
  { id: 'b', aisleBodyId: 'b', markdown: 'fallback **preview**' },
  { id: 'c', aisleBodyId: 'c', markdown: 'far' },
]

function renderWorkspace(
  mountedAisleIds: Set<string>,
  options: {
    activeAisleId?: string
    aisles?: ResolvedNoteAisle[]
    frontmatterAisleIds?: Set<string>
    linkedAisleIds?: Set<string>
    wholeNoteLinked?: boolean
    scratchpadAisleControls?: {
      canDeleteActiveAisle: boolean
      onAddAisleLeft: () => void
      onAddAisleRight: () => void
      onDeleteActiveAisle: () => void
    }
  } = {},
) {
  return renderToStaticMarkup(
    <NoteWorkspace
      noteBodyId="body-1"
      aisles={options.aisles ?? aisles}
      activeAisleId={options.activeAisleId ?? 'a'}
      editorReadOnly={false}
      frontmatterAisleIds={options.frontmatterAisleIds}
      linkedAisleIds={options.linkedAisleIds}
      wholeNoteLinked={options.wholeNoteLinked}
      scratchpadAisleControls={options.scratchpadAisleControls}
      aisleScrollRef={{ current: null }}
      toolbar={null}
      headingPopover={null}
      imageToolsOverlay={null}
      tableControlsOverlay={null}
      mountedAisleIds={mountedAisleIds}
      getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
      onRootChange={() => undefined}
      onAisleScroll={() => undefined}
      onActivateAisle={() => undefined}
      onRegisterAislePaneRoot={() => undefined}
      onRegisterAisleEditorRoot={() => undefined}
    />,
  )
}

const scratchpadAisleControls = (canDeleteActiveAisle: boolean) => ({
  canDeleteActiveAisle,
  onAddAisleLeft: () => undefined,
  onAddAisleRight: () => undefined,
  onDeleteActiveAisle: () => undefined,
})

describe('NoteWorkspace aisle mounting', () => {
  it('keeps every aisle pane in the scroll strip while only mounted aisles get editor hosts', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html.match(/class="note-aisle-pane/g) ?? []).toHaveLength(3)
    expect(html).toContain('data-aisle-id="a"')
    expect(html).toContain('data-aisle-id="b"')
    expect(html).toContain('data-aisle-id="c"')
    expect(html.match(/data-aisle-editor-key="body-1::a"/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('data-aisle-editor-key="body-1::b" class="toast-editor-host"')
    expect(html).toContain('aisle-editor-preview-fallback')
    expect(html).toContain('<strong>preview</strong>')
  })

  it('marks editor and preview hosts as separate DOM ownership modes', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).toContain('data-aisle-editor-key="body-1::a" data-aisle-host-mode="editor"')
    expect(html.match(/data-aisle-host-mode="preview"/g) ?? []).toHaveLength(2)
  })

  it('renders the custom horizontal aisle scrollbar for split notes', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).toContain('note-aisle-horizontal-scrollbar')
    expect(html).toContain('note-aisle-horizontal-scrollbar-track')
    expect(html).toContain('note-aisle-horizontal-scrollbar-thumb')
    expect(html).toContain('role="scrollbar"')
    expect(html).toContain('aria-label="Scroll aisles horizontally"')
  })

  it('renders data image previews without stripping the image URL', () => {
    const imageAisles: ResolvedNoteAisle[] = [{ id: 'image', aisleBodyId: 'image', markdown: '![Diagram](data:image/png;base64,abc)' }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={imageAisles}
        activeAisleId="image"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('src="data:image/png;base64,abc"')
    expect(html).not.toContain('note-aisle-horizontal-scrollbar')
  })

  it('renders fallback aisles that start with a heading', () => {
    const headingAisles: ResolvedNoteAisle[] = [{ id: 'heading', aisleBodyId: 'heading', markdown: '# Top heading' }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={headingAisles}
        activeAisleId="heading"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('aisle-editor-preview-fallback')
    expect(html).toContain('<h1>Top heading</h1>')
  })

  it('renders fallback block indents without exposing the storage marker', () => {
    const blockIndentAisles: ResolvedNoteAisle[] = [{ id: 'indent', aisleBodyId: 'indent', markdown: `${BLOCK_INDENT_TOKEN}indented` }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={blockIndentAisles}
        activeAisleId="indent"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('class="tabs-block-indent"')
    expect(html).toContain('indented')
    expect(html).not.toContain(BLOCK_INDENT_TOKEN)
  })

  it('does not render the retired floating link prompt overlay', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).not.toContain('class="link-prompt')
  })

  it('renders no aisle action buttons for plain aisles', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).not.toContain('note-aisle-action-layer')
    expect(html).not.toContain('note-aisle-link-btn')
    expect(html).not.toContain('note-aisle-frontmatter-btn')
    expect(html).not.toContain('note-scratchpad-aisle-controls')
  })

  it('renders scratchpad controls only for the active aisle', () => {
    const html = renderWorkspace(new Set(['b']), {
      activeAisleId: 'b',
      scratchpadAisleControls: scratchpadAisleControls(true),
    })

    expect(html.match(/note-scratchpad-aisle-controls/g) ?? []).toHaveLength(1)
    expect(html).toContain('Scratchpad aisle 2 controls')
    expect(html).not.toContain('Scratchpad aisle 1 controls')
    expect(html).not.toContain('Scratchpad aisle 3 controls')
    expect(html).toContain('Add aisle to left of aisle 2')
    expect(html).toContain('Add aisle to right of aisle 2')
    expect(html).toContain('Delete aisle 2')
    expect(html).toContain('aisle-edit-delete-icon note-scratchpad-aisle-delete-icon')
  })

  it('hides scratchpad delete when only one aisle remains', () => {
    const singleAisle: ResolvedNoteAisle[] = [{ id: 'solo', aisleBodyId: 'solo', markdown: 'single' }]
    const html = renderWorkspace(new Set(['solo']), {
      aisles: singleAisle,
      activeAisleId: 'solo',
      scratchpadAisleControls: scratchpadAisleControls(false),
    })

    expect(html).toContain('Scratchpad aisle 1 controls')
    expect(html.match(/note-scratchpad-aisle-add-btn/g) ?? []).toHaveLength(2)
    expect(html).toContain('Add aisle to left of aisle 1')
    expect(html).toContain('Add aisle to right of aisle 1')
    expect(html).not.toContain('Delete aisle 1')
    expect(html).not.toContain('note-scratchpad-aisle-delete-btn')
    expect(html).not.toContain('aisle-edit-delete-icon note-scratchpad-aisle-delete-icon')
  })

  it('renders fm only for aisles with valid frontmatter', () => {
    const html = renderWorkspace(new Set(['a']), { frontmatterAisleIds: new Set(['b']) })

    expect(html.match(/note-aisle-frontmatter-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Open frontmatter for aisle 2')
    expect(html).toContain('frontmatter-toolbar-icon note-aisle-frontmatter-icon')
    expect(html).toContain('>fm</span>')
    expect(html).not.toContain('note-aisle-link-btn')
  })

  it('renders link buttons for linked aisle bodies', () => {
    const html = renderWorkspace(new Set(['a']), { linkedAisleIds: new Set(['b']) })

    expect(html.match(/note-aisle-link-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Open link controls for aisle 2')
    expect(html).toContain('toastui-editor-toolbar-icons link note-aisle-link-icon')
    expect(html).not.toContain('note-aisle-frontmatter-btn')
  })

  it('renders link buttons on every aisle when the whole note is linked', () => {
    const html = renderWorkspace(new Set(['a']), { wholeNoteLinked: true })

    expect(html.match(/note-aisle-link-btn/g) ?? []).toHaveLength(3)
  })

  it('orders aisle action buttons as link then fm', () => {
    const html = renderWorkspace(new Set(['a']), {
      frontmatterAisleIds: new Set(['b']),
      linkedAisleIds: new Set(['b']),
    })

    expect(html.indexOf('note-aisle-link-btn')).toBeLessThan(html.indexOf('note-aisle-frontmatter-btn'))
  })

  it('renders table of contents panels only for open aisles with headings', () => {
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={aisles}
        activeAisleId="a"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        tableOfContentsHeadingsByAisle={{
          a: [
            { aisleId: 'a', key: 'heading-a', level: 1, text: 'Alpha', occurrence: 0 },
            { aisleId: 'a', key: 'heading-b', level: 3, text: 'Nested', occurrence: 0 },
          ],
          b: [],
        }}
        openTableOfContentsAisleIds={new Set(['a', 'b'])}
        mountedAisleIds={new Set(['a'])}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html.match(/class="aisle-toc-panel"/g) ?? []).toHaveLength(1)
    expect(html).toContain('class="aisle-toc-panel-layer"')
    expect(html).toContain('Alpha')
    expect(html).toContain('Nested')
    expect(html).toContain('--toc-heading-indent:1.56rem')
    expect(html).not.toContain('delete-modal-backdrop')
    expect(html).not.toContain('modal-backdrop')
  })

  it('renders a links-only table of contents panel without the headings section', () => {
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={aisles}
        activeAisleId="a"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        tableOfContentsLinksByAisle={{
          a: [
            {
              aisleId: 'a',
              key: 'a|link|0',
              kind: 'url-link',
              label: 'Example',
              href: 'https://example.com',
            },
          ],
        }}
        openTableOfContentsAisleIds={new Set(['a'])}
        mountedAisleIds={new Set(['a'])}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('class="aisle-toc-panel"')
    expect(html).toContain('>links</div>')
    expect(html).toContain('Example')
    expect(html).toContain('aisle-toc-link-open-btn')
    expect(html).not.toContain('>table of contents</div>')
    expect(html).not.toContain('--toc-heading-indent')
  })

  it('only exits arrangement mode for primary note workspace clicks while arranging', () => {
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 0)).toBe(true)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 1)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 2)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(false, 0)).toBe(false)
  })
})
