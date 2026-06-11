import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NavigationRailControls } from './NavigationRailControls'

const noop = () => undefined
type TestElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

function findButtonByClass(node: ReactNode, className: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButtonByClass(child, className)
      if (match) return match
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as TestElement
  if (typeof element.props.className === 'string' && element.props.className.includes(className)) return element
  return findButtonByClass(element.props.children, className)
}

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
      onToggleTrash={noop}
      onOpenSettings={noop}
      onOpenFilter={noop}
    />,
  )
}

function renderTrashMenu() {
  return renderToStaticMarkup(
    <NavigationRailControls
      actions={[]}
      menuOpen
      showCloseControl={false}
      viewMode="trash"
      spaceRailVisible={false}
      domainRailVisible={false}
      onCloseAction={noop}
      onSetMenuOpen={vi.fn()}
      onToggleSpaceRail={noop}
      onToggleDomainRail={noop}
      onToggleTrash={noop}
      onOpenSettings={noop}
      onOpenFilter={noop}
    />,
  )
}

describe('NavigationRailControls', () => {
  it('renders exactly two visibility rows before utility rows without static domain or space rows', () => {
    const html = renderMenu()
    const visibilityLabels = html.match(/(?:show|hide) (?:space|domain)/g) ?? []

    expect(visibilityLabels).toEqual(['show space', 'show domain'])
    expect(html).not.toContain('>domains<')
    expect(html).not.toContain('>spaces<')
    expect(html).not.toMatch(/\brails?\b/)
    expect(html.indexOf('>show space<')).toBeLessThan(html.indexOf('>show domain<'))
    expect(html.indexOf('>show domain<')).toBeLessThan(html.indexOf('>trash<'))
  })

  it('renders utility menu rows in trash filter settings order without messages or about', () => {
    const html = renderMenu()

    expect(html.indexOf('>trash<')).toBeLessThan(html.indexOf('>filter<'))
    expect(html.indexOf('>filter<')).toBeLessThan(html.indexOf('>settings<'))
    expect(html).not.toContain('>messages<')
    expect(html).not.toContain('>about<')
    expect(html).not.toContain('messages (')
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

  it('renders trash mode menu control as an x button without the utility dropdown', () => {
    const html = renderTrashMenu()

    expect(html).toContain('class="menu-btn is-close"')
    expect(html).toContain('aria-label="tabs"')
    expect(html).toContain('data-app-tooltip="tabs"')
    expect(html).not.toContain('menu-dropdown')
    expect(html).not.toContain('>show space<')
    expect(html).not.toContain('>tabs<')
  })

  it('uses the trash x button to return to the main notes view', () => {
    const onToggleTrash = vi.fn()
    const onSetMenuOpen = vi.fn()
    const element = NavigationRailControls({
      actions: [],
      menuOpen: true,
      showCloseControl: false,
      viewMode: 'trash',
      spaceRailVisible: false,
      domainRailVisible: false,
      onCloseAction: noop,
      onSetMenuOpen,
      onToggleSpaceRail: noop,
      onToggleDomainRail: noop,
      onToggleTrash,
      onOpenSettings: noop,
      onOpenFilter: noop,
    })
    const button = findButtonByClass(element, 'menu-btn')

    expect(button).not.toBeNull()
    ;(button?.props.onClick as () => void)()

    expect(onToggleTrash).toHaveBeenCalledTimes(1)
    expect(onSetMenuOpen).not.toHaveBeenCalled()
  })
})
