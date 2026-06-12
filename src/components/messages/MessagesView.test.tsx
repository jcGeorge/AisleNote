import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MessagesView } from './MessagesView'
import type { DiagnosticLogEntry } from '../../diagnostics/diagnostic-log'
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

const diagnosticEntries: DiagnosticLogEntry[] = [
  {
    id: 'diagnostic-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    dayKey: '2026-06-01',
    sessionId: 'session-1',
    level: 'info',
    area: 'runtime',
    event: 'session-start',
    details: { viewMode: 'main' },
  },
  {
    id: 'diagnostic-2',
    createdAt: '2026-06-01T00:01:00.000Z',
    dayKey: '2026-06-01',
    sessionId: 'session-1',
    level: 'warning',
    area: 'performance',
    event: 'slow-operation',
    durationMs: 75.4,
    message: 'editor pending content flush',
    details: { thresholdMs: 50 },
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
    expect(html).toContain('No inbox messages.')
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

    expect(html).toContain('No toast history.')
    expect(html).not.toContain('duplicate files de-coupled')
  })

  it('renders editor dev controls as a messages child section', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="editor-dev"
        messages={[message]}
        toastHistory={toastHistory}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('editor diagnostics')
    expect(html).toContain('id="messages-editor-ablation-mode"')
    expect(html).not.toContain('<option value="mdxeditor">')
    expect(html).toContain('<option value="toast-only">Toast only</option>')
    expect(html).toContain('<option value="toast-retain-current-previous">Full editor retain previous aisle</option>')
    expect(html).toContain('Toast UI remains the default until a replacement proves out')
    expect(html).toContain('reload app')
    expect(html).not.toContain('No inbox messages.')
    expect(html).not.toContain('toast history')
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

  it('renders empty diagnostic state', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[message]}
        toastHistory={toastHistory}
        diagnosticDays={[]}
        diagnosticEntries={[]}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('aria-label="diagnostic controls"')
    expect(html).toContain('diagnostic-log-day-select')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-label="diagnostic mode"')
    expect(html).toContain('aria-label="diagnostic message type"')
    expect(html).toContain('aria-label="diagnostic message count"')
    expect(html).toContain('aria-label="capture diagnostics"')
    expect(html).toContain('diagnostic-log-capture-field')
    expect(html).toContain('form-check form-switch settings-switch diagnostic-log-capture-switch')
    expect(html).toContain('No diagnostic logs.')
    expect(html).not.toContain('toast history')
    expect(html).not.toContain('duplicate files de-coupled')
    expect(html).not.toContain('open diagnostics folder')
  })

  it('renders diagnostic logs newest first with day selector', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-02', '2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={diagnosticEntries}
        diagnosticMode="all"
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('diagnostic-log-day-select')
    expect(html).toContain('aria-label="diagnostic controls"')
    expect(html).toContain('aria-label="diagnostic mode"')
    expect(html).toContain('<option value="all" selected="">all logs</option>')
    expect(html).toContain('aria-label="diagnostic message type"')
    expect(html).toContain('aria-label="diagnostic message count"')
    expect(html).toContain('performance: slow-operation')
    expect(html).toContain('warning - 75.4ms')
    expect(html.indexOf('performance: slow-operation')).toBeLessThan(html.indexOf('runtime: session-start'))
    expect(html).toContain('{&quot;thresholdMs&quot;:50}')
    expect(html).toContain('showing 2 of 2 diagnostics')
  })

  it('renders diagnostic capture and desktop folder controls', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={diagnosticEntries}
        diagnosticCaptureEnabled={false}
        onOpenDiagnosticsFolder={vi.fn()}
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('aria-label="capture diagnostics"')
    expect(html).not.toContain('checked=""')
    expect(html).toContain('open diagnostics folder')
    expect(html).toContain('performance: slow-operation')
  })

  it('filters diagnostic logs by type', () => {
    const html = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={diagnosticEntries}
        diagnosticLevelFilter="warning"
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('performance: slow-operation')
    expect(html).not.toContain('runtime: session-start')
    expect(html).toContain('showing 1 of 1 warning diagnostics in actionable mode')
  })

  it('defaults diagnostic logs to actionable mode with nearby breadcrumbs and healthy storage hidden', () => {
    const entries: DiagnosticLogEntry[] = [
      {
        id: 'storage-healthy',
        createdAt: '2026-06-01T00:01:02.000Z',
        dayKey: '2026-06-01',
        sessionId: 'session-1',
        level: 'info',
        area: 'storage',
        event: 'profile-status',
        details: { status: 'ready', health: 'healthy' },
      },
      {
        id: 'nearby-info',
        createdAt: '2026-06-01T00:01:01.000Z',
        dayKey: '2026-06-01',
        sessionId: 'session-1',
        level: 'info',
        area: 'aisle-editor',
        event: 'activation-summary',
      },
      {
        id: 'warning',
        createdAt: '2026-06-01T00:01:00.000Z',
        dayKey: '2026-06-01',
        sessionId: 'session-1',
        level: 'warning',
        area: 'performance',
        event: 'slow-operation',
      },
      {
        id: 'far-info',
        createdAt: '2026-06-01T00:00:00.000Z',
        dayKey: '2026-06-01',
        sessionId: 'session-1',
        level: 'info',
        area: 'runtime',
        event: 'session-start',
      },
    ]

    const html = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={entries}
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(html).toContain('performance: slow-operation')
    expect(html).toContain('aisle-editor: activation-summary')
    expect(html).not.toContain('storage: profile-status')
    expect(html).not.toContain('runtime: session-start')
    expect(html).toContain('showing 2 of 2 diagnostics in actionable mode')
  })

  it('caps diagnostic logs to 500 by default and supports the all display limit', () => {
    const manyEntries: DiagnosticLogEntry[] = Array.from({ length: 501 }, (_, index) => ({
      id: `diagnostic-many-${index}`,
      createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, index)).toISOString(),
      dayKey: '2026-06-01',
      sessionId: 'session-1',
      level: 'info',
      area: 'runtime',
      event: index === 0 ? 'oldest-hidden' : `event-${index}`,
    }))

    const cappedHtml = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={manyEntries}
        diagnosticMode="all"
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )
    const allHtml = renderToStaticMarkup(
      <MessagesView
        section="diagnostics"
        messages={[]}
        toastHistory={[]}
        diagnosticDays={['2026-06-01']}
        selectedDiagnosticDay="2026-06-01"
        diagnosticEntries={manyEntries}
        diagnosticDisplayLimit="all"
        diagnosticMode="all"
        onDiagnosticDayChange={vi.fn()}
        onDismissMessage={vi.fn()}
        onOpenRecoveredNotebookLocation={vi.fn()}
        onOpenLocation={vi.fn()}
      />,
    )

    expect(cappedHtml).toContain('showing 500 of 501 diagnostics')
    expect(cappedHtml).not.toContain('runtime: oldest-hidden')
    expect(allHtml).toContain('showing 501 of 501 diagnostics')
    expect(allHtml).toContain('runtime: oldest-hidden')
  })
})
