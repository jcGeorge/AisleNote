import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AisleToolbarMenu, CopyToolbarMenu, EditorToolbarPopovers } from './EditorToolbarPopovers'

function renderMenu() {
  return renderToStaticMarkup(
    <AisleToolbarMenu
      onCloseAislePopover={() => undefined}
      onAddAisle={() => undefined}
      onOpenAisleEditModal={() => undefined}
    />,
  )
}

describe('AisleToolbarMenu', () => {
  it('renames the structural workflow to edit aisles', () => {
    const html = renderMenu()

    expect(html).toContain('add aisle')
    expect(html).toContain('edit aisles')
    expect(html).not.toContain('delete aisle')
  })

  it('keeps add clickable so the max aisle warning can show', () => {
    const html = renderMenu()

    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>add aisle<\/button>/)
    expect(html).toContain('edit aisles')
  })

  it('does not render toolbar popovers while disabled', () => {
    const html = renderToStaticMarkup(
      <EditorToolbarPopovers
        disabled
        copyMenuOpen
        headingMenuOpen
        noteToolsOpen
        activeHeadingLevel={0}
        toolbarPopoverPosition={{
          copy: { top: 1, left: 1 },
          heading: { top: 1, left: 1 },
          aisles: { top: 1, left: 1 },
        }}
        activeNoteAisles={[]}
        onExecuteToolbarCommand={() => undefined}
        onOpenCopyModal={() => undefined}
        onOpenDeduplicateModal={() => undefined}
        onCloseAislePopover={() => undefined}
        onAddAisle={() => undefined}
        onOpenAisleEditModal={() => undefined}
      />,
    )

    expect(html).toBe('')
  })
})

describe('CopyToolbarMenu', () => {
  it('renders make copy and de-duplicate choices', () => {
    const html = renderToStaticMarkup(
      <CopyToolbarMenu
        onOpenCopyModal={() => undefined}
        onOpenDeduplicateModal={() => undefined}
      />,
    )

    expect(html).toContain('make copy')
    expect(html).toContain('de-duplicate')
  })
})
