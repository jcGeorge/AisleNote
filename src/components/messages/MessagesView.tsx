import type {
  DiagnosticLogDisplayLimit,
  DiagnosticLogEntry,
  DiagnosticLogLevelFilter,
} from '../../diagnostics/diagnostic-log'
import { orderDiagnosticEntriesForDisplay } from '../../diagnostics/diagnostic-log'
import type { AppMessage, MessagesSection, NoteLocation, ToastHistoryEntry } from '../../types/app'
import { orderToastHistoryForDisplay } from '../overlays/toast-stack'

type MessagesViewProps = {
  section: MessagesSection
  messages: AppMessage[]
  toastHistory: ToastHistoryEntry[]
  diagnosticDays?: string[]
  selectedDiagnosticDay?: string
  diagnosticEntries?: DiagnosticLogEntry[]
  diagnosticLevelFilter?: DiagnosticLogLevelFilter
  diagnosticDisplayLimit?: DiagnosticLogDisplayLimit
  onDiagnosticDayChange?: (dayKey: string) => void
  onDismissMessage: (messageId: string) => void
  onOpenRecoveredNotebookLocation: (message: AppMessage) => void
  onOpenLocation: (location: NoteLocation) => void
}

function formatMessageTimestamp(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString()
}

function formatDiagnosticTitle(entry: DiagnosticLogEntry) {
  return `${entry.area}: ${entry.event}`
}

function formatDiagnosticMeta(entry: DiagnosticLogEntry) {
  return entry.durationMs === undefined
    ? entry.level
    : `${entry.level} - ${entry.durationMs.toFixed(1)}ms`
}

function stringifyDiagnosticDetails(entry: DiagnosticLogEntry) {
  return entry.details && Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : ''
}

function getDiagnosticDisplayLimitCount(limit: DiagnosticLogDisplayLimit): number | null {
  return limit === 'all' ? null : limit
}

function getRecoveryFolderActionLabel(message: AppMessage) {
  const localNotebookWasTheFailedFolder =
    message.recoveryMode === 'reset-default' &&
    (message.activeNotebookPath === undefined ||
      (message.failedNotebookPath !== undefined && message.failedNotebookPath === message.activeNotebookPath))
  return localNotebookWasTheFailedFolder ? 'open local notebook folder' : 'open previous notebook folder'
}

export function MessagesView({
  section,
  messages,
  toastHistory,
  diagnosticDays = [],
  selectedDiagnosticDay = diagnosticDays[0] ?? '',
  diagnosticEntries = [],
  diagnosticLevelFilter = 'all',
  diagnosticDisplayLimit = 500,
  onDiagnosticDayChange = () => undefined,
  onDismissMessage,
  onOpenRecoveredNotebookLocation,
  onOpenLocation,
}: MessagesViewProps) {
  const visibleMessages = messages.filter((message) => message.status !== 'dismissed')
  const orderedDiagnosticEntries = orderDiagnosticEntriesForDisplay(diagnosticEntries)
  const filteredDiagnosticEntries =
    diagnosticLevelFilter === 'all'
      ? orderedDiagnosticEntries
      : orderedDiagnosticEntries.filter((entry) => entry.level === diagnosticLevelFilter)
  const diagnosticLimitCount = getDiagnosticDisplayLimitCount(diagnosticDisplayLimit)
  const displayedDiagnosticEntries =
    diagnosticLimitCount === null
      ? filteredDiagnosticEntries
      : filteredDiagnosticEntries.slice(0, diagnosticLimitCount)

  return (
    <section className="utility-page-wrap messages-view" aria-label="Messages">
      <div
        className={`utility-page-card messages-view-card${section === 'diagnostics' ? ' messages-view-card-diagnostics' : ''}`}
      >
        {section === 'diagnostics' ? (
          diagnosticDays.length === 0 ? (
            <p className="messages-empty">No diagnostic logs.</p>
          ) : (
            <div className="diagnostic-log-view">
              <label className="diagnostic-log-day-field" htmlFor="diagnostic-log-day-select">
                <span className="settings-hotkey-label">day</span>
                <select
                  id="diagnostic-log-day-select"
                  className="settings-select-input diagnostic-log-day-select"
                  value={selectedDiagnosticDay}
                  onChange={(event) => onDiagnosticDayChange(event.target.value)}
                >
                  {diagnosticDays.map((dayKey) => (
                    <option key={dayKey} value={dayKey}>
                      {dayKey}
                    </option>
                  ))}
                </select>
              </label>
              {orderedDiagnosticEntries.length === 0 ? (
                <p className="messages-empty">No diagnostic logs for this day.</p>
              ) : filteredDiagnosticEntries.length === 0 ? (
                <p className="messages-empty">No diagnostic logs for this type.</p>
              ) : (
                <>
                  <p className="diagnostic-log-summary">
                    showing {displayedDiagnosticEntries.length.toLocaleString()} of{' '}
                    {filteredDiagnosticEntries.length.toLocaleString()}
                    {diagnosticLevelFilter === 'all' ? ' diagnostics' : ` ${diagnosticLevelFilter} diagnostics`}
                  </p>
                  <div className="messages-list diagnostic-log-list">
                    {displayedDiagnosticEntries.map((entry) => {
                      const details = stringifyDiagnosticDetails(entry)
                      return (
                        <article
                          key={entry.id}
                          className={`message-card diagnostic-log-card diagnostic-log-card-${entry.level}`}
                        >
                          <div className="message-card-header">
                            <div>
                              <h3>{formatDiagnosticTitle(entry)}</h3>
                              <p className="toast-history-meta diagnostic-log-meta">
                                <span>{formatDiagnosticMeta(entry)}</span>
                                <time dateTime={entry.createdAt}>{formatMessageTimestamp(entry.createdAt)}</time>
                                <span>{entry.sessionId}</span>
                              </p>
                              {entry.message ? <p>{entry.message}</p> : null}
                            </div>
                          </div>
                          {details ? (
                            <p className="message-path diagnostic-log-details">
                              <span>details</span>
                              <code>{details}</code>
                            </p>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        ) : section === 'toast-history' ? (
          toastHistory.length === 0 ? (
            <p className="messages-empty">No toast history.</p>
          ) : (
            <div className="messages-list toast-history-list">
              {orderToastHistoryForDisplay(toastHistory).map((toast) => (
                <article
                  key={toast.id}
                  className={`message-card toast-history-card toast-history-card-${toast.tone}`}
                >
                  <div className="message-card-header">
                    <div>
                      <h3>{toast.message}</h3>
                      <p className="toast-history-meta">
                        <span>{toast.tone}</span>
                        <time dateTime={toast.createdAt}>{formatMessageTimestamp(toast.createdAt)}</time>
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : visibleMessages.length === 0 ? (
          <p className="messages-empty">No inbox messages.</p>
        ) : (
          <div className="messages-list">
            {visibleMessages.map((message) => (
              <article key={message.id} className="message-card">
                <div className="message-card-header">
                  <div>
                    <h3>{message.title}</h3>
                    <p>{message.body}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm settings-action-btn"
                    onClick={() => onDismissMessage(message.id)}
                  >
                    dismiss
                  </button>
                </div>
                {message.anchorPath ? (
                  <p className="message-path">
                    <span>stayed linked</span>
                    <code>{message.anchorPath}</code>
                  </p>
                ) : null}
                {message.failedNotebookPath ? (
                  <p className="message-path">
                    <span>failed notebook folder</span>
                    <code>{message.failedNotebookPath}</code>
                  </p>
                ) : null}
                {(message.decoupledPaths ?? []).length > 0 ? (
                  <div className="message-path-list">
                    <span>de-coupled</span>
                    {(message.decoupledPaths ?? []).map((path) => (
                      <code key={path}>{path}</code>
                    ))}
                  </div>
                ) : null}
                {(message.issueSummary ?? []).length > 0 ? (
                  <div className="message-path-list">
                    <span>issue summary</span>
                    {(message.issueSummary ?? []).map((issue, index) => (
                      <code key={`${message.id}-issue-${index}`}>{issue}</code>
                    ))}
                  </div>
                ) : null}
                {message.type === 'storage-notebook-recovered' &&
                message.failedNotebookPath &&
                message.failedNotebookAvailable !== false ? (
                  <div className="message-actions">
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn"
                      onClick={() => onOpenRecoveredNotebookLocation(message)}
                    >
                      {getRecoveryFolderActionLabel(message)}
                    </button>
                  </div>
                ) : null}
                {(message.affectedLocations ?? []).some((entry) => entry.location) ? (
                  <div className="message-actions">
                    {(message.affectedLocations ?? []).map((entry, index) =>
                      entry.location ? (
                        <button
                          key={`${message.id}-${entry.path ?? index}`}
                          type="button"
                          className="btn btn-sm settings-action-btn"
                          onClick={() => onOpenLocation(entry.location!)}
                        >
                          open {entry.label}
                        </button>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
