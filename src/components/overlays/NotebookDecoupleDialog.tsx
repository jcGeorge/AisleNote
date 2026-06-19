import React from 'react'
import type { NotebookDecoupleRow } from '../../notes/notebook-note-actions'

void React

export function NotebookDecoupleDialog({
  title,
  description,
  rows,
  onCancel,
  onApply,
}: {
  title: string
  description: string
  rows: NotebookDecoupleRow[]
  onCancel: () => void
  onApply: () => void
}) {
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
          <button type="button" aria-label="Close decouple dialog" onClick={onCancel}>
            x
          </button>
        </header>
        <p>{description}</p>
        <div className="notebook-decouple-rows">
          {rows.length > 0 ? rows.map((row) => (
            <div key={row.key} className="notebook-decouple-row">
              <span>{row.label}</span>
              {row.aisleId ? <small>aisle body {row.aisleBodyId}</small> : <small>note body {row.noteBodyId}</small>}
            </div>
          )) : (
            <p className="notebook-decouple-empty">No linked locations found.</p>
          )}
        </div>
        <footer className="notebook-decouple-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="is-primary" onClick={onApply}>De-couple</button>
        </footer>
      </section>
    </div>
  )
}
