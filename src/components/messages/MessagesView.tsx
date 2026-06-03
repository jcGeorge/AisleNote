import type { AppMessage, MessagesSection, NoteLocation, ToastHistoryEntry } from '../../types/app'
import { orderToastHistoryForDisplay } from '../overlays/toast-stack'

type MessagesViewProps = {
  section: MessagesSection
  messages: AppMessage[]
  toastHistory: ToastHistoryEntry[]
  onDismissMessage: (messageId: string) => void
  onOpenLocation: (location: NoteLocation) => void
}

function formatToastHistoryTimestamp(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString()
}

export function MessagesView({
  section,
  messages,
  toastHistory,
  onDismissMessage,
  onOpenLocation,
}: MessagesViewProps) {
  const visibleMessages = messages.filter((message) => message.status !== 'dismissed')

  return (
    <section className="utility-page-wrap messages-view" aria-label="Messages">
      <div className="utility-page-card messages-view-card">
        {section === 'toast-history' ? (
          toastHistory.length === 0 ? (
            <p className="messages-empty">no toast history.</p>
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
                        <time dateTime={toast.createdAt}>{formatToastHistoryTimestamp(toast.createdAt)}</time>
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : visibleMessages.length === 0 ? (
          <p className="messages-empty">no inbox messages.</p>
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
                {(message.decoupledPaths ?? []).length > 0 ? (
                  <div className="message-path-list">
                    <span>de-coupled</span>
                    {(message.decoupledPaths ?? []).map((path) => (
                      <code key={path}>{path}</code>
                    ))}
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
