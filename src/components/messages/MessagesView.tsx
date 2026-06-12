import { useState } from 'react'
import type {
  DiagnosticLogDisplayLimit,
  DiagnosticLogEntry,
  DiagnosticLogLevelFilter,
  DiagnosticLogMode,
} from '../../diagnostics/diagnostic-log'
import {
  DIAGNOSTIC_LOG_DISPLAY_LIMITS,
  DIAGNOSTIC_LOG_LEVEL_FILTERS,
  DIAGNOSTIC_LOG_MODES,
  orderDiagnosticEntriesForDisplay,
} from '../../diagnostics/diagnostic-log'
import {
  EDITOR_ABLATION_MODE_LABELS,
  EDITOR_ABLATION_MODES,
  parseEditorAblationMode,
  readEditorAblationMode,
  writeEditorAblationMode,
  type EditorAblationMode,
} from '../../editor/editor-ablation'
import {
  EDITOR_CORE_MODE_LABELS,
  EDITOR_CORE_MODES,
  parseEditorCoreMode,
  readEditorCoreMode,
  writeEditorCoreMode,
  type EditorCoreMode,
} from '../../editor/editor-core'
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
  diagnosticMode?: DiagnosticLogMode
  diagnosticCaptureEnabled?: boolean
  onDiagnosticDayChange?: (dayKey: string) => void
  onDiagnosticLevelFilterChange?: (filter: DiagnosticLogLevelFilter) => void
  onDiagnosticDisplayLimitChange?: (limit: DiagnosticLogDisplayLimit) => void
  onDiagnosticModeChange?: (mode: DiagnosticLogMode) => void
  onDiagnosticCaptureEnabledChange?: (enabled: boolean) => void
  onOpenDiagnosticsFolder?: () => void
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

function parseDiagnosticDisplayLimit(value: string): DiagnosticLogDisplayLimit {
  return value === 'all' ? 'all' : Number(value) as DiagnosticLogDisplayLimit
}

function isHealthyStorageStatusInfo(entry: DiagnosticLogEntry) {
  return (
    entry.level === 'info' &&
    entry.area === 'storage' &&
    entry.event === 'profile-status' &&
    entry.details?.status === 'ready' &&
    entry.details?.health === 'healthy'
  )
}

function filterActionableDiagnosticEntries(entries: DiagnosticLogEntry[]) {
  const anchors = entries
    .filter((entry) => entry.level === 'warning' || entry.level === 'error')
    .map((entry) => new Date(entry.createdAt).getTime())
    .filter((timestamp) => Number.isFinite(timestamp))
  if (anchors.length === 0) return []
  return entries.filter((entry) => {
    if (entry.level === 'warning' || entry.level === 'error') return true
    if (isHealthyStorageStatusInfo(entry)) return false
    const timestamp = new Date(entry.createdAt).getTime()
    if (!Number.isFinite(timestamp)) return false
    return anchors.some((anchor) => Math.abs(timestamp - anchor) <= 5000)
  })
}

function getRecoveryFolderActionLabel(message: AppMessage) {
  const localNotebookWasTheFailedFolder =
    message.recoveryMode === 'reset-default' &&
    (message.activeNotebookPath === undefined ||
      (message.failedNotebookPath !== undefined && message.failedNotebookPath === message.activeNotebookPath))
  return localNotebookWasTheFailedFolder ? 'open local notebook folder' : 'open previous notebook folder'
}

const EDITOR_ABLATION_MODE_DESCRIPTIONS: Record<EditorAblationMode, string> = {
  off: 'Normal production editor path with mount blank restoration removed from the hot path.',
  'toast-only': 'Toast UI only: no app plugins, toolbar items, DOM installers, image hook, or blank restore.',
  'toast-blank-restore': 'Toast UI plus display preparation and blank restore only.',
  'toast-core-plugins': 'Toast UI plus core formatting, list, code, and table-like editor plugins only.',
  'toast-special-plugins': 'Current production path except media-link and note-preview plugins are disabled.',
  'toast-full-no-restore': 'Current production path with mount blank restoration skipped.',
  'toast-retain-current-previous': 'Current production path retaining the active and previous aisle editor.',
}

const EDITOR_CORE_MODE_DESCRIPTIONS: Record<EditorCoreMode, string> = {
  auto: 'Uses the current safe default editor core. Toast UI remains the default until a replacement proves out.',
  toast: 'Forces the current Toast UI editor core for every aisle.',
  mdxeditor: 'Experimental replacement core. Faster in some cases, but app-specific tags, media, find, and toolbar parity are incomplete.',
  codemirror: 'Forces the fast source-Markdown CodeMirror editor core for every aisle.',
}

function EditorDevMessagesSection() {
  const [mode, setMode] = useState<EditorAblationMode>(() => readEditorAblationMode())
  const [editorCoreMode, setEditorCoreMode] = useState<EditorCoreMode>(() => readEditorCoreMode())
  const [status, setStatus] = useState('')

  const handleModeChange = (nextMode: EditorAblationMode) => {
    const wrote = writeEditorAblationMode(nextMode)
    setMode(nextMode)
    setStatus(wrote ? 'Reload the app to apply this editor diagnostic mode.' : 'Could not save editor diagnostic mode.')
  }

  const handleEditorCoreModeChange = (nextMode: EditorCoreMode) => {
    const wrote = writeEditorCoreMode(nextMode)
    setEditorCoreMode(nextMode)
    setStatus(wrote ? 'Reload the app to apply this editor core.' : 'Could not save editor core mode.')
  }

  const reloadApp = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return (
    <div className="messages-list editor-dev-messages-list">
      <article className="message-card editor-dev-card">
        <div className="message-card-header">
          <div>
            <h3>editor diagnostics</h3>
            <p>
              These modes isolate the production editor path without changing notebook files. Select a mode, reload,
              then reproduce the slow aisle.
            </p>
          </div>
        </div>
        <div className="settings-hotkey-row">
          <label className="settings-hotkey-label" htmlFor="messages-editor-core-mode">
            editor core
          </label>
          <select
            id="messages-editor-core-mode"
            className="settings-select-input"
            value={editorCoreMode}
            onChange={(event) => handleEditorCoreModeChange(parseEditorCoreMode(event.target.value))}
          >
            {EDITOR_CORE_MODES.map((option) => (
              <option key={option} value={option}>
                {EDITOR_CORE_MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <p className="settings-help">{EDITOR_CORE_MODE_DESCRIPTIONS[editorCoreMode]}</p>
        <div className="settings-hotkey-row">
          <label className="settings-hotkey-label" htmlFor="messages-editor-ablation-mode">
            editor diagnostic mode
          </label>
          <select
            id="messages-editor-ablation-mode"
            className="settings-select-input"
            value={mode}
            onChange={(event) => handleModeChange(parseEditorAblationMode(event.target.value))}
          >
            {EDITOR_ABLATION_MODES.map((option) => (
              <option key={option} value={option}>
                {EDITOR_ABLATION_MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <p className="settings-help">{EDITOR_ABLATION_MODE_DESCRIPTIONS[mode]}</p>
        <div className="settings-page-actions">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={reloadApp}>
            reload app
          </button>
        </div>
        {status ? <p className="settings-help">{status}</p> : null}
      </article>
    </div>
  )
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
  diagnosticMode = 'actionable',
  diagnosticCaptureEnabled = true,
  onDiagnosticDayChange = () => undefined,
  onDiagnosticLevelFilterChange = () => undefined,
  onDiagnosticDisplayLimitChange = () => undefined,
  onDiagnosticModeChange = () => undefined,
  onDiagnosticCaptureEnabledChange = () => undefined,
  onOpenDiagnosticsFolder,
  onDismissMessage,
  onOpenRecoveredNotebookLocation,
  onOpenLocation,
}: MessagesViewProps) {
  const visibleMessages = messages.filter((message) => message.status !== 'dismissed')
  const orderedDiagnosticEntries = orderDiagnosticEntriesForDisplay(diagnosticEntries)
  const modeFilteredDiagnosticEntries =
    diagnosticMode === 'actionable'
      ? filterActionableDiagnosticEntries(orderedDiagnosticEntries)
      : orderedDiagnosticEntries
  const filteredDiagnosticEntries =
    diagnosticLevelFilter === 'all'
      ? modeFilteredDiagnosticEntries
      : modeFilteredDiagnosticEntries.filter((entry) => entry.level === diagnosticLevelFilter)
  const diagnosticLimitCount = getDiagnosticDisplayLimitCount(diagnosticDisplayLimit)
  const displayedDiagnosticEntries =
    diagnosticLimitCount === null
      ? filteredDiagnosticEntries
      : filteredDiagnosticEntries.slice(0, diagnosticLimitCount)
  const diagnosticsToolbar = (
    <div className="diagnostic-log-toolbar" role="group" aria-label="diagnostic controls">
      <label className="diagnostic-log-field" htmlFor="diagnostic-log-day-select">
        <span className="settings-hotkey-label">day</span>
        <select
          id="diagnostic-log-day-select"
          className="settings-select-input diagnostic-log-select diagnostic-log-day-select"
          value={selectedDiagnosticDay}
          onChange={(event) => onDiagnosticDayChange(event.target.value)}
          disabled={diagnosticDays.length === 0}
        >
          {diagnosticDays.map((dayKey) => (
            <option key={dayKey} value={dayKey}>
              {dayKey}
            </option>
          ))}
        </select>
      </label>
      <label className="diagnostic-log-field">
        <span>mode</span>
        <select
          className="settings-select-input diagnostic-log-select"
          aria-label="diagnostic mode"
          value={diagnosticMode}
          onChange={(event) => onDiagnosticModeChange(event.target.value as DiagnosticLogMode)}
        >
          {DIAGNOSTIC_LOG_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'all' ? 'all logs' : mode}
            </option>
          ))}
        </select>
      </label>
      <label className="diagnostic-log-field">
        <span>type</span>
        <select
          className="settings-select-input diagnostic-log-select"
          aria-label="diagnostic message type"
          value={diagnosticLevelFilter}
          onChange={(event) => onDiagnosticLevelFilterChange(event.target.value as DiagnosticLogLevelFilter)}
        >
          {DIAGNOSTIC_LOG_LEVEL_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {filter === 'all' ? 'all' : filter}
            </option>
          ))}
        </select>
      </label>
      <label className="diagnostic-log-field">
        <span>show</span>
        <select
          className="settings-select-input diagnostic-log-select"
          aria-label="diagnostic message count"
          value={String(diagnosticDisplayLimit)}
          onChange={(event) => onDiagnosticDisplayLimitChange(parseDiagnosticDisplayLimit(event.target.value))}
        >
          {DIAGNOSTIC_LOG_DISPLAY_LIMITS.map((limit) => (
            <option key={String(limit)} value={String(limit)}>
              {limit === 'all' ? 'all' : limit.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <label className="diagnostic-log-field diagnostic-log-capture-field" htmlFor="diagnostic-capture-switch">
        <span>capture diagnostics</span>
        <span className="form-check form-switch settings-switch diagnostic-log-capture-switch">
          <input
            id="diagnostic-capture-switch"
            className="form-check-input"
            type="checkbox"
            role="switch"
            aria-label="capture diagnostics"
            checked={diagnosticCaptureEnabled}
            onChange={(event) => onDiagnosticCaptureEnabledChange(event.target.checked)}
          />
        </span>
      </label>
      {onOpenDiagnosticsFolder ? (
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onOpenDiagnosticsFolder}>
          open diagnostics folder
        </button>
      ) : null}
    </div>
  )

  return (
    <section className="utility-page-wrap messages-view" aria-label="Messages">
      <div
        className={`utility-page-card messages-view-card${section === 'diagnostics' ? ' messages-view-card-diagnostics' : ''}`}
      >
        {section === 'diagnostics' ? (
          <div className="diagnostic-log-view">
            {diagnosticsToolbar}
            {diagnosticDays.length === 0 ? (
              <p className="messages-empty">No diagnostic logs.</p>
            ) : (
              <>
                {orderedDiagnosticEntries.length === 0 ? (
                  <p className="messages-empty">No diagnostic logs for this day.</p>
                ) : filteredDiagnosticEntries.length === 0 ? (
                  <p className="messages-empty">
                    {diagnosticMode === 'actionable'
                      ? 'No actionable diagnostic logs for this day.'
                      : 'No diagnostic logs for this type.'}
                  </p>
                ) : (
                  <>
                    <p className="diagnostic-log-summary">
                      showing {displayedDiagnosticEntries.length.toLocaleString()} of{' '}
                      {filteredDiagnosticEntries.length.toLocaleString()}
                      {diagnosticLevelFilter === 'all' ? ' diagnostics' : ` ${diagnosticLevelFilter} diagnostics`}
                      {diagnosticMode === 'actionable' ? ' in actionable mode' : ''}
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
              </>
            )}
          </div>
        ) : section === 'editor-dev' ? (
          <EditorDevMessagesSection />
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
