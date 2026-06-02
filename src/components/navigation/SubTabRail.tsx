import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  SelectionClickModifiers,
  StageManagerParentSelection,
  SubTab,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
} from '../../types/app'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { SortIcon } from './SortIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type SubTabRailProps = {
  viewMode: ViewMode
  activeTab: Tab
  activeSubTabId: string | null
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  tooltipsDisabled?: boolean
  showParentHomeTab: boolean
  tagFilterActive?: boolean
  getHomeLabel?: () => ReactNode
  getSubTabLabel?: (subTab: SubTab) => ReactNode
  scratchpadTagCountLabel?: string
  isNoteWorkspaceView: boolean
  selectedTrashTab: TrashParentBucket | null
  trashSubTabs: TrashParentBucket['subTabs']
  selectedTrashSubTabId: string | null
  subTabRailRef: RefObject<HTMLDivElement | null>
  arrangeableSubTabClassName: string
  arrangeControlsDisabled?: boolean
  draggingSubTabId: string | null
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onGetStageManagerParentSelection: (tab: Tab) => StageManagerParentSelection
  onStageManagerHomeClick: () => void
  onStageManagerSubTabClick: (tab: Tab, subTabId: string, modifiers: SelectionClickModifiers) => void
  arrangeSelectedSubTabIds: ReadonlySet<string>
  onHandleArrangeSubTabSelectionClick: (
    parentTabId: string,
    subTabId: string,
    modifiers: SelectionClickModifiers,
  ) => boolean
  onClearArrangeSelection: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onSelectParentHomeTab: () => void
  onSelectSubTab: (subTabId: string) => void
  onBeginEdit: (editing: { type: EditableEntityType; id: string }) => void
  onOpenContextMenuForHomeTab: (event: MouseEvent<HTMLButtonElement>, tabId: string) => void
  onOpenContextMenuForSubTab: (event: MouseEvent<HTMLButtonElement>, tabId: string, subTabId: string) => void
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onFinalizeArrangeTapCandidate: (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    onActivate: () => void,
  ) => void
  onHandleArrangeTabPointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => void
  onHandleArrangeTabPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => void
  onClearArrangePressTimer: () => void
  onClearArrangeTapCandidate: () => void
  onCancelArrangeTabPointerDrag: () => void
  onSetTrashSubTabId: (subTabId: string) => void
  onOpenContextMenuForTrashSubTab: (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => void
  onAddSubTab: () => void
  onOpenSubTabSortModal: () => void
  scratchpadActive?: boolean
  onOpenScratchpad?: () => void
  onOpenContextMenuForScratchpad?: (event: MouseEvent<HTMLButtonElement>) => void
}

function getSelectionClickModifiers(event: MouseEvent | ReactPointerEvent<HTMLButtonElement>): SelectionClickModifiers {
  return {
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  }
}

function hasSelectionClickModifier(event: MouseEvent | ReactPointerEvent<HTMLButtonElement>) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

function ScratchpadIcon() {
  return (
    <svg className="scratchpad-rail-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M7.2 18.6c2.6-8.8 17.1-11.3 18.1-3.7.8 6.5-13.6 11.9-17.4 5.1-3.2-5.8 4.9-15.5 12.4-11.6 8.6 4.5 2.9 17.7-6.3 16.1-8.4-1.5-7.2-13.8.5-16.1 8.9-2.6 14.6 7.8 8.8 13.9-5.4 5.8-16.7 2.8-16.2-5.2.4-6.1 8.6-9.5 14.2-6.5 6.4 3.4 5.5 12.8-1.4 15.1-6.7 2.2-13.6-3.8-11.2-10.2 2.8-7.5 15.6-7.1 17.3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SubTabRail({
  viewMode,
  activeTab,
  activeSubTabId,
  editing,
  arrangeMode,
  tooltipsDisabled = false,
  showParentHomeTab,
  tagFilterActive = false,
  getHomeLabel = () => 'home',
  getSubTabLabel = (subTab) => subTab.title,
  scratchpadTagCountLabel = '',
  isNoteWorkspaceView,
  selectedTrashTab,
  trashSubTabs,
  selectedTrashSubTabId,
  subTabRailRef,
  arrangeableSubTabClassName,
  arrangeControlsDisabled = false,
  draggingSubTabId,
  onAutoSizeRenameInput,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onClearRenameDraft,
  onGetStageManagerParentSelection,
  onStageManagerHomeClick,
  onStageManagerSubTabClick,
  arrangeSelectedSubTabIds,
  onHandleArrangeSubTabSelectionClick,
  onClearArrangeSelection,
  onConsumeArrangeClickSuppression,
  onSelectParentHomeTab,
  onSelectSubTab,
  onBeginEdit,
  onOpenContextMenuForHomeTab,
  onOpenContextMenuForSubTab,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onFinalizeArrangeTapCandidate,
  onHandleArrangeTabPointerMove,
  onHandleArrangeTabPointerUp,
  onClearArrangePressTimer,
  onClearArrangeTapCandidate,
  onCancelArrangeTabPointerDrag,
  onSetTrashSubTabId,
  onOpenContextMenuForTrashSubTab,
  onAddSubTab,
  onOpenSubTabSortModal,
  scratchpadActive = false,
  onOpenScratchpad = () => undefined,
  onOpenContextMenuForScratchpad = () => undefined,
}: SubTabRailProps) {
  if (!isNoteWorkspaceView && !(viewMode === 'trash' && selectedTrashTab)) return null
  const subTabPlacementPosition =
    arrangeMode.active &&
    arrangeMode.dragItem?.type === 'subtab' &&
    arrangeMode.dragItem.parentTabId === activeTab.id
      ? arrangeMode.overSubTabInsert
      : null
  const subTabPlacementNeighborId = getPlacementNeighborId(
    activeTab.subTabs.map((subTab) => subTab.id),
    subTabPlacementPosition ? arrangeMode.overSubTabId : null,
    subTabPlacementPosition,
    arrangeMode.dragItem?.type === 'subtab' ? arrangeMode.dragItem.subTabId : draggingSubTabId,
  )

  return (
    <header
      className={`subtabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}
      role="tablist"
      aria-label="Nested note tabs"
    >
      <div ref={subTabRailRef} className="tabbar-scroll">
        {isNoteWorkspaceView && showParentHomeTab && (
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'main' && !scratchpadActive && !activeSubTabId}
            className={`btn btn-sm ${viewMode === 'main' && !scratchpadActive && !activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn home-subtab-btn ${arrangeableSubTabClassName} ${
              viewMode === 'stage-manager' && onGetStageManagerParentSelection(activeTab).mode === 'full'
                ? 'stage-manager-home-selected'
                : ''
            } ${arrangeMode.active ? 'is-arrange-fixed' : ''} ${
              arrangeMode.active &&
              arrangeMode.dragItem?.type === 'subtab' &&
              arrangeMode.dragItem.parentTabId === activeTab.id &&
              activeTab.subTabs[0] &&
              arrangeMode.overSubTabId === activeTab.subTabs[0].id &&
              arrangeMode.overSubTabInsert === 'before'
                ? 'is-arrange-home-target'
                : ''
            }`}
            onClick={() => {
              if (viewMode === 'stage-manager') {
                onStageManagerHomeClick()
                return
              }
              if (onConsumeArrangeClickSuppression(`home:${activeTab.id}`)) return
              onClearArrangeSelection()
              onSelectParentHomeTab()
            }}
            title={tooltipsDisabled ? undefined : 'home note'}
            onContextMenu={(event) => {
              if (viewMode !== 'main') return
              onOpenContextMenuForHomeTab(event, activeTab.id)
            }}
            onPointerDown={(event) => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              if (hasSelectionClickModifier(event)) {
                onClearArrangePressTimer()
                return
              }
              if (arrangeMode.active) {
                onStartArrangeTapCandidate({ key: `home:${activeTab.id}`, type: 'home' }, event)
                return
              }
              onStartArrangePress(event, null, `home:${activeTab.id}`)
            }}
            onPointerUp={(event) => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              if (arrangeMode.active) {
                onFinalizeArrangeTapCandidate(`home:${activeTab.id}`, event, () => {
                  onClearArrangeSelection()
                  onSelectParentHomeTab()
                })
                return
              }
              onClearArrangePressTimer()
            }}
            onPointerLeave={() => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              if (!arrangeMode.active) {
                onClearArrangePressTimer()
              }
            }}
            onPointerCancel={() => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              onClearArrangePressTimer()
              onClearArrangeTapCandidate()
            }}
          >
            {getHomeLabel()}
          </button>
        )}

        {isNoteWorkspaceView &&
          activeTab.subTabs.map((subTab) =>
            editing?.type === 'subtab' && editing.id === subTab.id ? (
              <input
                key={subTab.id}
                className="tab-rename-input"
                defaultValue={subTab.title}
                autoFocus
                onFocus={(event) => {
                  onRenameDraftChange('subtab', subTab.id, event.currentTarget.value)
                  onAutoSizeRenameInput(event.currentTarget)
                  event.currentTarget.select()
                }}
                onInput={(event) => {
                  onRenameDraftChange('subtab', subTab.id, event.currentTarget.value)
                  onAutoSizeRenameInput(event.currentTarget)
                }}
                onBlur={(event) => {
                  if (onShouldSkipRenameBlur('subtab', subTab.id)) {
                    onClearRenameDraft('subtab', subTab.id)
                    return
                  }
                  onCommitRename('subtab', subTab.id, event.target.value)
                }}
                onKeyDown={(event) => {
                  const action = getRenameInputKeyAction(event)
                  if (action === 'commit') {
                    event.preventDefault()
                    onCommitRename('subtab', subTab.id, event.currentTarget.value)
                  }
                  if (action === 'commit-and-create') {
                    event.preventDefault()
                    if (!tagFilterActive) onAddSubTab()
                  }
                  if (action === 'cancel') {
                    event.preventDefault()
                    onCancelRename('subtab', subTab.id)
                  }
                }}
              />
            ) : (
              (() => {
                const isArrangeBeforeNeighbor =
                  subTabPlacementNeighborId === subTab.id && subTabPlacementPosition === 'after'
                const isArrangeAfterNeighbor =
                  subTabPlacementNeighborId === subTab.id && subTabPlacementPosition === 'before'
                return (
                  <button
                    key={subTab.id}
                    data-arrange-subtab-id={subTab.id}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'main' && !scratchpadActive && subTab.id === activeSubTabId}
                    draggable={false}
                    className={`btn btn-sm ${viewMode === 'main' && !scratchpadActive && subTab.id === activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn ${arrangeableSubTabClassName} ${arrangeSelectedSubTabIds.has(subTab.id) ? 'is-arrange-selected' : ''} ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      arrangeMode.overSubTabId === subTab.id &&
                      arrangeMode.overSubTabInsert === 'before'
                        ? 'is-arrange-target-before'
                        : ''
                    } ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      arrangeMode.overSubTabId === subTab.id &&
                      arrangeMode.overSubTabInsert === 'after'
                        ? 'is-arrange-target-after'
                        : ''
                    } ${isArrangeBeforeNeighbor ? 'is-arrange-neighbor-before' : ''} ${
                      isArrangeAfterNeighbor ? 'is-arrange-neighbor-after' : ''
                    } ${draggingSubTabId === subTab.id ? 'is-dragging' : ''} ${
                      viewMode === 'stage-manager' && onGetStageManagerParentSelection(activeTab).selectedSubTabIds.includes(subTab.id)
                        ? 'stage-manager-subtab-selected'
                        : ''
                    }`}
                    onClick={(event) => {
                      const modifiers = getSelectionClickModifiers(event)
                      if (viewMode === 'stage-manager') {
                        onStageManagerSubTabClick(activeTab, subTab.id, modifiers)
                        return
                      }
                      if (onConsumeArrangeClickSuppression(`subtab:${subTab.id}`)) return
                      if (onHandleArrangeSubTabSelectionClick(activeTab.id, subTab.id, modifiers)) {
                        event.preventDefault()
                        return
                      }
                      onClearArrangeSelection()
                      onSelectSubTab(subTab.id)
                    }}
                    onDoubleClick={() => {
                      if (viewMode !== 'main' || arrangeMode.active) return
                      onBeginEdit({ type: 'subtab', id: subTab.id })
                    }}
                    onContextMenu={(event) => {
                      if (viewMode !== 'main') return
                      onOpenContextMenuForSubTab(event, activeTab.id, subTab.id)
                    }}
                    onPointerDown={(event) => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      if (hasSelectionClickModifier(event)) {
                        onClearArrangePressTimer()
                        return
                      }
                      if (event.button === 0) {
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }
                      onStartArrangeDragSeed(`subtab:${subTab.id}`, event)
                      if (arrangeMode.active) {
                        onStartArrangeTapCandidate({ key: `subtab:${subTab.id}`, type: 'subtab', subTabId: subTab.id }, event)
                        return
                      }
                      onStartArrangePress(
                        event,
                        { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                        `subtab:${subTab.id}`,
                      )
                    }}
                    onPointerMove={(event) => {
                      if (tagFilterActive) return
                      onHandleArrangeTabPointerMove(
                        event,
                        { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                        subTab.title,
                        'subtab',
                      )
                    }}
                    onPointerUp={(event) => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      onHandleArrangeTabPointerUp(event, `subtab:${subTab.id}`, () => {
                        onClearArrangeSelection()
                        onSelectSubTab(subTab.id)
                      })
                    }}
                    onPointerLeave={() => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      if (!arrangeMode.active) {
                        onClearArrangePressTimer()
                      }
                    }}
                    onPointerCancel={() => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      onCancelArrangeTabPointerDrag()
                    }}
                  >
                    {getSubTabLabel(subTab)}
                  </button>
                )
              })()
            ),
          )}

        {viewMode === 'trash' &&
          trashSubTabs.map((subTab) => (
            <button
              key={subTab.id}
              type="button"
              role="tab"
              aria-selected={subTab.id === selectedTrashSubTabId}
              className={`btn btn-sm tab-btn trash-subtab-btn ${subTab.id === selectedTrashSubTabId ? 'is-selected' : ''}`}
              onClick={() => onSetTrashSubTabId(subTab.id)}
              onContextMenu={(event) => {
                if (!selectedTrashTab) return
                onOpenContextMenuForTrashSubTab(event, selectedTrashTab, subTab.id)
              }}
            >
              {subTab.title}
            </button>
          ))}

        {!tagFilterActive && viewMode === 'main' && arrangeMode.active ? (
          <button
            type="button"
            className="tab-sort-btn"
            onClick={() => {
              if (arrangeControlsDisabled) return
              onOpenSubTabSortModal()
            }}
            title={tooltipsDisabled ? undefined : 'sort sub-tabs'}
            aria-label="sort sub-tabs"
            aria-disabled={arrangeControlsDisabled}
            disabled={arrangeControlsDisabled}
          >
            <SortIcon />
          </button>
        ) : !tagFilterActive && viewMode === 'main' && !arrangeMode.active ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-light add-tab-btn"
            onClick={onAddSubTab}
            title={tooltipsDisabled ? undefined : 'Add note tab'}
          >
            +
          </button>
        ) : null}

        {isNoteWorkspaceView && (
          <button
            type="button"
            role="tab"
            aria-selected={scratchpadActive}
            className={`btn btn-sm ${scratchpadActive ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn scratchpad-rail-btn ${
              scratchpadActive ? 'is-selected' : ''
            } ${scratchpadTagCountLabel ? 'has-tag-count' : ''}`}
            title={tooltipsDisabled ? undefined : 'scratchpad'}
            aria-label="scratchpad"
            onClick={onOpenScratchpad}
            onContextMenu={(event) => {
              if (viewMode !== 'main') return
              onOpenContextMenuForScratchpad(event)
            }}
          >
            <ScratchpadIcon />
            {scratchpadTagCountLabel ? (
              <span className="scratchpad-rail-tag-count" aria-hidden="true">
                ({scratchpadTagCountLabel})
              </span>
            ) : null}
          </button>
        )}
      </div>
    </header>
  )
}
