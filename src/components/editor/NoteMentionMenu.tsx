import type { NoteMentionNavigatorRow, NoteMentionNavigatorRowId } from '../../notes/note-mention-picker'
import type { NoteSearchEntry } from '../../notes/note-locations'
import type { NoteLocation } from '../../types/app'

type NoteMentionAction = 'link' | 'context'

type NoteMentionMenuProps = {
  top: number
  left: number
  query: string
  navigatorRows: NoteMentionNavigatorRow[]
  activeRow: NoteMentionNavigatorRowId
  searchEntries: NoteSearchEntry[]
  activeSearchIndex: number
  modifierLabel: string
  onActiveRowChange: (rowId: NoteMentionNavigatorRowId) => void
  onSelectNavigatorItem: (rowId: NoteMentionNavigatorRowId, itemId: string) => void
  onHighlightSearch: (index: number) => void
  onChooseSearchEntry: (entry: NoteSearchEntry, action: NoteMentionAction) => void
  onChooseTarget: (target: NoteLocation, action: NoteMentionAction) => void
}

const HOME_NOTE_ID = '__home__'

function getActiveNavigatorTarget(rows: NoteMentionNavigatorRow[]): NoteLocation | null {
  const noteRow = rows.find((row) => row.id === 'note')
  return noteRow?.items.find((item) => item.id === noteRow.selectedId)?.target ?? null
}

function NoteMentionActions({
  modifierLabel,
  onLink,
  onPreview,
}: {
  modifierLabel: string
  onLink: () => void
  onPreview: () => void
}) {
  return (
    <div className="note-mention-actions">
      <button type="button" className="note-mention-action-btn is-primary" onClick={onLink}>
        Enter link
      </button>
      <button type="button" className="note-mention-action-btn" onClick={onPreview}>
        {modifierLabel}+Enter preview
      </button>
    </div>
  )
}

export function NoteMentionMenu(props: NoteMentionMenuProps) {
  const trimmedQuery = props.query.trim()
  const searchMode = trimmedQuery.length > 0
  const activeEntry = props.searchEntries[Math.max(0, Math.min(props.searchEntries.length - 1, props.activeSearchIndex))]
  const activeNavigatorTarget = getActiveNavigatorTarget(props.navigatorRows)

  return (
    <div
      className={`note-mention-menu ${searchMode ? 'is-search' : 'is-navigator'}`}
      style={{ top: `${props.top}px`, left: `${props.left}px` }}
      role="menu"
      aria-label={searchMode ? 'Note search' : 'Note navigator'}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {searchMode ? (
        <div className="note-mention-search-results">
          {props.searchEntries.length > 0 ? (
            props.searchEntries.map((entry, index) => (
              <button
                key={`${entry.domainId}:${entry.spaceId}:${entry.tabId}:${entry.subTabId ?? 'home'}`}
                type="button"
                className={`note-mention-result-card${index === props.activeSearchIndex ? ' is-active' : ''}`}
                role="menuitem"
                aria-current={index === props.activeSearchIndex ? 'true' : undefined}
                onMouseEnter={() => props.onHighlightSearch(index)}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  props.onChooseSearchEntry(entry, 'link')
                }}
              >
                <span className="note-mention-result-title">{entry.noteName}</span>
                <span className="note-mention-result-breadcrumb">
                  {entry.domainName} / {entry.spaceName} / {entry.parentName}
                  {entry.subTabId ? '' : ' / home'}
                </span>
              </button>
            ))
          ) : (
            <div className="note-mention-empty">no matching notes</div>
          )}
        </div>
      ) : (
        <div className="note-mention-navigator">
          {props.navigatorRows.map((row) => (
            <section
              key={row.id}
              className={`note-mention-nav-row${row.id === props.activeRow ? ' is-active-row' : ''}`}
              aria-label={row.label}
            >
              <button
                type="button"
                className="note-mention-row-label"
                onClick={() => props.onActiveRowChange(row.id)}
              >
                {row.label}
              </button>
              <div className="note-mention-row-items">
                {row.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`note-mention-nav-chip${item.id === row.selectedId ? ' is-selected' : ''}`}
                    role="menuitem"
                    aria-current={item.id === row.selectedId ? 'true' : undefined}
                    onMouseEnter={() => props.onActiveRowChange(row.id)}
                    onClick={() => props.onSelectNavigatorItem(row.id, item.id)}
                  >
                    {row.id === 'note' && item.id === HOME_NOTE_ID ? 'home' : item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <NoteMentionActions
        modifierLabel={props.modifierLabel}
        onLink={() => {
          if (searchMode && activeEntry) {
            props.onChooseSearchEntry(activeEntry, 'link')
            return
          }
          if (activeNavigatorTarget) props.onChooseTarget(activeNavigatorTarget, 'link')
        }}
        onPreview={() => {
          if (searchMode && activeEntry) {
            props.onChooseSearchEntry(activeEntry, 'context')
            return
          }
          if (activeNavigatorTarget) props.onChooseTarget(activeNavigatorTarget, 'context')
        }}
      />
    </div>
  )
}

export type { NoteMentionAction }
