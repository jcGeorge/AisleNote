import React from 'react'
import type { NotebookDecoupleRow } from '../../notes/notebook-note-actions'
import { DecoupleCautionStripe } from '../decouple/DecoupleCautionStripe'
import { AppIcon } from '../icons/AppIcon'

void React

export function NotebookDecoupleDialog({
  title,
  description,
  rows,
  keepKeys,
  currentKey,
  keepData,
  keepDataLabel = 'keep text in de-coupled items?',
  error,
  onCancel,
  onToggleKeepKey,
  onKeepDataChange,
  onApply,
}: {
  title: string
  description: string
  rows: NotebookDecoupleRow[]
  keepKeys: string[]
  currentKey: string
  keepData: boolean
  keepDataLabel?: string
  error?: string
  onCancel: () => void
  onToggleKeepKey: (key: string) => void
  onKeepDataChange: (keepData: boolean) => void
  onApply: () => void
}) {
  const keepKeySet = new Set(keepKeys)
  return (
    <div className="notebook-decouple-layer" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <section
        className="notebook-decouple-dialog"
        role="dialog"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="notebook-decouple-header">
          <h2>{title}</h2>
          <button type="button" className="app-close-button" aria-label="Close decouple dialog" onClick={onCancel}>
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </header>
        <p>{description}</p>
        <div className="notebook-decouple-rows">
          {rows.length > 0 ? rows.map((row) => {
            const willDecouple = !keepKeySet.has(row.key)
            const current = row.key === currentKey
            return (
              <button
                key={row.key}
                type="button"
                className={`notebook-decouple-row ${willDecouple ? 'is-will-decouple' : 'is-keep-synced'} ${
                  current ? 'is-current' : ''
                }`}
                aria-pressed={willDecouple}
                onClick={() => onToggleKeepKey(row.key)}
              >
                <span>{row.primaryLabel || row.label}</span>
                <small>{row.secondaryLabel}</small>
                {willDecouple ? <DecoupleCautionStripe /> : null}
              </button>
            )
          }) : (
            <p className="notebook-decouple-empty">No linked locations found.</p>
          )}
        </div>
        <label className="notebook-decouple-keep-data form-check form-switch settings-switch">
          <span>{keepDataLabel}</span>
          <input
            type="checkbox"
            className="form-check-input"
            role="switch"
            checked={keepData}
            onChange={(event) => onKeepDataChange(event.target.checked)}
          />
        </label>
        {error ? <p className="notebook-decouple-error">{error}</p> : null}
        <footer className="notebook-decouple-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="is-primary" onClick={onApply}>Apply</button>
        </footer>
      </section>
    </div>
  )
}
