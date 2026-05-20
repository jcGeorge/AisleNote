import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { NoteWorkspace } from './NoteWorkspace'
import { shouldExitArrangeModeFromNoteWorkspacePointer } from './note-workspace-events'
import type { NoteAisle } from '../../types/app'

const aisles: NoteAisle[] = [
  { id: 'a', markdown: 'active' },
  { id: 'b', markdown: 'fallback **preview**' },
  { id: 'c', markdown: 'far' },
]

function renderWorkspace(mountedAisleIds: Set<string>) {
  return renderToStaticMarkup(
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

  it('renders data image previews without stripping the image URL', () => {
    const imageAisles: NoteAisle[] = [{ id: 'image', markdown: '![Diagram](data:image/png;base64,abc)' }]
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
  })

  it('renders fallback block indents without exposing the storage marker', () => {
    const blockIndentAisles: NoteAisle[] = [{ id: 'indent', markdown: `${BLOCK_INDENT_TOKEN}indented` }]
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

  it('only exits arrangement mode for primary note workspace clicks while arranging', () => {
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 0)).toBe(true)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 1)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 2)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(false, 0)).toBe(false)
  })
})
