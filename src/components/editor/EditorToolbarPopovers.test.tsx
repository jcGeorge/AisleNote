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
        onOpenDeduplicateModal={() => undefined}
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
        onOpenDeduplicateModal={() => undefined}
      />,
    )

    expect(html).not.toContain('note-toolbar-aisle-popover')
    expect(html).not.toContain('edit aisles')
    expect(html).not.toContain('add aisle')
  })
})

describe('CopyToolbarMenu', () => {
  it('renders make copy and de-couple choices', () => {
    const html = renderToStaticMarkup(
      <CopyToolbarMenu
        onOpenCopyModal={() => undefined}
        onOpenDeduplicateModal={() => undefined}
      />,
    )

    expect(html).toContain('make copy')
    expect(html).toContain('de-couple')
  })
})
