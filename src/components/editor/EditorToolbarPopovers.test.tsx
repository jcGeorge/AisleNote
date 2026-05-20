import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AisleToolbarMenu, EditorToolbarPopovers } from './EditorToolbarPopovers'

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
        headingMenuOpen
        noteToolsOpen
        activeHeadingLevel={0}
        toolbarPopoverPosition={{ heading: { top: 1, left: 1 }, aisles: { top: 1, left: 1 } }}
        activeNoteAisles={[]}
        onExecuteToolbarCommand={() => undefined}
        onCloseAislePopover={() => undefined}
        onAddAisle={() => undefined}
        onOpenAisleEditModal={() => undefined}
      />,
    )

    expect(html).toBe('')
  })
})
