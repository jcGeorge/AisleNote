import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { NoteWorkspace } from './NoteWorkspace'
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
})
