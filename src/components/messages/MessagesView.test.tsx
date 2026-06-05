import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MessagesView } from './MessagesView'
import type { AppMessage, ToastHistoryEntry } from '../../types/app'

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

const toastHistory: ToastHistoryEntry[] = [
  {
    id: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    message: 'first warning',
    tone: 'warning',
  },
  {
    id: 2,
    createdAt: '2026-06-01T00:01:00.000Z',
    message: 'second success',
    tone: 'success',
  },
]

describe('MessagesView', () => {
  it('renders empty inbox state', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="inbox"
        messages={[]}
        toastHistory={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('utility-page-wrap messages-view')
    expect(html).toContain('utility-page-card messages-view-card')
    expect(html).toContain('no inbox messages.')
    expect(html).not.toContain('<h2>messages</h2>')
  })

  it('renders empty toast history state', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="toast-history"
        messages={[message]}
        toastHistory={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('no toast history.')
    expect(html).not.toContain('duplicate files de-coupled')
  })

  it('renders duplicate decouple details and location actions', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="inbox"
        messages={[message]}
        toastHistory={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('duplicate files de-coupled')
    expect(html).toContain('notes/anchor.md')
    expect(html).toContain('notes/other.md')
    expect(html).toContain('open de-coupled')
  })

  it('renders storage recovery details', () => {
    const recoveryMessage: AppMessage = {
      id: 'message-2',
      type: 'storage-notebook-recovered',
      status: 'acknowledged',
      createdAt: '2026-06-01T00:02:00.000Z',
      signature: 'storage-recovered-1',
      title: 'Started local notebook',
      body: 'Tabs could not load the connected notebook.',
      failedNotebookPath: '/Users/me/Broken Notebook',
      recoveryMode: 'created-local',
      issueSummary: ['manifest.json: Root manifest is corrupt.'],
    }
    const html = renderToStaticMarkup(
      <MessagesView
        section="inbox"
        messages={[recoveryMessage]}
        toastHistory={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('Started local notebook')
    expect(html).toContain('failed notebook folder')
    expect(html).toContain('/Users/me/Broken Notebook')
    expect(html).toContain('issue summary')
    expect(html).toContain('manifest.json: Root manifest is corrupt.')
    expect(html).toContain('open previous notebook folder')
  })

  it('hides recovery folder actions when the failed folder is unavailable', () => {
    const recoveryMessage: AppMessage = {
      id: 'message-2',
      type: 'storage-notebook-recovered',
      status: 'acknowledged',
      createdAt: '2026-06-01T00:02:00.000Z',
      signature: 'storage-recovered-1',
      title: 'Started local notebook',
      body: 'Tabs could not load the connected notebook.',
      failedNotebookPath: '/Users/me/Missing Notebook',
      failedNotebookAvailable: false,
      recoveryMode: 'created-local',
      issueSummary: ['Unable to locate folder.'],
    }
    const html = renderToStaticMarkup(
      <MessagesView
        section="inbox"
        messages={[recoveryMessage]}
        toastHistory={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('failed notebook folder')
    expect(html).toContain('/Users/me/Missing Notebook')
    expect(html).toContain('Unable to locate folder.')
    expect(html).not.toContain('open previous notebook folder')
    expect(html).not.toContain('open local notebook folder')
  })

  it('renders toast history newest first with tone and timestamp', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="toast-history"
        messages={[message]}
        toastHistory={toastHistory}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html.indexOf('second success')).toBeLessThan(html.indexOf('first warning'))
    expect(html).toContain('toast-history-card-success')
    expect(html).toContain('toast-history-card-warning')
    expect(html).toContain('2026-06-01T00:01:00.000Z')
    expect(html).not.toContain('open de-coupled')
  })
})
