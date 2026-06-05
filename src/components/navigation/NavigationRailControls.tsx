import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { ViewMode } from '../../types/app'

export type NavigationRailAction = {
  key: string
  label: string
  ariaLabel?: string
  icon?: ReactNode
  popover?: ReactNode
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
  onToggleTrash: () => void
  onOpenMessages: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onOpenFilter: () => void
  messagesCount?: number
  tagFilterControl?: ReactNode
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
  onToggleTrash,
  onOpenMessages,
  onOpenSettings,
  onOpenAbout,
  onOpenFilter,
  messagesCount = 0,
  tagFilterControl,
}: NavigationRailControlsProps) {
  return (
    <div className="tabbar-controls">
      {(actions.length > 0 || tagFilterControl) && (
        <div className="topbar-actions" role="group" aria-label="Top bar actions">
          {actions.map((action) => (
            <div key={action.key} className={`topbar-action-wrap topbar-action-wrap-${action.key}`}>
              <button
                ref={action.buttonRef}
                type="button"
                aria-label={action.ariaLabel}
                data-app-tooltip={action.ariaLabel ?? action.label}
                aria-pressed={action.selected}
                className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
                onClick={action.onClick}
              >
                {action.icon ? (
                  action.icon
                ) : action.sizeLabel ? (
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
              {action.popover}
            </div>
          ))}
          {tagFilterControl}
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
          data-app-tooltip={showCloseControl ? 'Close' : 'Menu'}
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
            <button type="button" className="menu-item" onClick={onToggleTrash}>
              {viewMode === 'trash' ? 'tabs' : 'trash'}
            </button>
            <button type="button" className="menu-item" onClick={onOpenFilter}>
              filter
            </button>
            <button type="button" className="menu-item" onClick={onOpenMessages}>
              messages{messagesCount > 0 ? ` (${messagesCount})` : ''}
            </button>
            <button type="button" className="menu-item" onClick={onOpenSettings}>
              settings
            </button>
            <button type="button" className="menu-item" onClick={onOpenAbout}>
              about
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
