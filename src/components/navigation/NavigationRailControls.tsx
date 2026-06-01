import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ViewMode } from '../../types/app'

export type NavigationRailAction = {
  key: string
  label: string
  visibleLabel?: string
  sizeLabel?: string
  selected: boolean
  className: string
  buttonRef?: RefObject<HTMLButtonElement | null>
  onClick: () => void
}

type NavigationRailControlsProps = {
  actions: NavigationRailAction[]
  menuOpen: boolean
  showCloseControl: boolean
  viewMode: ViewMode
  spaceRailVisible: boolean
  domainRailVisible: boolean
  onCloseAction: () => void
  onSetMenuOpen: Dispatch<SetStateAction<boolean>>
  onToggleSpaceRail: () => void
  onToggleDomainRail: () => void
  onOpenStageManager: () => void
  onToggleTrash: () => void
  onOpenMessages: () => void
  onOpenSettings: () => void
  messagesCount?: number
}

export function NavigationRailControls({
  actions,
  menuOpen,
  showCloseControl,
  viewMode,
  spaceRailVisible,
  domainRailVisible,
  onCloseAction,
  onSetMenuOpen,
  onToggleSpaceRail,
  onToggleDomainRail,
  onOpenStageManager,
  onToggleTrash,
  onOpenMessages,
  onOpenSettings,
  messagesCount = 0,
}: NavigationRailControlsProps) {
  return (
    <div className="tabbar-controls">
      {actions.length > 0 && (
        <div className="topbar-actions" role="group" aria-label="Top bar actions">
          {actions.map((action) => (
            <button
              key={action.key}
              ref={action.buttonRef}
              type="button"
              aria-pressed={action.selected}
              className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
              onClick={action.onClick}
            >
              {action.sizeLabel ? (
                <>
                  <span className="topbar-action-size-label" aria-hidden="true">
                    {action.sizeLabel}
                  </span>
                  <span className="topbar-action-visible-label">{action.visibleLabel ?? action.label}</span>
                </>
              ) : (
                action.label
              )}
            </button>
          ))}
        </div>
      )}

      <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={`menu-btn ${showCloseControl ? 'is-close' : ''}`}
          onClick={() => {
            if (showCloseControl) {
              onCloseAction()
              return
            }
            onSetMenuOpen((open) => !open)
          }}
          aria-label={showCloseControl ? 'Close' : 'Menu'}
        >
          <span className="menu-btn-line" />
          <span className="menu-btn-line" />
        </button>
        {!showCloseControl && menuOpen && (
          <div className="menu-dropdown">
            <button type="button" className="menu-item" onClick={onToggleSpaceRail}>
              {spaceRailVisible ? 'hide' : 'show'} space
            </button>
            <button type="button" className="menu-item" onClick={onToggleDomainRail}>
              {domainRailVisible ? 'hide' : 'show'} domain
            </button>
            {viewMode === 'main' && (
              <button type="button" className="menu-item" onClick={onOpenStageManager}>
                director
              </button>
            )}
            <button type="button" className="menu-item" onClick={onToggleTrash}>
              {viewMode === 'trash' ? 'tabs' : 'trash'}
            </button>
            <button type="button" className="menu-item" onClick={onOpenMessages}>
              messages{messagesCount > 0 ? ` (${messagesCount})` : ''}
            </button>
            <button type="button" className="menu-item" onClick={onOpenSettings}>
              settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
