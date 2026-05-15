import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  Space,
  SpaceArrangeDragPreview,
} from '../../types/app'

type SpacesPageProps = {
  spaces: Space[]
  activeSpaceId: string
  editingSpaceId: string | null
  arrangeMode: ArrangeModeState
  arrangeableSpaceClassName: string
  draggingSpaceId: string | null
  spaceArrangeDragPreview: SpaceArrangeDragPreview | null
  spacesGridRef: RefObject<HTMLDivElement | null>
  onBackgroundClick: () => void
  onOpenDomains: () => void
  onOpenSpace: (spaceId: string) => void
  onAddSpace: () => void
  onExitArrangeMode: () => void
  onCommitRename: (spaceId: string, name: string) => void
  onCancelRename: (spaceId: string) => void
  onShouldSkipRenameBlur: (spaceId: string) => boolean
  onRenameDraftChange: (spaceId: string, value: string) => void
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, spaceId: string) => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onHandleArrangeSpacePointerMove: (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => void
  onHandleArrangeSpacePointerUp: (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string) => void
  onClearArrangePressTimer: () => void
  onCancelArrangeSpacePointerDrag: () => void
}

export function SpacesPage({
  spaces,
  activeSpaceId,
  editingSpaceId,
  arrangeMode,
  arrangeableSpaceClassName,
  draggingSpaceId,
  spaceArrangeDragPreview,
  spacesGridRef,
  onBackgroundClick,
  onOpenDomains,
  onOpenSpace,
  onAddSpace,
  onExitArrangeMode,
  onCommitRename,
  onCancelRename,
  onShouldSkipRenameBlur,
  onRenameDraftChange,
  onOpenContextMenu,
  onConsumeArrangeClickSuppression,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeSpacePointerMove,
  onHandleArrangeSpacePointerUp,
  onClearArrangePressTimer,
  onCancelArrangeSpacePointerDrag,
}: SpacesPageProps) {
  const isArrangingSpaces = arrangeMode.active && arrangeMode.scope === 'spaces'

  return (
    <section className="spaces-grid-wrap spaces-page-wrap" onClick={onBackgroundClick}>
      <button
        type="button"
        className="spaces-domain-up-btn"
        onClick={(event) => {
          event.stopPropagation()
          onOpenDomains()
        }}
        aria-label="Open domains"
      >
        <span className="spaces-domain-up-icon" aria-hidden="true">
          ↑
        </span>
        <span>domains</span>
      </button>
      <div ref={spacesGridRef} className={`spaces-grid ${isArrangingSpaces ? 'is-arranging' : ''}`}>
        {spaces.map((space) => {
          if (editingSpaceId === space.id) {
            return (
              <input
                key={space.id}
                className="space-rename-input"
                defaultValue={space.name}
                autoFocus
                onFocus={(event) => onRenameDraftChange(space.id, event.currentTarget.value)}
                onInput={(event) => onRenameDraftChange(space.id, event.currentTarget.value)}
                onBlur={(event) => {
                  if (onShouldSkipRenameBlur(space.id)) return
                  onCommitRename(space.id, event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onCommitRename(space.id, event.currentTarget.value)
                    onOpenSpace(space.id)
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelRename(space.id)
                  }
                }}
              />
            )
          }

          const isArrangeSpaceTarget =
            isArrangingSpaces && arrangeMode.dragItem?.type === 'space' && arrangeMode.overSpaceId === space.id
          const isArrangeSpaceBeforeTarget = isArrangeSpaceTarget && arrangeMode.overSpaceInsert === 'before'
          const isArrangeSpaceAfterTarget = isArrangeSpaceTarget && arrangeMode.overSpaceInsert === 'after'

          return (
            <button
              key={space.id}
              type="button"
              data-arrange-space-id={space.id}
              draggable={false}
              className={`space-card ${space.id === activeSpaceId ? 'is-active' : ''} ${arrangeableSpaceClassName} ${
                isArrangeSpaceTarget ? 'is-arrange-target' : ''
              } ${isArrangeSpaceBeforeTarget ? 'is-arrange-target-before' : ''} ${
                isArrangeSpaceAfterTarget ? 'is-arrange-target-after' : ''
              } ${draggingSpaceId === space.id ? 'is-dragging' : ''}`}
              onClick={(event) => {
                if (onConsumeArrangeClickSuppression(`space:${space.id}`)) {
                  event.stopPropagation()
                  return
                }
                if (isArrangingSpaces) {
                  event.stopPropagation()
                  onExitArrangeMode()
                  return
                }
                onOpenSpace(space.id)
              }}
              onContextMenu={(event) => onOpenContextMenu(event, space.id)}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
                onStartArrangeDragSeed(`space:${space.id}`, event)
                if (isArrangingSpaces) {
                  onStartArrangeTapCandidate({ key: `space:${space.id}`, type: 'space', spaceId: space.id }, event)
                  return
                }
                onStartArrangePress(event, { type: 'space', spaceId: space.id }, `space:${space.id}`)
              }}
              onPointerMove={(event) => onHandleArrangeSpacePointerMove(event, space)}
              onPointerUp={(event) => onHandleArrangeSpacePointerUp(event, space.id)}
              onPointerLeave={() => {
                if (!arrangeMode.active) {
                  onClearArrangePressTimer()
                }
              }}
              onPointerCancel={() => {
                onCancelArrangeSpacePointerDrag()
              }}
            >
              <span className="space-card-name">{space.name}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`space-card space-card-add ${isArrangingSpaces ? 'is-arrange-fixed' : ''}`}
          onClick={(event) => {
            if (isArrangingSpaces) {
              event.stopPropagation()
              onExitArrangeMode()
              return
            }
            onAddSpace()
          }}
          aria-label="Add space"
        >
          +
        </button>
      </div>
      {spaceArrangeDragPreview && (
        <div
          className="space-arrange-preview"
          style={{
            left: `${spaceArrangeDragPreview.currentX - spaceArrangeDragPreview.offsetX}px`,
            top: `${spaceArrangeDragPreview.currentY - spaceArrangeDragPreview.offsetY}px`,
            width: `${spaceArrangeDragPreview.width}px`,
            height: `${spaceArrangeDragPreview.height}px`,
          }}
        >
          <span className="space-card-name">{spaceArrangeDragPreview.label}</span>
        </div>
      )}
    </section>
  )
}
