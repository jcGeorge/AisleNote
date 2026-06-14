import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AboutViewContent } from './AboutView'

describe('AboutView', () => {
  it('renders app identity and runtime info', () => {
    const html = renderToStaticMarkup(
      <AboutViewContent runtimeInfo={{ version: '1.2.3', platform: 'darwin' }} />,
    )

    expect(html).toContain('Tabs')
    expect(html).toContain('local-first notebook')
    expect(html).toContain('Lucide.dev')
    expect(html).toContain('1.2.3')
    expect(html).toContain('darwin')
  })

  it('renders copy-only tooltip source information', () => {
    const html = renderToStaticMarkup(<AboutViewContent section="tooltip-sources" runtimeInfo={null} />)

    expect(html).toContain('tooltip sources')
    expect(html).toContain('Lucide icons')
    expect(html).toContain('open-source icon set')
    expect(html).toContain('clear, consistent visual labels')
    expect(html).not.toContain('href=')
  })

  it('renders fallback runtime labels when runtime info is unavailable', () => {
    const html = renderToStaticMarkup(<AboutViewContent runtimeInfo={null} runtimeUnavailable />)

    expect(html).toContain('unavailable')
    expect(html).toContain('browser')
  })
})
