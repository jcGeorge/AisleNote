import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { UserFacingEditorRenderer } from '../../editor/editor-core'
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
  onOpenEtCetera: () => void
  onOpenFilter: () => void
  selectedRenderer?: UserFacingEditorRenderer
  onSelectRenderer?: (renderer: UserFacingEditorRenderer) => void
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
  onOpenEtCetera,
  onOpenFilter,
  selectedRenderer,
  onSelectRenderer,
  tagFilterControl,
}: NavigationRailControlsProps) {
  const trashExitControlActive = viewMode === 'trash' && !showCloseControl
  const closeControlActive = showCloseControl || trashExitControlActive
  const menuButtonLabel = showCloseControl ? 'Close' : trashExitControlActive ? 'tabs' : 'Menu'
  const rendererControlsVisible = Boolean(selectedRenderer && onSelectRenderer)

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
          className={`menu-btn ${closeControlActive ? 'is-close' : ''}`}
          onClick={() => {
            if (showCloseControl) {
              onCloseAction()
              return
            }
            if (trashExitControlActive) {
              onToggleTrash()
              return
            }
            onSetMenuOpen((open) => !open)
          }}
          aria-label={menuButtonLabel}
          data-app-tooltip={menuButtonLabel}
        >
          <span className="menu-btn-line" />
          <span className="menu-btn-line" />
        </button>
        {!closeControlActive && menuOpen && (
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
            <button type="button" className="menu-item" onClick={onOpenEtCetera}>
              et cetera
            </button>
            {rendererControlsVisible && selectedRenderer && onSelectRenderer && (
              <div className="menu-section menu-renderer-section" role="group" aria-label="renderer">
                <div className="menu-section-label">renderer</div>
                <button
                  type="button"
                  className={`menu-item menu-renderer-item ${selectedRenderer === 'toast' ? 'is-selected' : ''}`}
                  aria-pressed={selectedRenderer === 'toast'}
                  onClick={() => onSelectRenderer('toast')}
                >
                  Toast
                </button>
                <button
                  type="button"
                  className={`menu-item menu-renderer-item ${selectedRenderer === 'codemirror' ? 'is-selected' : ''}`}
                  aria-pressed={selectedRenderer === 'codemirror'}
                  onClick={() => onSelectRenderer('codemirror')}
                >
                  CodeMirror
                </button>
                <div className="menu-section-help">reloads on change</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
