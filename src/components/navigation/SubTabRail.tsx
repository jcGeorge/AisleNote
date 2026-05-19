import type { MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  StageManagerParentSelection,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
} from '../../types/app'
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { SortIcon } from './SortIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type SubTabRailProps = {
  viewMode: ViewMode
  activeTab: Tab
  activeSubTabId: string | null
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  showParentHomeTab: boolean
  isNoteWorkspaceView: boolean
  selectedTrashTab: TrashParentBucket | null
  trashSubTabs: TrashParentBucket['subTabs']
  selectedTrashSubTabId: string | null
  subTabRailRef: RefObject<HTMLDivElement | null>
  arrangeableSubTabClassName: string
  draggingSubTabId: string | null
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onGetStageManagerParentSelection: (tab: Tab) => StageManagerParentSelection
  onStageManagerHomeClick: () => void
  onStageManagerSubTabClick: (tab: Tab, subTabId: string) => void
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
}

export function SubTabRail({
  viewMode,
  activeTab,
  activeSubTabId,
  editing,
  arrangeMode,
  showParentHomeTab,
  isNoteWorkspaceView,
  selectedTrashTab,
  trashSubTabs,
  selectedTrashSubTabId,
  subTabRailRef,
  arrangeableSubTabClassName,
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
}: SubTabRailProps) {
  if (!isNoteWorkspaceView && !(viewMode === 'trash' && selectedTrashTab)) return null

  return (
    <header
      className={`subtabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}
      role="tablist"
      aria-label="Nested note tabs"
    >
      <div ref={subTabRailRef} className="tabbar-scroll">
        {arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' && (
          <button type="button" className="tab-sort-btn" onClick={onOpenSubTabSortModal} title="sort sub-tabs" aria-label="sort sub-tabs">
            <SortIcon />
          </button>
        )}
        {isNoteWorkspaceView && showParentHomeTab && (
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'main' && !activeSubTabId}
            className={`btn btn-sm ${viewMode === 'main' && !activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn home-subtab-btn ${arrangeableSubTabClassName} ${
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
              onSelectParentHomeTab()
            }}
            title="home note"
            onContextMenu={(event) => {
              if (viewMode !== 'main') return
              onOpenContextMenuForHomeTab(event, activeTab.id)
            }}
            onPointerDown={(event) => {
              if (viewMode !== 'main') return
              if (arrangeMode.active) {
                onStartArrangeTapCandidate({ key: `home:${activeTab.id}`, type: 'home' }, event)
                return
              }
              onStartArrangePress(event, null, `home:${activeTab.id}`)
            }}
            onPointerUp={(event) => {
              if (viewMode !== 'main') return
              if (arrangeMode.active) {
                onFinalizeArrangeTapCandidate(`home:${activeTab.id}`, event, onSelectParentHomeTab)
                return
              }
              onClearArrangePressTimer()
            }}
            onPointerLeave={() => {
              if (viewMode !== 'main') return
              if (!arrangeMode.active) {
                onClearArrangePressTimer()
              }
            }}
            onPointerCancel={() => {
              if (viewMode !== 'main') return
              onClearArrangePressTimer()
              onClearArrangeTapCandidate()
            }}
          >
            home
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
                    onAddSubTab()
                  }
                  if (action === 'cancel') {
                    event.preventDefault()
                    onCancelRename('subtab', subTab.id)
                  }
                }}
              />
            ) : (
              <button
                key={subTab.id}
                data-arrange-subtab-id={subTab.id}
                type="button"
                role="tab"
                aria-selected={viewMode === 'main' && subTab.id === activeSubTabId}
                draggable={false}
                className={`btn btn-sm ${viewMode === 'main' && subTab.id === activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn ${arrangeableSubTabClassName} ${
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
                } ${draggingSubTabId === subTab.id ? 'is-dragging' : ''} ${
                  viewMode === 'stage-manager' && onGetStageManagerParentSelection(activeTab).selectedSubTabIds.includes(subTab.id)
                    ? 'stage-manager-subtab-selected'
                    : ''
                }`}
                onClick={() => {
                  if (viewMode === 'stage-manager') {
                    onStageManagerSubTabClick(activeTab, subTab.id)
                    return
                  }
                  if (onConsumeArrangeClickSuppression(`subtab:${subTab.id}`)) return
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
                  if (event.button === 0) {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }
                  onStartArrangeDragSeed(`subtab:${subTab.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `subtab:${subTab.id}`, type: 'subtab', subTabId: subTab.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id }, `subtab:${subTab.id}`)
                }}
                onPointerMove={(event) =>
                  onHandleArrangeTabPointerMove(
                    event,
                    { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                    subTab.title,
                    'subtab',
                  )
                }
                onPointerUp={(event) => {
                  if (viewMode !== 'main') return
                  onHandleArrangeTabPointerUp(event, `subtab:${subTab.id}`, () => onSelectSubTab(subTab.id))
                }}
                onPointerLeave={() => {
                  if (viewMode !== 'main') return
                  if (!arrangeMode.active) {
                    onClearArrangePressTimer()
                  }
                }}
                onPointerCancel={() => {
                  if (viewMode !== 'main') return
                  onCancelArrangeTabPointerDrag()
                }}
              >
                {subTab.title}
              </button>
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

        {viewMode === 'main' && !arrangeMode.active && (
          <button type="button" className="btn btn-sm btn-outline-light add-tab-btn" onClick={onAddSubTab} title="Add note tab">
            +
          </button>
        )}
      </div>
    </header>
  )
}
