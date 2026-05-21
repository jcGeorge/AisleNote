import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  Domain,
  DomainArrangeDragPreview,
} from '../../types/app'

type DomainsPageProps = {
  domains: Domain[]
  activeDomainId: string
  editingDomainId: string | null
  arrangeMode: ArrangeModeState
  arrangeableDomainClassName: string
  draggingDomainId: string | null
  domainArrangeDragPreview: DomainArrangeDragPreview | null
  domainsGridRef: RefObject<HTMLDivElement | null>
  onBackgroundClick: () => void
  onAddDomain: () => void
  onExitArrangeMode: () => void
  onOpenDomain: (domainId: string) => void
  onCommitRename: (domainId: string, name: string) => void
  onCancelRename: (domainId: string) => void
  onShouldSkipRenameBlur: (domainId: string) => boolean
  onRenameDraftChange: (domainId: string, value: string) => void
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, domainId: string) => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onHandleArrangeDomainPointerMove: (event: ReactPointerEvent<HTMLButtonElement>, domain: Domain) => void
  onHandleArrangeDomainPointerUp: (event: ReactPointerEvent<HTMLButtonElement>, domainId: string) => void
  onClearArrangePressTimer: () => void
  onCancelArrangeDomainPointerDrag: () => void
}

export function DomainsPage({
  domains,
  activeDomainId,
  editingDomainId,
  arrangeMode,
  arrangeableDomainClassName,
  draggingDomainId,
  domainArrangeDragPreview,
  domainsGridRef,
  onBackgroundClick,
  onAddDomain,
  onExitArrangeMode,
  onOpenDomain,
  onCommitRename,
  onCancelRename,
  onShouldSkipRenameBlur,
  onRenameDraftChange,
  onOpenContextMenu,
  onConsumeArrangeClickSuppression,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeDomainPointerMove,
  onHandleArrangeDomainPointerUp,
  onClearArrangePressTimer,
  onCancelArrangeDomainPointerDrag,
}: DomainsPageProps) {
  const isArrangingDomains = arrangeMode.active && arrangeMode.scope === 'domains'

  return (
    <section className="spaces-grid-wrap" onClick={onBackgroundClick}>
      <div ref={domainsGridRef} className={`spaces-grid ${isArrangingDomains ? 'is-arranging' : ''}`}>
        {domains.map((domain) => {
          if (editingDomainId === domain.id) {
            return (
              <input
                key={domain.id}
                className="space-rename-input"
                defaultValue={domain.name}
                autoFocus
                onFocus={(event) => onRenameDraftChange(domain.id, event.currentTarget.value)}
                onInput={(event) => onRenameDraftChange(domain.id, event.currentTarget.value)}
                onBlur={(event) => {
                  if (onShouldSkipRenameBlur(domain.id)) return
                  onCommitRename(domain.id, event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onCommitRename(domain.id, event.currentTarget.value)
                    onOpenDomain(domain.id)
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelRename(domain.id)
                  }
                }}
              />
            )
          }

          const isArrangeDomainTarget =
            isArrangingDomains && arrangeMode.dragItem?.type === 'domain' && arrangeMode.overDomainId === domain.id
          const isArrangeDomainBeforeTarget = isArrangeDomainTarget && arrangeMode.overDomainInsert === 'before'
          const isArrangeDomainAfterTarget = isArrangeDomainTarget && arrangeMode.overDomainInsert === 'after'

          return (
            <button
              key={domain.id}
              type="button"
              data-arrange-domain-id={domain.id}
              draggable={false}
              className={`space-card ${domain.id === activeDomainId ? 'is-active' : ''} ${arrangeableDomainClassName} ${
                isArrangeDomainTarget ? 'is-arrange-target' : ''
              } ${isArrangeDomainBeforeTarget ? 'is-arrange-target-before' : ''} ${
                isArrangeDomainAfterTarget ? 'is-arrange-target-after' : ''
              } ${draggingDomainId === domain.id ? 'is-dragging' : ''}`}
              onClick={(event) => {
                if (onConsumeArrangeClickSuppression(`domain:${domain.id}`)) {
                  event.stopPropagation()
                  return
                }
                if (isArrangingDomains) {
                  event.stopPropagation()
                  onExitArrangeMode()
                  return
                }
                onOpenDomain(domain.id)
              }}
              onContextMenu={(event) => onOpenContextMenu(event, domain.id)}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
                onStartArrangeDragSeed(`domain:${domain.id}`, event)
                if (isArrangingDomains) {
                  onStartArrangeTapCandidate({ key: `domain:${domain.id}`, type: 'domain', domainId: domain.id }, event)
                  return
                }
                onStartArrangePress(event, { type: 'domain', domainId: domain.id }, `domain:${domain.id}`)
              }}
              onPointerMove={(event) => onHandleArrangeDomainPointerMove(event, domain)}
              onPointerUp={(event) => onHandleArrangeDomainPointerUp(event, domain.id)}
              onPointerLeave={() => {
                if (!arrangeMode.active) {
                  onClearArrangePressTimer()
                }
              }}
              onPointerCancel={() => {
                onCancelArrangeDomainPointerDrag()
              }}
            >
              <span className="space-card-name">{domain.name}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`space-card space-card-add ${isArrangingDomains ? 'is-arrange-fixed' : ''}`}
          onClick={(event) => {
            if (isArrangingDomains) {
              event.stopPropagation()
              onExitArrangeMode()
              return
            }
            onAddDomain()
          }}
          aria-label="Add domain"
        >
          +
        </button>
      </div>
      {domainArrangeDragPreview && (
        <div
          className="space-arrange-preview"
          style={{
            left: `${domainArrangeDragPreview.currentX - domainArrangeDragPreview.offsetX}px`,
            top: `${domainArrangeDragPreview.currentY - domainArrangeDragPreview.offsetY}px`,
            width: `${domainArrangeDragPreview.width}px`,
            height: `${domainArrangeDragPreview.height}px`,
          }}
        >
          <span className="space-card-name">{domainArrangeDragPreview.label}</span>
        </div>
      )}
    </section>
  )
}
