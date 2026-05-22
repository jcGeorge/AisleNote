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
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { SortIcon } from './SortIcon'
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { getArrangeDragPreviewStyle } from './arrange-drag-preview-style'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type CompactScopeDragPreviewProps =
  | { type: 'domain'; preview: DomainArrangeDragPreview; active: boolean }
  | { type: 'space'; preview: SpaceArrangeDragPreview; active: boolean }

export function CompactScopeDragPreview({ type, preview, active }: CompactScopeDragPreviewProps) {
  const kindClass = type === 'domain' ? 'compact-domain-btn is-domain' : 'compact-space-btn is-space'
  return (
    <ArrangeDragPreviewPortal>
      <div
        className={`compact-scope-arrange-preview compact-scope-btn ${kindClass} ${active ? 'is-active' : ''}`}
        style={getArrangeDragPreviewStyle(preview)}
      >
        <span>{preview.label}</span>
      </div>
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
  stageManagerMode?: boolean
  stageManagerSelectedSpaceIds?: ReadonlySet<string>
  onOpenSpace: (spaceId: string) => void
  onStageManagerSpaceClick?: (
    spaceId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, spaceId: string) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, value: string) => void
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
  stageManagerMode?: boolean
  stageManagerSelectedDomainIds?: ReadonlySet<string>
  onOpenDomain: (domainId: string) => void
  onStageManagerDomainClick?: (
    domainId: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, domainId: string) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, value: string) => void
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
  stageManagerMode = false,
  stageManagerSelectedSpaceIds,
  onOpenSpace,
  onStageManagerSpaceClick,
  onOpenContextMenu,
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
                      onCommitRename('space', space.id, event.currentTarget.value)
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
            const isStageManagerSelected = stageManagerSelectedSpaceIds?.has(space.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-space-btn',
              space.id === activeSpaceId ? 'is-active' : '',
              isStageManagerSelected ? 'stage-manager-space-selected' : '',
              arrangeableSpaceClassName,
              isArrangeSpaceTarget ? 'is-arrange-target' : '',
              isArrangeSpaceBeforeTarget ? 'is-arrange-target-before' : '',
              isArrangeSpaceAfterTarget ? 'is-arrange-target-after' : '',
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
                  onOpenSpace(space.id)
                }}
                onContextMenu={(event) => {
                  if (stageManagerMode) {
                    event.preventDefault()
                    return
                  }
                  onOpenContextMenu(event, space.id)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active) return
                  if (stageManagerMode) return
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'space', id: space.id })
                }}
                onPointerDown={(event) => {
                  if (stageManagerMode) return
                  if (event.button === 0) {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }
                  onStartArrangeDragSeed(`space:${space.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `space:${space.id}`, type: 'space', spaceId: space.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'space', spaceId: space.id }, `space:${space.id}`)
                }}
                onPointerMove={(event) => {
                  if (!stageManagerMode) onHandleArrangeSpacePointerMove(event, space)
                }}
                onPointerUp={(event) => {
                  if (!stageManagerMode) onHandleArrangeSpacePointerUp(event, space.id, () => onOpenSpace(space.id))
                }}
                onPointerLeave={() => {
                  if (!arrangeMode.active) onClearArrangePressTimer()
                }}
                onPointerCancel={onCancelArrangeSpacePointerDrag}
              >
                {space.name}
              </button>
            )
          })}
          {arrangeMode.active ? (
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
          ) : onAddSpace ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn compact-scope-add-btn"
              onClick={onAddSpace}
              title={tooltipsDisabled ? undefined : 'Add space'}
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
  stageManagerMode = false,
  stageManagerSelectedDomainIds,
  onOpenDomain,
  onStageManagerDomainClick,
  onOpenContextMenu,
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
                      onCommitRename('domain', domain.id, event.currentTarget.value)
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
            const isStageManagerSelected = stageManagerSelectedDomainIds?.has(domain.id) ?? false
            const buttonClassName = [
              'compact-scope-btn',
              'compact-domain-btn',
              domain.id === activeDomainId ? 'is-active' : '',
              isStageManagerSelected ? 'stage-manager-domain-selected' : '',
              arrangeableDomainClassName,
              isArrangeDomainTarget ? 'is-arrange-target' : '',
              isArrangeDomainBeforeTarget ? 'is-arrange-target-before' : '',
              isArrangeDomainAfterTarget ? 'is-arrange-target-after' : '',
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
                  onOpenDomain(domain.id)
                }}
                onContextMenu={(event) => {
                  if (stageManagerMode) {
                    event.preventDefault()
                    return
                  }
                  onOpenContextMenu(event, domain.id)
                }}
                onDoubleClick={(event) => {
                  if (arrangeMode.active) return
                  if (stageManagerMode) return
                  event.preventDefault()
                  event.stopPropagation()
                  onBeginEdit({ type: 'domain', id: domain.id })
                }}
                onPointerDown={(event) => {
                  if (stageManagerMode) return
                  if (event.button === 0) {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }
                  onStartArrangeDragSeed(`domain:${domain.id}`, event)
                  if (arrangeMode.active) {
                    onStartArrangeTapCandidate({ key: `domain:${domain.id}`, type: 'domain', domainId: domain.id }, event)
                    return
                  }
                  onStartArrangePress(event, { type: 'domain', domainId: domain.id }, `domain:${domain.id}`)
                }}
                onPointerMove={(event) => {
                  if (!stageManagerMode) onHandleArrangeDomainPointerMove(event, domain)
                }}
                onPointerUp={(event) => {
                  if (!stageManagerMode) onHandleArrangeDomainPointerUp(event, domain.id, () => onOpenDomain(domain.id))
                }}
                onPointerLeave={() => {
                  if (!arrangeMode.active) onClearArrangePressTimer()
                }}
                onPointerCancel={onCancelArrangeDomainPointerDrag}
              >
                {domain.name}
              </button>
            )
          })}
          {arrangeMode.active ? (
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
          ) : onAddDomain ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn compact-scope-add-btn"
              onClick={onAddDomain}
              title={tooltipsDisabled ? undefined : 'Add domain'}
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
