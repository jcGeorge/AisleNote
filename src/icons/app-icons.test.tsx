import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppIcon } from '../components/icons/AppIcon'
import {
  APP_ICON_DEFINITIONS,
  APP_ICON_FLIP_HORIZONTAL_TRANSFORM,
  APP_ICON_STROKE_WIDTH,
  APP_ICON_VIEW_BOX,
  GENERAL_ICON_IDS,
  createAppIconElement,
} from './app-icons'

class FakeSvgElement {
  readonly tagName: string
  readonly attributes = new Map<string, string>()
  readonly children: FakeSvgElement[] = []

  constructor(tagName: string) {
    this.tagName = tagName
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  append(child: FakeSvgElement) {
    this.children.push(child)
  }

  get outerHTML(): string {
    const attrs = Array.from(this.attributes.entries())
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('')
    return `<${this.tagName}${attrs}>${this.children.map((child) => child.outerHTML).join('')}</${this.tagName}>`
  }
}

function installFakeDocument() {
  vi.stubGlobal('document', {
    createElementNS: (_namespace: string, tagName: string) => new FakeSvgElement(tagName),
  })
}

describe('app icons', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has one definition for every general app icon id', () => {
    expect(Object.keys(APP_ICON_DEFINITIONS).sort()).toEqual([...GENERAL_ICON_IDS].sort())
  })

  it('renders normalized React SVG icons without metadata or hard-coded colors', () => {
    const html = renderToStaticMarkup(<AppIcon iconId="play" />)

    expect(html).toContain(`viewBox="${APP_ICON_VIEW_BOX}"`)
    expect(html).toContain('fill="none"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain(`stroke-width="${APP_ICON_STROKE_WIDTH}"`)
    expect(html).toContain('data-app-icon="play"')
    expect(html).not.toMatch(/^<svg[^>]*\swidth=/)
    expect(html).not.toMatch(/^<svg[^>]*\sheight=/)
    expect(html).not.toMatch(/\s(?:fill|stroke)="#/i)
    expect(html).not.toMatch(/<(?:style|title)\b/i)
    expect(html).not.toContain('lucide')
  })

  it('renders horizontal flips through a shared transform', () => {
    const html = renderToStaticMarkup(<AppIcon iconId="aisleRight" flipHorizontal />)

    expect(html).toContain(`transform="${APP_ICON_FLIP_HORIZONTAL_TRANSFORM}"`)
  })

  it('creates normalized DOM SVG icons from the same registry', () => {
    installFakeDocument()

    const html = createAppIconElement('pause', { className: 'example-icon', flipHorizontal: true }).outerHTML

    expect(html).toContain('class="app-icon app-icon-pause example-icon"')
    expect(html).toContain(`viewBox="${APP_ICON_VIEW_BOX}"`)
    expect(html).toContain('fill="none"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain(`stroke-width="${APP_ICON_STROKE_WIDTH}"`)
    expect(html).toContain('data-app-icon="pause"')
    expect(html).toContain(`transform="${APP_ICON_FLIP_HORIZONTAL_TRANSFORM}"`)
    expect(html).not.toMatch(/\s(?:fill|stroke)="#/i)
    expect(html).not.toMatch(/<(?:style|title)\b/i)
  })
})
