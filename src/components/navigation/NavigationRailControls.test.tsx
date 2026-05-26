import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NavigationRailControls } from './NavigationRailControls'

const noop = () => undefined

function renderMenu(spaceRailVisible = false, domainRailVisible = false) {
  return renderToStaticMarkup(
    <NavigationRailControls
      actions={[]}
      menuOpen
      showCloseControl={false}
      viewMode="main"
      spaceRailVisible={spaceRailVisible}
      domainRailVisible={domainRailVisible}
      onCloseAction={noop}
      onSetMenuOpen={vi.fn()}
      onToggleSpaceRail={noop}
      onToggleDomainRail={noop}
      onOpenStageManager={noop}
      onToggleTrash={noop}
      onOpenSettings={noop}
    />,
  )
}

describe('NavigationRailControls', () => {
  it('renders exactly two visibility rows before director without static domain or space rows', () => {
    const html = renderMenu()
    const visibilityLabels = html.match(/(?:show|hide) (?:space|domain)/g) ?? []

    expect(visibilityLabels).toEqual(['show space', 'show domain'])
    expect(html).not.toContain('>domains<')
    expect(html).not.toContain('>spaces<')
    expect(html).not.toMatch(/\brails?\b/)
    expect(html.indexOf('>show space<')).toBeLessThan(html.indexOf('>show domain<'))
    expect(html.indexOf('>show domain<')).toBeLessThan(html.indexOf('>director<'))
  })

  it('uses show labels when both rails are hidden', () => {
    const html = renderMenu(false, false)

    expect(html).toContain('>show space<')
    expect(html).toContain('>show domain<')
  })

  it('uses mixed labels when only the space rail is visible', () => {
    const html = renderMenu(true, false)

    expect(html).toContain('>hide space<')
    expect(html).toContain('>show domain<')
  })

  it('uses hide labels when both rails are visible', () => {
    const html = renderMenu(true, true)

    expect(html).toContain('>hide space<')
    expect(html).toContain('>hide domain<')
  })
})
