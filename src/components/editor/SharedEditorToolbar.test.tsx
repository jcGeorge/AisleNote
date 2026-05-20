import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TOOLBAR_FORMAT_STATE } from './toolbar-state'
import { SharedEditorToolbar } from './SharedEditorToolbar'

describe('SharedEditorToolbar block quote and block indent controls', () => {
  it('labels block quote, block indent, and remove block indent controls', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        toolbarFormatState={DEFAULT_TOOLBAR_FORMAT_STATE}
        activeHeadingLevel={0}
        toolbarShortcutFeedback={null}
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onToggleAisles={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html).toContain('title="Block quote"')
    expect(html).toContain('aria-label="Block quote"')
    expect(html).toContain('title="Block indent"')
    expect(html).toContain('aria-label="Block indent"')
    expect(html).toContain('title="Remove block indent"')
    expect(html).toContain('aria-label="Remove block indent"')
    expect(html).toContain('aria-label="Insert link"')
    expect(html).toContain('title="Undo"')
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('title="Redo"')
    expect(html).toContain('aria-label="Redo"')
    expect(html).toContain('editor-history-toolbar-btn-undo')
    expect(html).toContain('editor-history-toolbar-btn-redo')
    expect(html).not.toContain('note-link-toolbar-btn')
  })
})
