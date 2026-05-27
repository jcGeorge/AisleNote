import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TOOLBAR_FORMAT_STATE } from './toolbar-state'
import { SharedEditorToolbar } from './SharedEditorToolbar'
import type { ToolbarLayout } from '../../types/app'

const CUSTOM_LAYOUT: ToolbarLayout = {
  id: 'custom',
  name: 'custom',
  items: [
    { id: 'bold', type: 'tool', toolId: 'bold' },
    { id: 'spacer', type: 'spacer' },
    { id: 'copy', type: 'tool', toolId: 'copy' },
    { id: 'heading', type: 'tool', toolId: 'heading' },
  ],
}

describe('SharedEditorToolbar block quote and block indent controls', () => {
  it('labels block quote, block indent, and remove block indent controls', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        copyButtonRef={createRef<HTMLButtonElement>()}
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        toolbarFormatState={DEFAULT_TOOLBAR_FORMAT_STATE}
        activeHeadingLevel={0}
        toolbarShortcutFeedback={null}
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onOpenTableOfContents={noop}
        onOpenAisleEditModal={noop}
        onOpenDirector={noop}
        onOpenFindReplace={noop}
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
    expect(html).toContain('note-copy-toolbar-document')
    expect(html).toContain('note-copy-toolbar-chain')
    expect(html).not.toContain('note-copy-toolbar-page-back')
    expect(html).toContain('aria-label="Frontmatter"')
    expect(html).toContain('frontmatter-toolbar-icon')
    expect(html).toContain('>fm</span>')
    expect(html).toContain('title="Table of contents"')
    expect(html).toContain('aria-label="Table of contents"')
    expect(html).toContain('table-of-contents-toolbar-icon')
    expect(html).not.toContain('>ToC</button>')
    expect(html).toContain('aisles-toolbar-icon')
    expect(html).toContain('viewBox="0 0 36 32"')
    expect(html).toContain('title="Director"')
    expect(html).toContain('aria-label="Director"')
    expect(html).toContain('director-toolbar-icon')
    expect(html).toContain('title="Find &amp; replace"')
    expect(html).toContain('aria-label="Find &amp; replace"')
    expect(html).toContain('find-replace-toolbar-icon')
    expect(html).toContain('title="Highlight"')
    expect(html).toContain('aria-label="Highlight"')
    expect(html).toContain('highlight')
    expect(html).toContain('title="Undo"')
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('title="Redo"')
    expect(html).toContain('aria-label="Redo"')
    expect(html).toContain('editor-history-toolbar-btn-undo')
    expect(html).toContain('editor-history-toolbar-btn-redo')
    expect(html.match(/editor-history-toolbar-icon/g)).toHaveLength(2)
    expect(html).toContain('editor-history-toolbar-head')
    expect(html).not.toContain('note-link-toolbar-btn')
  })

  it('keeps labels but omits title tooltips when disabled', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        copyButtonRef={createRef<HTMLButtonElement>()}
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
        onOpenAisleEditModal={noop}
        onOpenDirector={noop}
        onOpenFindReplace={noop}
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
    expect(html).toContain('aria-label="Highlight"')
  })

  it('renders a custom toolbar order and hides tools that are absent from the layout', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        layout={CUSTOM_LAYOUT}
        copyButtonRef={createRef<HTMLButtonElement>()}
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        toolbarFormatState={{ ...DEFAULT_TOOLBAR_FORMAT_STATE, bold: true }}
        activeHeadingLevel={2}
        toolbarShortcutFeedback="bold"
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onOpenTableOfContents={noop}
        onOpenAisleEditModal={noop}
        onOpenDirector={noop}
        onOpenFindReplace={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html.indexOf('aria-label="Bold"')).toBeLessThan(html.indexOf('aria-label="Make copy"'))
    expect(html.indexOf('aria-label="Make copy"')).toBeLessThan(html.indexOf('aria-label="Headings"'))
    expect(html).toContain('aria-label="Bold"')
    expect(html).toContain('toastui-editor-toolbar-icons bold active')
    expect(html).toContain('note-toolbar-shortcut-feedback')
    expect(html).toContain('aria-label="Headings"')
    expect(html).toContain('heading active')
    expect(html).not.toContain('aria-label="Undo"')
    expect(html).not.toContain('aria-label="Table of contents"')
    expect(html.match(/toastui-editor-toolbar-group/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('renders each layout spacer as its own live toolbar gap', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        layout={{
          id: 'spaced',
          name: 'spaced',
          items: [
            { id: 'leading-gap', type: 'spacer' },
            { id: 'bold', type: 'tool', toolId: 'bold' },
            { id: 'gap-one', type: 'spacer' },
            { id: 'gap-two', type: 'spacer' },
            { id: 'italic', type: 'tool', toolId: 'italic' },
            { id: 'trailing-gap', type: 'spacer' },
          ],
        }}
        copyButtonRef={createRef<HTMLButtonElement>()}
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        toolbarFormatState={DEFAULT_TOOLBAR_FORMAT_STATE}
        activeHeadingLevel={0}
        toolbarShortcutFeedback={null}
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onOpenTableOfContents={noop}
        onOpenAisleEditModal={noop}
        onOpenDirector={noop}
        onOpenFindReplace={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html.match(/note-toolbar-layout-spacer/g)?.length).toBe(4)
    expect(html.indexOf('note-toolbar-layout-spacer')).toBeLessThan(html.indexOf('aria-label="Bold"'))
    expect(html.indexOf('aria-label="Bold"')).toBeLessThan(html.indexOf('aria-label="Italic"'))
  })

  it('does not render the live toolbar shell for an empty active layout', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <SharedEditorToolbar
        layout={{ id: 'empty', name: 'empty', items: [] }}
        copyButtonRef={createRef<HTMLButtonElement>()}
        headingButtonRef={createRef<HTMLButtonElement>()}
        aisleButtonRef={createRef<HTMLButtonElement>()}
        toolbarFormatState={DEFAULT_TOOLBAR_FORMAT_STATE}
        activeHeadingLevel={0}
        toolbarShortcutFeedback={null}
        onOpenCopy={noop}
        onOpenFrontmatter={noop}
        onOpenTableOfContents={noop}
        onOpenAisleEditModal={noop}
        onOpenDirector={noop}
        onOpenFindReplace={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html).toBe('')
  })
})
