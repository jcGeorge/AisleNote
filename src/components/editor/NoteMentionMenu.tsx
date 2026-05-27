import type {
  NoteMentionNavigatorItem,
  NoteMentionNavigatorRow,
  NoteMentionNavigatorRowId,
  NoteMentionAction,
  NoteMentionSearchContextChip,
  NoteMentionSearchEntryDetails,
  NoteMentionSearchFocusStage,
  NoteMentionTarget,
} from '../../notes/note-mention-picker'
import { NOTE_MENTION_ACTIONS, isNoteMentionCopyAction } from '../../notes/note-mention-picker'
import type { NoteSearchEntry } from '../../notes/note-locations'
import {
  handleNoteMentionSearchAisleClick,
  handleNoteMentionSearchResultClick,
  handleNoteMentionSearchResultDoubleClick,
  handleNoteMentionSearchResultHover,
} from './note-mention-menu-events'

type NoteMentionMenuProps = {
  top: number
  left: number
  query: string
  navigatorRows: NoteMentionNavigatorRow[]
  activeRow: NoteMentionNavigatorRowId
  searchEntries: NoteSearchEntry[]
  searchEntryDetails: NoteMentionSearchEntryDetails[]
  activeSearchIndex: number
  selectedSearchIndex: number | null
  searchAisleItems: NoteMentionNavigatorItem[]
  selectedSearchAisleId: string
  searchFocusStage: NoteMentionSearchFocusStage
  focusedAisleIndex: number
  focusedActionIndex: number
  focusedConfirmIndex: number
  pendingCopyAction: NoteMentionAction | null
  onActiveRowChange: (rowId: NoteMentionNavigatorRowId) => void
  onSelectNavigatorItem: (rowId: NoteMentionNavigatorRowId, itemId: string) => void
  onSelectSearchResult: (index: number) => void
  onSelectSearchAisle: (aisleId: string) => void
  onHighlightSearch: (index: number) => void
  onFocusAction: (index: number) => void
  onChooseAction: (action: NoteMentionAction) => void
  onConfirmCopyAction: () => void
  onCancelCopyAction: () => void
  onChooseSearchEntry: (entry: NoteSearchEntry, action: NoteMentionAction) => void
  onChooseTarget: (target: NoteMentionTarget, action: NoteMentionAction) => void
}

const HOME_NOTE_ID = '__home__'

function getActiveNavigatorTarget(rows: NoteMentionNavigatorRow[]): NoteMentionTarget | null {
  const aisleRow = rows.find((row) => row.id === 'aisle')
  const aisleTarget = aisleRow?.items.find((item) => item.id === aisleRow.selectedId)?.target
  if (aisleTarget) return aisleTarget
  const noteRow = rows.find((row) => row.id === 'note')
  return noteRow?.items.find((item) => item.id === noteRow.selectedId)?.target ?? null
}

function getSearchContextChipClassName(kind: NoteMentionSearchContextChip['kind']) {
  if (kind === 'domain') {
    return 'note-mention-result-context-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  }
  if (kind === 'space') {
    return 'note-mention-result-context-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  }
  if (kind === 'parent') {
    return 'note-mention-result-context-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  }
  return 'note-mention-result-context-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

function getNoteMentionActionLabel(action: NoteMentionAction): string {
  if (action === 'context') return 'note preview'
  if (action === 'independent-copy') return 'make independent copy'
  if (action === 'synced-copy') return 'synced copy'
  return 'note link'
}

function NoteMentionActions({
  actions,
  focusedActionIndex,
  focusedConfirmIndex,
  pendingCopyAction,
  onActionFocus,
  onActionChoose,
  onConfirmCopyAction,
  onCancelCopyAction,
}: {
  actions: NoteMentionAction[]
  focusedActionIndex: number
  focusedConfirmIndex: number
  pendingCopyAction: NoteMentionAction | null
  onActionFocus: (index: number) => void
  onActionChoose: (action: NoteMentionAction) => void
  onConfirmCopyAction: () => void
  onCancelCopyAction: () => void
}) {
  return (
    <div className="note-mention-actions" aria-label="note mention actions">
      <div className="note-mention-action-list">
        {actions.map((action, index) => (
          <button
            key={action}
            type="button"
            className={`note-mention-action-btn${index === focusedActionIndex ? ' is-focused' : ''}${pendingCopyAction === action ? ' is-pending-copy' : ''}`}
            aria-current={index === focusedActionIndex ? 'true' : undefined}
            onMouseEnter={() => onActionFocus(index)}
            onClick={() => onActionChoose(action)}
          >
            {getNoteMentionActionLabel(action)}
          </button>
        ))}
      </div>
      {pendingCopyAction && isNoteMentionCopyAction(pendingCopyAction) && (
        <div className="note-mention-copy-confirm" role="group" aria-label="confirm copy action">
          <span className="note-mention-copy-confirm-text">this operation will replace this note</span>
          <button
            type="button"
            className={`note-mention-action-btn is-primary${focusedConfirmIndex === 0 ? ' is-focused' : ''}`}
            aria-current={focusedConfirmIndex === 0 ? 'true' : undefined}
            onClick={onConfirmCopyAction}
          >
            proceed
          </button>
          <button
            type="button"
            className={`note-mention-action-btn${focusedConfirmIndex === 1 ? ' is-focused' : ''}`}
            aria-current={focusedConfirmIndex === 1 ? 'true' : undefined}
            onClick={onCancelCopyAction}
          >
            nevermind
          </button>
        </div>
      )}
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
            <>
              {props.searchEntries.map((entry, index) => {
                const details = props.searchEntryDetails[index]
                const contextChips = details?.contextChips ?? [
                  { kind: 'domain' as const, label: entry.domainName },
                  { kind: 'space' as const, label: entry.spaceName },
                  { kind: 'parent' as const, label: entry.parentName },
                  { kind: 'note' as const, label: entry.noteName },
                ]
                const aisleCount = details?.aisleCount ?? 1
                return (
                  <button
                    key={`${entry.domainId}:${entry.spaceId}:${entry.tabId}:${entry.subTabId ?? 'home'}`}
                    type="button"
                    className={`note-mention-result-card${index === props.activeSearchIndex ? ' is-active' : ''}${index === props.selectedSearchIndex ? ' is-selected-search' : ''}`}
                    role="menuitem"
                    aria-current={index === props.activeSearchIndex ? 'true' : undefined}
                    aria-selected={index === props.selectedSearchIndex ? 'true' : undefined}
                    onPointerEnter={() => handleNoteMentionSearchResultHover(index, props.onHighlightSearch)}
                    onClick={(event) => {
                      handleNoteMentionSearchResultClick(event, index, props.onSelectSearchResult)
                    }}
                    onDoubleClick={(event) => {
                      handleNoteMentionSearchResultDoubleClick(event, entry, props.onChooseSearchEntry)
                    }}
                  >
                    <span className="note-mention-result-count" aria-label={`${aisleCount} ${aisleCount === 1 ? 'aisle' : 'aisles'}`}>
                      {aisleCount}
                    </span>
                    <span className="note-mention-result-title">{entry.noteName}</span>
                    <span className="note-mention-result-context">
                      {contextChips.map((chip) => (
                        <span key={`${chip.kind}:${chip.label}`} className={getSearchContextChipClassName(chip.kind)}>
                          {chip.label}
                        </span>
                      ))}
                    </span>
                  </button>
                )
              })}
              {props.searchAisleItems.length > 0 && (
                <section className="note-mention-nav-row is-aisle-row" aria-label="aisles">
                  <div className="note-mention-row-items">
                    {props.searchAisleItems.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`rail-control note-mention-nav-chip${item.id === props.selectedSearchAisleId ? ' is-selected' : ''}`}
                        data-focused={index === props.focusedAisleIndex && props.searchFocusStage === 'aisles' ? 'true' : undefined}
                        role="menuitem"
                        aria-current={item.id === props.selectedSearchAisleId ? 'true' : undefined}
                        onClick={(event) => {
                          handleNoteMentionSearchAisleClick(event, item.id, props.onSelectSearchAisle)
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="note-mention-empty">no matching notes</div>
          )}
        </div>
      ) : (
        <div className="note-mention-navigator">
          {props.navigatorRows.map((row) => (
            <section
              key={row.id}
              className={`note-mention-nav-row is-${row.id}-row${row.id === props.activeRow ? ' is-active-row' : ''}`}
              aria-label={row.label}
            >
              <div className="note-mention-row-items">
                {row.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rail-control note-mention-nav-chip${item.id === row.selectedId ? ' is-selected' : ''}`}
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
        actions={searchMode ? NOTE_MENTION_ACTIONS : NOTE_MENTION_ACTIONS.slice(0, 2)}
        focusedActionIndex={props.focusedActionIndex}
        focusedConfirmIndex={props.focusedConfirmIndex}
        pendingCopyAction={props.pendingCopyAction}
        onActionFocus={props.onFocusAction}
        onActionChoose={(action) => {
          if (searchMode && activeEntry) {
            props.onChooseAction(action)
            return
          }
          if (activeNavigatorTarget) props.onChooseTarget(activeNavigatorTarget, action)
        }}
        onConfirmCopyAction={props.onConfirmCopyAction}
        onCancelCopyAction={props.onCancelCopyAction}
      />
    </div>
  )
}
