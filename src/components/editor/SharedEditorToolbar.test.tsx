import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TOOLBAR_TOOL_IDS } from '../../editor/toolbar-layouts'
import { DEFAULT_TOOLBAR_FORMAT_STATE } from './toolbar-state'
import { SharedEditorToolbar } from './SharedEditorToolbar'
import { TOOLBAR_ICON_COLOR_CLASSES, TOOLBAR_ICON_DEFINITIONS } from './ToolbarToolIcon'
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

function getToolbarIconClass(toolId: string): string {
  return `toolbar-tool-icon-${toolId.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
}

describe('SharedEditorToolbar block quote and block indent controls', () => {
  it('has one icon registry definition for every toolbar tool', () => {
    expect(Object.keys(TOOLBAR_ICON_DEFINITIONS).sort()).toEqual([...TOOLBAR_TOOL_IDS].sort())
    expect(Object.values(TOOLBAR_ICON_COLOR_CLASSES).sort()).toEqual([
      'toolbar-tool-icon-primary-fill',
      'toolbar-tool-icon-primary-stroke',
      'toolbar-tool-icon-secondary-fill',
      'toolbar-tool-icon-secondary-stroke',
    ])
  })

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
        onOpenFindReplace={noop}
        onToggleHeading={noop}
        onCommand={noop}
        onHistory={noop}
        onInsertImage={noop}
        onInsertWebLink={noop}
        onClear={noop}
      />,
    )

    expect(html).toContain('data-app-tooltip="Block quote"')
    expect(html).toContain('aria-label="Block quote"')
    expect(html).toContain('data-app-tooltip="Block indent"')
    expect(html).toContain('aria-label="Block indent"')
    expect(html).toContain('data-app-tooltip="Remove block indent"')
    expect(html).toContain('aria-label="Remove block indent"')
    expect(html).toContain('aria-label="Insert link"')
    expect(html).toContain('toolbar-tool-icon-copy')
    expect(html).toContain('aria-label="Frontmatter"')
    expect(html).toContain('toolbar-tool-icon-frontmatter')
    expect(html).toContain('>fm</span>')
    expect(html).toContain('data-app-tooltip="Table of contents"')
    expect(html).toContain('aria-label="Table of contents"')
    expect(html).toContain('toolbar-tool-icon-table-of-contents')
    expect(html).not.toContain('>ToC</button>')
    expect(html).toContain('toolbar-tool-icon-aisles')
    expect(html).not.toContain('viewBox="0 0 36 32"')
    expect(html).toContain('data-app-tooltip="Find &amp; replace"')
    expect(html).toContain('aria-label="Find &amp; replace"')
    expect(html).toContain('toolbar-tool-icon-find-replace')
    expect(html).toContain('data-app-tooltip="Highlight"')
    expect(html).toContain('aria-label="Highlight"')
    TOOLBAR_TOOL_IDS.forEach((toolId) => {
      expect(html).toContain(getToolbarIconClass(toolId))
    })
    expect(html).toContain('toolbar-tool-icon-primary-stroke')
    expect(html).not.toContain('toolbar-tool-icon-secondary-stroke')
    expect(html).not.toContain('toolbar-tool-icon-secondary-fill')
    expect(html).not.toContain('toolbar-tool-sprite-icon')
    expect(html).not.toContain('toastui-editor-toolbar-icons')
    expect(html).not.toMatch(/\s(?:fill|stroke)="#/i)
    expect(html).not.toMatch(/<(?:style|title)\b/i)
    expect(html).toContain('data-app-tooltip="Undo"')
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('data-app-tooltip="Redo"')
    expect(html).toContain('aria-label="Redo"')
    expect(html).toContain('editor-history-toolbar-btn-undo')
    expect(html).toContain('editor-history-toolbar-btn-redo')
    expect(html).not.toContain('note-link-toolbar-btn')
  })

  it('keeps labels but omits app tooltips when disabled', () => {
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
    expect(html).not.toContain('data-app-tooltip=')
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
    expect(html).toContain('app-toolbar-tool-btn app-toolbar-tool-btn-bold active')
    expect(html).toContain('toolbar-tool-icon-bold')
    expect(html).toContain('note-toolbar-shortcut-feedback')
    expect(html).toContain('aria-label="Headings"')
    expect(html).toContain('app-toolbar-tool-btn-heading active')
    expect(html).toContain('toolbar-tool-icon-heading')
    expect(html).not.toContain('toastui-editor-toolbar-icons')
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
