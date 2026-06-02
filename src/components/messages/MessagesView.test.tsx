import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MessagesView } from './MessagesView'
import type { AppMessage } from '../../types/app'

const message: AppMessage = {
  id: 'message-1',
  type: 'duplicate-auto-decoupled',
  status: 'unread',
  createdAt: '2026-06-01T00:00:00.000Z',
  signature: 'signature-1',
  title: 'duplicate files de-coupled',
  body: '2 changed duplicate files were de-coupled.',
  anchorPath: 'notes/anchor.md',
  decoupledPaths: ['notes/other.md'],
  affectedLocations: [
    {
      label: 'de-coupled',
      path: 'notes/other.md',
      location: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    },
  ],
}

describe('MessagesView', () => {
  it('renders empty messages state', () => {
    const html = renderToStaticMarkup(
      <MessagesView messages={[]} onDismissMessage={vi.fn()} onOpenLocation={vi.fn()} />,
    )

    expect(html).toContain('utility-page-wrap messages-view')
    expect(html).toContain('utility-page-card messages-view-card')
    expect(html).toContain('no messages.')
    expect(html).not.toContain('<h2>messages</h2>')
  })

  it('renders duplicate decouple details and location actions', () => {
    const html = renderToStaticMarkup(
      <MessagesView messages={[message]} onDismissMessage={vi.fn()} onOpenLocation={vi.fn()} />,
    )

    expect(html).toContain('duplicate files de-coupled')
    expect(html).toContain('notes/anchor.md')
    expect(html).toContain('notes/other.md')
    expect(html).toContain('open de-coupled')
  })
})
