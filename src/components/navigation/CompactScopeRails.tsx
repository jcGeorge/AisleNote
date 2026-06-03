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
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { ArrangePreviewStack } from './ArrangePreviewStack'
import { getArrangeDragPreviewRect, getArrangeDragPreviewStyleFromRect } from './arrange-drag-preview-style'

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
        ghostOrigins={preview.ghostOrigins}
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
  stageManagerMode?: boolean
  stageManagerSelectedSpaceIds?: ReadonlySet<string>
  arrangeSelectedSpaceIds?: ReadonlySet<string>
  getSpaceLabel?: (space: Space) => ReactNode
  onOpenSpace: (spaceId: string) => void
  onHandleArrangeSpaceSelectionClick?: (
    spaceId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => boolean
  onStageManagerSpaceClick?: (
    spaceId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
  onStageManagerSpaceDoubleClick?: (spaceId: string) => void
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
  stageManagerMode?: boolean
  stageManagerSelectedDomainIds?: ReadonlySet<string>
  arrangeSelectedDomainIds?: ReadonlySet<string>
  getDomainLabel?: (domain: Domain) => ReactNode
  onOpenDomain: (domainId: string) => void
  onHandleArrangeDomainSelectionClick?: (
    domainId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => boolean
  onStageManagerDomainClick?: (
    domainId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
  onStageManagerDomainDoubleClick?: (domainId: string) => void
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
  stageManagerMode = false,
  stageManagerSelectedSpaceIds,
  arrangeSelectedSpaceIds,
  getSpaceLabel = (space) => space.name,
  onOpenSpace,
  onHandleArrangeSpaceSelectionClick,
  onStageManagerSpaceClick,
  onStageManagerSpaceDoubleClick,
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
            const isStageManagerSelected = stageManagerSelectedSpaceIds?.has(space.id) ?? false
            const isArrangeSelected = arrangeSelectedSpaceIds?.has(space.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-space-btn',
              space.id === activeSpaceId ? 'is-active' : '',
              isStageManagerSelected ? 'stage-manager-space-selected' : '',
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
                  if (stageManagerMode && onStageManagerSpaceClick) {
                    event.stopPropagation()
                    onStageManagerSpaceClick(space.id, {
                      shiftKey: event.shiftKey,
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                    })
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
                  if (stageManagerMode) {
                    event.preventDefault()
                    return
                  }
                  const forceMenu = arrangeMode.active
                  if (forceMenu) onCancelArrangeMode?.()
                  onOpenContextMenu(event, space.id, forceMenu ? { force: true } : undefined)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active) return
                  if (stageManagerMode) {
                    event.preventDefault()
                    event.stopPropagation()
                    onStageManagerSpaceDoubleClick?.(space.id)
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'space', id: space.id })
                }}
                onPointerDown={(event) => {
                  if (stageManagerMode) return
                  if (tagFilterActive) return
                  if (guidedDestinationActive) return
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  onStartArrangeDragSeed(`space:${space.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `space:${space.id}`, type: 'space', spaceId: space.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'space', spaceId: space.id }, `space:${space.id}`)
                }}
                onPointerMove={(event) => {
                  if (!stageManagerMode && !tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeSpacePointerMove(event, space)
                  }
                }}
                onPointerUp={(event) => {
                  if (!stageManagerMode && !tagFilterActive && !guidedDestinationActive) {
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
              title={tooltipsDisabled ? undefined : 'sort spaces'}
              aria-label="sort spaces"
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
              title={tooltipsDisabled ? undefined : 'Add space'}
              aria-label="add space"
            >
              +
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
  stageManagerMode = false,
  stageManagerSelectedDomainIds,
  arrangeSelectedDomainIds,
  getDomainLabel = (domain) => domain.name,
  onOpenDomain,
  onHandleArrangeDomainSelectionClick,
  onStageManagerDomainClick,
  onStageManagerDomainDoubleClick,
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
            const isStageManagerSelected = stageManagerSelectedDomainIds?.has(domain.id) ?? false
            const isArrangeSelected = arrangeSelectedDomainIds?.has(domain.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-domain-btn',
              domain.id === activeDomainId ? 'is-active' : '',
              isStageManagerSelected ? 'stage-manager-domain-selected' : '',
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
                  if (stageManagerMode && onStageManagerDomainClick) {
                    event.stopPropagation()
                    onStageManagerDomainClick(domain.id, {
                      shiftKey: event.shiftKey,
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                    })
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
                  if (stageManagerMode) {
                    event.preventDefault()
                    return
                  }
                  const forceMenu = arrangeMode.active
                  if (forceMenu) onCancelArrangeMode?.()
                  onOpenContextMenu(event, domain.id, forceMenu ? { force: true } : undefined)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active) return
                  if (stageManagerMode) {
                    event.preventDefault()
                    event.stopPropagation()
                    onStageManagerDomainDoubleClick?.(domain.id)
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'domain', id: domain.id })
                }}
                onPointerDown={(event) => {
                  if (stageManagerMode) return
                  if (tagFilterActive) return
                  if (guidedDestinationActive) return
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  onStartArrangeDragSeed(`domain:${domain.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `domain:${domain.id}`, type: 'domain', domainId: domain.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'domain', domainId: domain.id }, `domain:${domain.id}`)
                }}
                onPointerMove={(event) => {
                  if (!stageManagerMode && !tagFilterActive && !guidedDestinationActive) {
                    onHandleArrangeDomainPointerMove(event, domain)
                  }
                }}
                onPointerUp={(event) => {
                  if (!stageManagerMode && !tagFilterActive && !guidedDestinationActive) {
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
              title={tooltipsDisabled ? undefined : 'sort domains'}
              aria-label="sort domains"
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
              title={tooltipsDisabled ? undefined : 'Add domain'}
              aria-label="add domain"
            >
              +
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
  controlsSlot,
  onSelectDomain,
  onOpenDeletedDomainContextMenu,
}: {
  domains: TrashDomainBucket[]
  selectedDomainId: string | null
  controlsSlot?: ReactNode
  onSelectDomain: (domainBucketId: string) => void
  onOpenDeletedDomainContextMenu: (event: MouseEvent<HTMLButtonElement>, domain: TrashDomainBucket) => void
}) {
  return (
    <header className="compact-scope-rail compact-domain-rail trash-domain-rail">
      <div className="tabbar-row compact-scope-row">
        <div className="compact-scope-scroll" role="tablist" aria-label="Trash domains">
          {domains.map((domain) => (
            <button
              key={domain.id}
              type="button"
              aria-selected={domain.id === selectedDomainId}
              className={`compact-scope-btn compact-domain-btn trash-domain-btn ${
                domain.id === selectedDomainId ? 'is-active' : ''
              } ${domain.source === 'deleted-domain' ? 'is-deleted' : ''}`}
              onClick={() => onSelectDomain(domain.id)}
              onContextMenu={(event) => {
                if (domain.source === 'deleted-domain') onOpenDeletedDomainContextMenu(event, domain)
              }}
            >
              {domain.title}
            </button>
          ))}
        </div>
        {controlsSlot}
      </div>
    </header>
  )
}

export function TrashSpaceRail({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onOpenDeletedSpaceContextMenu,
}: {
  spaces: TrashSpaceBucket[]
  selectedSpaceId: string | null
  onSelectSpace: (spaceBucketId: string) => void
  onOpenDeletedSpaceContextMenu: (event: MouseEvent<HTMLButtonElement>, space: TrashSpaceBucket) => void
}) {
  return (
    <header className="compact-scope-rail compact-space-rail trash-space-rail">
      <div className="tabbar-row compact-scope-row">
        <div className="compact-scope-scroll" role="tablist" aria-label="Trash spaces">
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              aria-selected={space.id === selectedSpaceId}
              className={`compact-scope-btn compact-space-btn trash-space-btn ${
                space.id === selectedSpaceId ? 'is-active' : ''
              } ${space.source !== 'live' ? 'is-deleted' : ''}`}
              onClick={() => onSelectSpace(space.id)}
              onContextMenu={(event) => {
                if (space.source !== 'live') onOpenDeletedSpaceContextMenu(event, space)
              }}
            >
              {space.title}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
