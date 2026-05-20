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
        onOpenTableOfContents={noop}
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
    expect(html).toContain('title="Table of contents"')
    expect(html).toContain('aria-label="Table of contents"')
    expect(html).toContain('ToC')
    expect(html).toContain('title="Undo"')
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('title="Redo"')
    expect(html).toContain('aria-label="Redo"')
    expect(html).toContain('editor-history-toolbar-btn-undo')
    expect(html).toContain('editor-history-toolbar-btn-redo')
    expect(html).not.toContain('note-link-toolbar-btn')
  })

  it('keeps labels but omits title tooltips when disabled', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        tooltipsDisabled
        interactionDisabled
        toolbarFormatState={DEFAULT_TOOLBAR_FORMAT_STATE}
        activeHeadingLevel={0}
        toolbarShortcutFeedback={null}
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onOpenTableOfContents={noop}
        onToggleAisles={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html).not.toContain('title=')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('is-interaction-disabled')
    expect(html).toContain('aria-label="Block quote"')
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('aria-label="Insert link"')
    expect(html).toContain('aria-label="Table of contents"')
  })
})
