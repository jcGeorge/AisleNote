type TrashHomeNoteProps = {
  onRestoreAll: () => void
  onDeleteAll: () => void
}

export function TrashHomeNote({ onRestoreAll, onDeleteAll }: TrashHomeNoteProps) {
  return (
    <section className="trash-home-note">
      <p>Items moved here are pending deletion.</p>
      <ul>
        <li>
          Use <strong>Restore All</strong> to move everything back into notes.
        </li>
        <li>
          Use <strong>delete all</strong> to permanently remove all items in Trash.
        </li>
        <li>This Trash note is read-only.</li>
      </ul>
      <div className="trash-home-actions">
        <button type="button" className="btn btn-sm btn-outline-light" onClick={onRestoreAll}>
          restore all
        </button>
        <button type="button" className="btn btn-sm app-danger-btn" onClick={onDeleteAll}>
          delete all
        </button>
      </div>
    </section>
  )
}
