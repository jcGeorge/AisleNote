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
    expect(html).toContain('1.2.3')
    expect(html).toContain('darwin')
  })

  it('renders fallback runtime labels when runtime info is unavailable', () => {
    const html = renderToStaticMarkup(<AboutViewContent runtimeInfo={null} runtimeUnavailable />)

    expect(html).toContain('unavailable')
    expect(html).toContain('browser')
  })
})
