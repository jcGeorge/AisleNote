import type { AppMessage, NoteLocation } from '../../types/app'

type MessagesViewProps = {
  messages: AppMessage[]
  onDismissMessage: (messageId: string) => void
  onOpenLocation: (location: NoteLocation) => void
}

export function MessagesView({ messages, onDismissMessage, onOpenLocation }: MessagesViewProps) {
  const visibleMessages = messages.filter((message) => message.status !== 'dismissed')

  return (
    <section className="messages-view" aria-label="Messages">
      <header className="messages-view-header">
        <h2>messages</h2>
      </header>
      {visibleMessages.length === 0 ? (
        <p className="messages-empty">no messages.</p>
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
    </section>
  )
}
