import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AisleToolbarMenu } from './EditorToolbarPopovers'

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
})
