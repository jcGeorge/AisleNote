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

  it('renders copy-only donation information', () => {
    const html = renderToStaticMarkup(<AboutViewContent section="donation" runtimeInfo={null} />)

    expect(html).toContain('donation')
    expect(html).toContain('free to use')
    expect(html).toContain('open source')
    expect(html).toContain('support options can be added here later')
    expect(html).not.toContain('href=')
  })

  it('renders fallback runtime labels when runtime info is unavailable', () => {
    const html = renderToStaticMarkup(<AboutViewContent runtimeInfo={null} runtimeUnavailable />)

    expect(html).toContain('unavailable')
    expect(html).toContain('browser')
  })
})
