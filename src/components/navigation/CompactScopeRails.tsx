import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  Domain,
  DomainArrangeDragPreview,
  Space,
  SpaceArrangeDragPreview,
  TrashDomainBucket,
  TrashSpaceBucket,
} from '../../types/app'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { SortIcon } from './SortIcon'
import { AppIcon } from '../icons/AppIcon'
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { ArrangePreviewStack } from './ArrangePreviewStack'
import { getArrangeDragPreviewRect, getArrangeDragPreviewStyleFromRect } from './arrange-drag-preview-style'
import { getArrangeRailContextMenuPolicy, getArrangeRailPointerDownAction } from './arrange-rail-events'
import { isTrashDomainSelectable, isTrashSpaceSelectable } from '../../trash/trash-selection'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'
type CommitRenameOptions = {
  focusEditor?: boolean
}
type NavigationContextMenuOptions = {
  force?: boolean
}

type CompactScopeDragPreviewProps =
  | { type: 'domain'; preview: DomainArrangeDragPreview; active: boolean }
  | { type: 'space'; preview: SpaceArrangeDragPreview; active: boolean }

export function CompactScopeDragPreview({ type, preview }: CompactScopeDragPreviewProps) {
  const kindClass = type === 'domain' ? 'compact-domain-btn is-domain' : 'compact-space-btn is-space'
  const cardClassName = `compact-scope-arrange-preview compact-scope-btn ${kindClass} is-active is-selected`
  const targetRect = getArrangeDragPreviewRect(preview)
  return (
    <ArrangeDragPreviewPortal>
      <ArrangePreviewStack
        cardClassName={cardClassName}
        dragCount={preview.dragCount}
        ghostItems={preview.ghostItems}
        style={getArrangeDragPreviewStyleFromRect(targetRect)}
        targetRect={targetRect}
      >
        <span>{preview.label}</span>
      </ArrangePreviewStack>
    </ArrangeDragPreviewPortal>
  )
}

type CompactSpaceRailProps = {
  spaces: Space[]
  activeSpaceId: string
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  arrangeableSpaceClassName: string
  draggingSpaceId: string | null
  spacesGridRef: RefObject<HTMLDivElement | null>
  controlsSlot?: ReactNode
  tooltipsDisabled?: boolean
  arrangeControlsDisabled?: boolean
  tagFilterActive?: boolean
  guidedDestinationActive?: boolean
  arrangeSelectedSpaceIds?: ReadonlySet<string>
  getSpaceLabel?: (space: Space) => ReactNode
  onOpenSpace: (spaceId: string) => void
  onHandleArrangeSpaceSelectionClick?: (
    spaceId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => boolean
  onClearArrangeSelection?: () => void
  onOpenContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    spaceId: string,
    options?: NavigationContextMenuOptions,
  ) => void
  onCancelArrangeMode?: () => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, value: string, options?: CommitRenameOptions) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onBeginEdit: (target: { type: EditableEntityType; id: string }) => void
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onAddSpace?: () => void
  onOpenSpaceSortModal?: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onHandleArrangeSpacePointerMove: (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => void
  onHandleArrangeSpacePointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    spaceId: string,
    onTapWhileArranging?: () => void,
  ) => void
  onClearArrangePressTimer: () => void
  onCancelArrangeSpacePointerDrag: () => void
}

type CompactDomainRailProps = {
  domains: Domain[]
  activeDomainId: string
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  arrangeableDomainClassName: string
  draggingDomainId: string | null
  domainsGridRef: RefObject<HTMLDivElement | null>
  controlsSlot?: ReactNode
  tooltipsDisabled?: boolean
  arrangeControlsDisabled?: boolean
  tagFilterActive?: boolean
  guidedDestinationActive?: boolean
  arrangeSelectedDomainIds?: ReadonlySet<string>
  getDomainLabel?: (domain: Domain) => ReactNode
  onOpenDomain: (domainId: string) => void
  onHandleArrangeDomainSelectionClick?: (
    domainId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => boolean
  onClearArrangeSelection?: () => void
  onOpenContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    domainId: string,
    options?: NavigationContextMenuOptions,
  ) => void
  onCancelArrangeMode?: () => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, value: string, options?: CommitRenameOptions) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onBeginEdit: (target: { type: EditableEntityType; id: string }) => void
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onAddDomain?: () => void
  onOpenDomainSortModal?: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onHandleArrangeDomainPointerMove: (event: ReactPointerEvent<HTMLButtonElement>, domain: Domain) => void
  onHandleArrangeDomainPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    domainId: string,
    onTapWhileArranging?: () => void,
  ) => void
  onClearArrangePressTimer: () => void
  onCancelArrangeDomainPointerDrag: () => void
}

export function CompactSpaceRail({
  spaces,
  activeSpaceId,
  editing,
  arrangeMode,
  arrangeableSpaceClassName,
  draggingSpaceId,
  spacesGridRef,
  controlsSlot,
  tooltipsDisabled = false,
  arrangeControlsDisabled = false,
  tagFilterActive = false,
  guidedDestinationActive = false,
  arrangeSelectedSpaceIds,
  getSpaceLabel = (space) => space.name,
  onOpenSpace,
  onHandleArrangeSpaceSelectionClick,
  onClearArrangeSelection,
  onOpenContextMenu,
  onCancelArrangeMode,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onBeginEdit,
  onAutoSizeRenameInput,
  onClearRenameDraft,
  onAddSpace,
  onOpenSpaceSortModal,
  onConsumeArrangeClickSuppression,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeSpacePointerMove,
  onHandleArrangeSpacePointerUp,
  onClearArrangePressTimer,
  onCancelArrangeSpacePointerDrag,
}: CompactSpaceRailProps) {
  const spacePlacementNeighborId = getPlacementNeighborId(
    spaces.map((space) => space.id),
    arrangeMode.overSpaceInsert ? arrangeMode.overSpaceId : null,
    arrangeMode.overSpaceInsert,
    arrangeMode.dragItem?.type === 'space' ? arrangeMode.dragItem.spaceId : draggingSpaceId,
  )

  return (
    <header className={`compact-scope-rail compact-space-rail ${arrangeMode.active ? 'is-arranging' : ''}`}>
      <div className="tabbar-row compact-scope-row">
        <div ref={spacesGridRef} className="compact-scope-scroll" role="tablist" aria-label="Spaces">
          {spaces.map((space) => {
            if (editing?.type === 'space' && editing.id === space.id) {
              return (
                <input
                  key={space.id}
                  className="tab-rename-input compact-scope-rename-input"
                  defaultValue={space.name}
                  autoFocus
                  onFocus={(event) => {
                    onRenameDraftChange('space', space.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                    event.currentTarget.select()
                  }}
                  onInput={(event) => {
                    onRenameDraftChange('space', space.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                  }}
                  onBlur={(event) => {
                    if (onShouldSkipRenameBlur('space', space.id)) {
                      onClearRenameDraft('space', space.id)
                      return
                    }
                    onCommitRename('space', space.id, event.target.value)
                  }}
                  onKeyDown={(event) => {
                    const action = getRenameInputKeyAction(event)
                    if (action === 'commit') {
                      event.preventDefault()
                      onCommitRename('space', space.id, event.currentTarget.value, { focusEditor: true })
                    }
                    if (action === 'commit-and-create') {
                      event.preventDefault()
                      if (!tagFilterActive && onAddSpace) {
                        onCommitRename('space', space.id, event.currentTarget.value)
                        onAddSpace()
                      }
                    }
                    if (action === 'cancel') {
                      event.preventDefault()
                      onCancelRename('space', space.id)
                    }
                  }}
                />
              )
            }
            const isArrangeSpaceTarget = arrangeMode.active && arrangeMode.overSpaceId === space.id
            const isArrangeSpaceBeforeTarget = isArrangeSpaceTarget && arrangeMode.overSpaceInsert === 'before'
            const isArrangeSpaceAfterTarget = isArrangeSpaceTarget && arrangeMode.overSpaceInsert === 'after'
            const isArrangeSpaceBeforeNeighbor =
              arrangeMode.active && spacePlacementNeighborId === space.id && arrangeMode.overSpaceInsert === 'after'
            const isArrangeSpaceAfterNeighbor =
              arrangeMode.active && spacePlacementNeighborId === space.id && arrangeMode.overSpaceInsert === 'before'
            const isArrangeSelected = arrangeSelectedSpaceIds?.has(space.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-space-btn',
              space.id === activeSpaceId ? 'is-active' : '',
              isArrangeSelected ? 'is-arrange-selected' : '',
              arrangeableSpaceClassName,
              isArrangeSpaceTarget ? 'is-arrange-target' : '',
              isArrangeSpaceBeforeTarget ? 'is-arrange-target-before' : '',
              isArrangeSpaceAfterTarget ? 'is-arrange-target-after' : '',
              isArrangeSpaceBeforeNeighbor ? 'is-arrange-neighbor-before' : '',
              isArrangeSpaceAfterNeighbor ? 'is-arrange-neighbor-after' : '',
              draggingSpaceId === space.id ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={space.id}
                type="button"
                data-arrange-space-id={space.id}
                draggable={false}
                aria-selected={space.id === activeSpaceId}
                className={buttonClassName}
                disabled={editing?.type === 'space' && editing.id === space.id}
                onClick={(event) => {
                  if (onConsumeArrangeClickSuppression(`space:${space.id}`)) {
                    event.stopPropagation()
                    return
                  }
                  if (guidedDestinationActive) {
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenSpace(space.id)
                    return
                  }
                  const modifiers = {
                    shiftKey: event.shiftKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                  }
                  if (onHandleArrangeSpaceSelectionClick?.(space.id, modifiers)) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }
                  onClearArrangeSelection?.()
                  onOpenSpace(space.id)
                }}
                onContextMenu={(event) => {
                  const contextPolicy = getArrangeRailContextMenuPolicy({
                    disabled: false,
                    arrangeActive: arrangeMode.active,
                  })
                  if (contextPolicy.action === 'ignore') {
                    event.preventDefault()
                    return
                  }
                  if (contextPolicy.cancelArrange) onCancelArrangeMode?.()
                  onOpenContextMenu(event, space.id, contextPolicy.forceMenu ? { force: true } : undefined)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active || tagFilterActive) return
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'space', id: space.id })
                }}
                onPointerDown={(event) => {
                  const pointerAction = getArrangeRailPointerDownAction({
                    button: event.button,
                    shiftKey: event.shiftKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    disabled: tagFilterActive || guidedDestinationActive,
                  })
                  if (pointerAction === 'ignore') return
                  if (pointerAction === 'clear-press-timer') {
                    onClearArrangePressTimer()
                    return
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                  onStartArrangeDragSeed(`space:${space.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `space:${space.id}`, type: 'space', spaceId: space.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'space', spaceId: space.id }, `space:${space.id}`)
                }}
                onPointerMove={(event) => {
                  if (!tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeSpacePointerMove(event, space)
                  }
                }}
                onPointerUp={(event) => {
                  if (!tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeSpacePointerUp(event, space.id, () => onOpenSpace(space.id))
                  }
                }}
                onPointerLeave={() => {
                  if (!tagFilterActive && !arrangeMode.active) onClearArrangePressTimer()
                }}
                onPointerCancel={() => {
                  if (!tagFilterActive) onCancelArrangeSpacePointerDrag()
                }}
              >
                {getSpaceLabel(space)}
              </button>
            )
          })}
          {!tagFilterActive && arrangeMode.active ? (
            <button
              type="button"
              className="tab-sort-btn compact-scope-sort-btn"
              onClick={() => {
                if (arrangeControlsDisabled) return
                onOpenSpaceSortModal?.()
              }}
              aria-label="sort spaces"
              data-app-tooltip={tooltipsDisabled ? undefined : 'sort spaces'}
              aria-disabled={arrangeControlsDisabled || !onOpenSpaceSortModal}
              disabled={arrangeControlsDisabled || !onOpenSpaceSortModal}
            >
              <SortIcon />
            </button>
          ) : !tagFilterActive && onAddSpace ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn compact-scope-add-btn"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onAddSpace()
              }}
              aria-label="add space"
              data-app-tooltip={tooltipsDisabled ? undefined : 'Add space'}
            >
              <AppIcon iconId="plus" className="add-tab-icon" />
            </button>
          ) : null}
        </div>
        {controlsSlot}
      </div>
    </header>
  )
}

export function CompactDomainRail({
  domains,
  activeDomainId,
  editing,
  arrangeMode,
  arrangeableDomainClassName,
  draggingDomainId,
  domainsGridRef,
  controlsSlot,
  tooltipsDisabled = false,
  arrangeControlsDisabled = false,
  tagFilterActive = false,
  guidedDestinationActive = false,
  arrangeSelectedDomainIds,
  getDomainLabel = (domain) => domain.name,
  onOpenDomain,
  onHandleArrangeDomainSelectionClick,
  onClearArrangeSelection,
  onOpenContextMenu,
  onCancelArrangeMode,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onBeginEdit,
  onAutoSizeRenameInput,
  onClearRenameDraft,
  onAddDomain,
  onOpenDomainSortModal,
  onConsumeArrangeClickSuppression,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeDomainPointerMove,
  onHandleArrangeDomainPointerUp,
  onClearArrangePressTimer,
  onCancelArrangeDomainPointerDrag,
}: CompactDomainRailProps) {
  const domainPlacementNeighborId = getPlacementNeighborId(
    domains.map((domain) => domain.id),
    arrangeMode.overDomainInsert ? arrangeMode.overDomainId : null,
    arrangeMode.overDomainInsert,
    arrangeMode.dragItem?.type === 'domain' ? arrangeMode.dragItem.domainId : draggingDomainId,
  )

  return (
    <header className={`compact-scope-rail compact-domain-rail ${arrangeMode.active ? 'is-arranging' : ''}`}>
      <div className="tabbar-row compact-scope-row">
        <div ref={domainsGridRef} className="compact-scope-scroll" role="tablist" aria-label="Domains">
          {domains.map((domain) => {
            if (editing?.type === 'domain' && editing.id === domain.id) {
              return (
                <input
                  key={domain.id}
                  className="tab-rename-input compact-scope-rename-input"
                  defaultValue={domain.name}
                  autoFocus
                  onFocus={(event) => {
                    onRenameDraftChange('domain', domain.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                    event.currentTarget.select()
                  }}
                  onInput={(event) => {
                    onRenameDraftChange('domain', domain.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                  }}
                  onBlur={(event) => {
                    if (onShouldSkipRenameBlur('domain', domain.id)) {
                      onClearRenameDraft('domain', domain.id)
                      return
                    }
                    onCommitRename('domain', domain.id, event.target.value)
                  }}
                  onKeyDown={(event) => {
                    const action = getRenameInputKeyAction(event)
                    if (action === 'commit') {
                      event.preventDefault()
                      onCommitRename('domain', domain.id, event.currentTarget.value, { focusEditor: true })
                    }
                    if (action === 'commit-and-create') {
                      event.preventDefault()
                      if (!tagFilterActive && onAddDomain) {
                        onCommitRename('domain', domain.id, event.currentTarget.value)
                        onAddDomain()
                      }
                    }
                    if (action === 'cancel') {
                      event.preventDefault()
                      onCancelRename('domain', domain.id)
                    }
                  }}
                />
              )
            }
            const isArrangeDomainTarget = arrangeMode.active && arrangeMode.overDomainId === domain.id
            const isArrangeDomainBeforeTarget = isArrangeDomainTarget && arrangeMode.overDomainInsert === 'before'
            const isArrangeDomainAfterTarget = isArrangeDomainTarget && arrangeMode.overDomainInsert === 'after'
            const isArrangeDomainBeforeNeighbor =
              arrangeMode.active && domainPlacementNeighborId === domain.id && arrangeMode.overDomainInsert === 'after'
            const isArrangeDomainAfterNeighbor =
              arrangeMode.active && domainPlacementNeighborId === domain.id && arrangeMode.overDomainInsert === 'before'
            const isArrangeSelected = arrangeSelectedDomainIds?.has(domain.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-domain-btn',
              domain.id === activeDomainId ? 'is-active' : '',
              isArrangeSelected ? 'is-arrange-selected' : '',
              arrangeableDomainClassName,
              isArrangeDomainTarget ? 'is-arrange-target' : '',
              isArrangeDomainBeforeTarget ? 'is-arrange-target-before' : '',
              isArrangeDomainAfterTarget ? 'is-arrange-target-after' : '',
              isArrangeDomainBeforeNeighbor ? 'is-arrange-neighbor-before' : '',
              isArrangeDomainAfterNeighbor ? 'is-arrange-neighbor-after' : '',
              draggingDomainId === domain.id ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={domain.id}
                type="button"
                data-arrange-domain-id={domain.id}
                draggable={false}
                aria-selected={domain.id === activeDomainId}
                className={buttonClassName}
                disabled={editing?.type === 'domain' && editing.id === domain.id}
                onClick={(event) => {
                  if (onConsumeArrangeClickSuppression(`domain:${domain.id}`)) {
                    event.stopPropagation()
                    return
                  }
                  if (guidedDestinationActive) {
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenDomain(domain.id)
                    return
                  }
                  const modifiers = {
                    shiftKey: event.shiftKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                  }
                  if (onHandleArrangeDomainSelectionClick?.(domain.id, modifiers)) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }
                  onClearArrangeSelection?.()
                  onOpenDomain(domain.id)
                }}
                onContextMenu={(event) => {
                  const contextPolicy = getArrangeRailContextMenuPolicy({
                    disabled: false,
                    arrangeActive: arrangeMode.active,
                  })
                  if (contextPolicy.action === 'ignore') {
                    event.preventDefault()
                    return
                  }
                  if (contextPolicy.cancelArrange) onCancelArrangeMode?.()
                  onOpenContextMenu(event, domain.id, contextPolicy.forceMenu ? { force: true } : undefined)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active || tagFilterActive) return
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'domain', id: domain.id })
                }}
                onPointerDown={(event) => {
                  const pointerAction = getArrangeRailPointerDownAction({
                    button: event.button,
                    shiftKey: event.shiftKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    disabled: tagFilterActive || guidedDestinationActive,
                  })
                  if (pointerAction === 'ignore') return
                  if (pointerAction === 'clear-press-timer') {
                    onClearArrangePressTimer()
                    return
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                  onStartArrangeDragSeed(`domain:${domain.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `domain:${domain.id}`, type: 'domain', domainId: domain.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'domain', domainId: domain.id }, `domain:${domain.id}`)
                }}
                onPointerMove={(event) => {
                  if (!tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeDomainPointerMove(event, domain)
                  }
                }}
                onPointerUp={(event) => {
                  if (!tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeDomainPointerUp(event, domain.id, () => onOpenDomain(domain.id))
                  }
                }}
                onPointerLeave={() => {
                  if (!tagFilterActive && !arrangeMode.active) onClearArrangePressTimer()
                }}
                onPointerCancel={() => {
                  if (!tagFilterActive) onCancelArrangeDomainPointerDrag()
                }}
              >
                {getDomainLabel(domain)}
              </button>
            )
          })}
          {!tagFilterActive && arrangeMode.active ? (
            <button
              type="button"
              className="tab-sort-btn compact-scope-sort-btn"
              onClick={() => {
                if (arrangeControlsDisabled) return
                onOpenDomainSortModal?.()
              }}
              aria-label="sort domains"
              data-app-tooltip={tooltipsDisabled ? undefined : 'sort domains'}
              aria-disabled={arrangeControlsDisabled || !onOpenDomainSortModal}
              disabled={arrangeControlsDisabled || !onOpenDomainSortModal}
            >
              <SortIcon />
            </button>
          ) : !tagFilterActive && onAddDomain ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn compact-scope-add-btn"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onAddDomain()
              }}
              aria-label="add domain"
              data-app-tooltip={tooltipsDisabled ? undefined : 'Add domain'}
            >
              <AppIcon iconId="plus" className="add-tab-icon" />
            </button>
          ) : null}
        </div>
        {controlsSlot}
      </div>
    </header>
  )
}

export function TrashDomainRail({
  domains,
  selectedDomainId,
  trashSelectedDomainIds,
  domainsGridRef,
  controlsSlot,
  onSelectDomain,
  onSelectDeletedDomain,
  onOpenDeletedDomainContextMenu,
  onDeletedDomainPointerDown,
  onDeletedDomainPointerMove,
  onDeletedDomainPointerUp,
  onDeletedDomainPointerCancel,
}: {
  domains: TrashDomainBucket[]
  selectedDomainId: string | null
  trashSelectedDomainIds?: ReadonlySet<string>
  domainsGridRef?: RefObject<HTMLDivElement | null>
  controlsSlot?: ReactNode
  onSelectDomain: (domainBucketId: string) => void
  onSelectDeletedDomain?: (
    event: MouseEvent<HTMLButtonElement>,
    domain: TrashDomainBucket,
    orderedIds: readonly string[],
  ) => boolean
  onOpenDeletedDomainContextMenu: (event: MouseEvent<HTMLButtonElement>, domain: TrashDomainBucket) => void
  onDeletedDomainPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, domain: TrashDomainBucket) => void
  onDeletedDomainPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDeletedDomainPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDeletedDomainPointerCancel?: () => void
}) {
  const selectableDomainIds = domains.filter(isTrashDomainSelectable).map((domain) => domain.id)
  return (
    <header className="compact-scope-rail compact-domain-rail trash-domain-rail">
      <div className="tabbar-row compact-scope-row">
        <div ref={domainsGridRef} className="compact-scope-scroll" role="tablist" aria-label="Trash domains">
          {domains.map((domain) => {
            const selectable = isTrashDomainSelectable(domain)
            return (
              <button
                key={domain.id}
                type="button"
                data-trash-domain-id={domain.id}
                aria-selected={domain.id === selectedDomainId}
                className={`compact-scope-btn compact-domain-btn trash-domain-btn ${
                  domain.id === selectedDomainId ? 'is-active' : ''
                } ${domain.source === 'deleted-domain' ? 'is-deleted' : ''} ${
                  selectable ? 'is-trash-selectable' : ''
                } ${trashSelectedDomainIds?.has(domain.id) ? 'is-trash-selected' : ''}`}
                onClick={(event) => {
                  if (selectable && onSelectDeletedDomain?.(event, domain, selectableDomainIds)) {
                    return
                  }
                  onSelectDomain(domain.id)
                }}
                onContextMenu={(event) => {
                  if (selectable) onOpenDeletedDomainContextMenu(event, domain)
                }}
                onPointerDown={(event) => {
                  if (selectable) onDeletedDomainPointerDown?.(event, domain)
                }}
                onPointerMove={onDeletedDomainPointerMove}
                onPointerUp={onDeletedDomainPointerUp}
                onPointerCancel={onDeletedDomainPointerCancel}
              >
                {domain.title}
              </button>
            )
          })}
        </div>
        {controlsSlot}
      </div>
    </header>
  )
}

export function TrashSpaceRail({
  spaces,
  selectedSpaceId,
  trashSelectedSpaceIds,
  spacesGridRef,
  onSelectSpace,
  onSelectDeletedSpace,
  onOpenDeletedSpaceContextMenu,
  onDeletedSpacePointerDown,
  onDeletedSpacePointerMove,
  onDeletedSpacePointerUp,
  onDeletedSpacePointerCancel,
}: {
  spaces: TrashSpaceBucket[]
  selectedSpaceId: string | null
  trashSelectedSpaceIds?: ReadonlySet<string>
  spacesGridRef?: RefObject<HTMLDivElement | null>
  onSelectSpace: (spaceBucketId: string) => void
  onSelectDeletedSpace?: (
    event: MouseEvent<HTMLButtonElement>,
    space: TrashSpaceBucket,
    orderedIds: readonly string[],
  ) => boolean
  onOpenDeletedSpaceContextMenu: (event: MouseEvent<HTMLButtonElement>, space: TrashSpaceBucket) => void
  onDeletedSpacePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, space: TrashSpaceBucket) => void
  onDeletedSpacePointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDeletedSpacePointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDeletedSpacePointerCancel?: () => void
}) {
  const selectableSpaceIds = spaces.filter(isTrashSpaceSelectable).map((space) => space.id)
  return (
    <header className="compact-scope-rail compact-space-rail trash-space-rail">
      <div className="tabbar-row compact-scope-row">
        <div ref={spacesGridRef} className="compact-scope-scroll" role="tablist" aria-label="Trash spaces">
          {spaces.map((space) => {
            const selectable = isTrashSpaceSelectable(space)
            return (
              <button
                key={space.id}
                type="button"
                data-trash-space-id={space.id}
                aria-selected={space.id === selectedSpaceId}
                className={`compact-scope-btn compact-space-btn trash-space-btn ${
                  space.id === selectedSpaceId ? 'is-active' : ''
                } ${space.source !== 'live' ? 'is-deleted' : ''} ${
                  selectable ? 'is-trash-selectable' : ''
                } ${trashSelectedSpaceIds?.has(space.id) ? 'is-trash-selected' : ''}`}
                onClick={(event) => {
                  if (selectable && onSelectDeletedSpace?.(event, space, selectableSpaceIds)) return
                  onSelectSpace(space.id)
                }}
                onContextMenu={(event) => {
                  if (selectable) onOpenDeletedSpaceContextMenu(event, space)
                }}
                onPointerDown={(event) => {
                  if (selectable) onDeletedSpacePointerDown?.(event, space)
                }}
                onPointerMove={onDeletedSpacePointerMove}
                onPointerUp={onDeletedSpacePointerUp}
                onPointerCancel={onDeletedSpacePointerCancel}
              >
                {space.title}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
