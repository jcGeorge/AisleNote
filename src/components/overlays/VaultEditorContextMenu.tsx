import React, { type ReactNode } from 'react'
import type { LinkPromptState } from '../../types/app'
import {
  clampContextMenuPosition,
  getSubmenuPosition,
  type MenuPosition,
  type MenuRect,
  type MenuSize,
  type MenuViewport,
} from './context-menu-position'

export type VaultEditorContextMenuState = {
  x: number
  y: number
  aisleId: string
  linkPrompt?: LinkPromptState | null
}

export type VaultEditorClipboardAction = 'cut' | 'copy' | 'paste' | 'pastePlainText'
export type VaultEditorPasteDestination = 'here' | 'new-aisle-left' | 'new-aisle-right'
export type VaultEditorAisleInsertSide = 'left' | 'right'
export type VaultEditorCopyAsKind = 'note' | 'aisle'
export type VaultEditorCopyAsMode = 'independent' | 'synced'

const VAULT_CONTEXT_MENU_IGNORE_SELECTOR = [
  '.note-shared-toolbar',
  '.note-toolbar-copy-popover',
  '.note-toolbar-heading-popover',
  '.tab-context-menu',
  'td',
  'th',
  '[data-note-workspace-skip-aisle-activation="true"]',
].join(',')

function getViewportSize(): MenuViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getElementSize(element: HTMLElement): MenuSize {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
}

function toMenuRect(rect: DOMRect): MenuRect {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function getVaultEditorContextMenuAisleIdFromTarget(target: Element | null): string | null {
  if (!target || target.closest(VAULT_CONTEXT_MENU_IGNORE_SELECTOR)) return null
  const pane = target.closest<HTMLElement>('.note-aisle-pane')
  return pane?.dataset.aisleId?.trim() || null
}

function MenuButton({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`tab-context-delete ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MenuSeparator() {
  return <div className="tab-context-separator" role="separator" />
}

function SubMenu({
  label,
  children,
  onClick,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
}) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = React.useState<MenuPosition>({ left: -9999, top: -9999 })

  const updatePanelPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    setPanelPosition(
      getSubmenuPosition(
        toMenuRect(trigger.getBoundingClientRect()),
        getElementSize(panel),
        getViewportSize(),
      ),
    )
  }, [])

  return (
    <div className="tab-context-submenu" onPointerEnter={updatePanelPosition} onFocus={updatePanelPosition}>
      <button
        ref={triggerRef}
        type="button"
        className="tab-context-delete tab-context-submenu-trigger"
        aria-haspopup="menu"
        onClick={onClick}
      >
        {label}
        <span aria-hidden="true">›</span>
      </button>
      <div
        ref={panelRef}
        className="tab-context-submenu-panel"
        role="menu"
        style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px` }}
      >
        {children}
      </div>
    </div>
  )
}

export function VaultEditorContextMenu({
  menu,
  canDecoupleAisle,
  revealLabel,
  canReveal,
  onClose,
  onClipboard,
  onCommand,
  onInsertUrlLink,
  onEditLink,
  onInsertNoteLink,
  onInsertNotePreview,
  onInsertAisle,
  onInsertAttachment,
  onCopyAs,
  onCreateSyncedCopy,
  onFilterSyncedAisle,
  onDecoupleAisle,
  onShowSyncedAisle,
  onRevealLocation,
}: {
  menu: VaultEditorContextMenuState | null
  canDecoupleAisle: boolean
  revealLabel: string
  canReveal: boolean
  onClose: () => void
  onClipboard: (
    action: VaultEditorClipboardAction,
    destination: VaultEditorPasteDestination,
    aisleId: string,
  ) => void
  onCommand: (command: string, payload?: Record<string, unknown>) => void
  onInsertUrlLink: () => void
  onEditLink: (prompt: LinkPromptState) => void
  onInsertNoteLink: () => void
  onInsertNotePreview: () => void
  onInsertAisle: (side: VaultEditorAisleInsertSide, aisleId: string) => void
  onInsertAttachment: () => void
  onCopyAs: (kind: VaultEditorCopyAsKind, mode: VaultEditorCopyAsMode, aisleId: string) => void
  onCreateSyncedCopy: () => void
  onFilterSyncedAisle: (aisleId: string) => void
  onDecoupleAisle: (aisleId: string) => void
  onShowSyncedAisle: (aisleId: string) => void
  onRevealLocation: (aisleId: string) => void
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [rootPosition, setRootPosition] = React.useState<MenuPosition>({ left: 0, top: 0 })

  React.useLayoutEffect(() => {
    if (!menu) return

    const updateRootPosition = () => {
      const element = rootRef.current
      setRootPosition(
        clampContextMenuPosition(
          { x: menu.x, y: menu.y },
          element ? getElementSize(element) : { width: 0, height: 0 },
          getViewportSize(),
        ),
      )
    }

    updateRootPosition()
    window.addEventListener('resize', updateRootPosition)
    return () => window.removeEventListener('resize', updateRootPosition)
  }, [menu])

  if (!menu) return null

  const runAction = (action: () => void) => {
    action()
    onClose()
  }
  const runCommand = (command: string, payload?: Record<string, unknown>) => {
    runAction(() => onCommand(command, payload))
  }
  const runClipboard = (action: VaultEditorClipboardAction, destination: VaultEditorPasteDestination = 'here') => {
    runAction(() => onClipboard(action, destination, menu.aisleId))
  }
  const runInsertAisle = (side: VaultEditorAisleInsertSide) => {
    runAction(() => onInsertAisle(side, menu.aisleId))
  }
  const runCopyAs = (kind: VaultEditorCopyAsKind, mode: VaultEditorCopyAsMode) => {
    runAction(() => onCopyAs(kind, mode, menu.aisleId))
  }
  const runAisleAction = (action: (aisleId: string) => void) => {
    runAction(() => action(menu.aisleId))
  }
  const runEditLink = () => {
    const prompt = menu.linkPrompt
    if (prompt) runAction(() => onEditLink(prompt))
  }

  const renderPasteSubmenu = (
    action: Extract<VaultEditorClipboardAction, 'paste' | 'pastePlainText'>,
    label: string,
  ) => (
    <SubMenu label={label} onClick={() => runClipboard(action, 'here')}>
      <MenuButton onClick={() => runClipboard(action, 'new-aisle-left')}>new aisle on left</MenuButton>
      <MenuButton onClick={() => runClipboard(action, 'new-aisle-right')}>new aisle on right</MenuButton>
      <MenuButton onClick={() => runClipboard(action, 'here')}>here</MenuButton>
    </SubMenu>
  )

  return (
    <div
      ref={rootRef}
      className="tab-context-menu"
      role="menu"
      style={{ top: `${rootPosition.top}px`, left: `${rootPosition.left}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.linkPrompt ? (
        <>
          <MenuButton onClick={runEditLink}>edit link</MenuButton>
          <MenuSeparator />
        </>
      ) : null}
      <MenuButton onClick={() => runClipboard('cut')}>cut</MenuButton>
      <MenuButton onClick={() => runClipboard('copy')}>copy</MenuButton>
      {renderPasteSubmenu('paste', 'paste')}
      {renderPasteSubmenu('pastePlainText', 'paste as plain text')}
      <SubMenu label="copy note as">
        <MenuButton onClick={() => runCopyAs('note', 'independent')}>independent copy</MenuButton>
        <MenuButton onClick={() => runCopyAs('note', 'synced')}>synced copy</MenuButton>
      </SubMenu>
      <SubMenu label="copy aisle as">
        <MenuButton onClick={() => runCopyAs('aisle', 'independent')}>independent copy</MenuButton>
        <MenuButton onClick={() => runCopyAs('aisle', 'synced')}>synced copy</MenuButton>
      </SubMenu>
      <MenuSeparator />
      <MenuButton onClick={() => runAction(onCreateSyncedCopy)}>make this a copy of</MenuButton>
      {canDecoupleAisle && (
        <>
          <MenuButton onClick={() => runAisleAction(onFilterSyncedAisle)}>filter synced aisle</MenuButton>
          <MenuButton onClick={() => runAisleAction(onDecoupleAisle)}>decouple aisle</MenuButton>
          <MenuButton onClick={() => runAisleAction(onShowSyncedAisle)}>show synced aisles</MenuButton>
        </>
      )}
      <MenuSeparator />
      <SubMenu label="format">
        <MenuButton onClick={() => runCommand('bold')}>bold</MenuButton>
        <MenuButton onClick={() => runCommand('italic')}>italic</MenuButton>
        <MenuButton onClick={() => runCommand('strike')}>strikethrough</MenuButton>
        <MenuButton onClick={() => runCommand('highlight')}>highlight</MenuButton>
        <MenuButton onClick={() => runCommand('code')}>inline code</MenuButton>
      </SubMenu>
      <SubMenu label="paragraph">
        <MenuButton onClick={() => runCommand('bulletList')}>bullet list</MenuButton>
        <MenuButton onClick={() => runCommand('dashList')}>dash list</MenuButton>
        <MenuButton onClick={() => runCommand('orderedList')}>numbered list</MenuButton>
        <MenuButton onClick={() => runCommand('taskList')}>task list</MenuButton>
        <MenuSeparator />
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <MenuButton key={level} onClick={() => runCommand('heading', { level })}>
            heading {level}
          </MenuButton>
        ))}
        <MenuButton onClick={() => runCommand('heading', { level: 0 })}>paragraph</MenuButton>
        <MenuSeparator />
        <MenuButton onClick={() => runCommand('blockQuote')}>quote block</MenuButton>
        <MenuButton onClick={() => runCommand('blockIndent')}>block indent</MenuButton>
        <MenuButton onClick={() => runCommand('removeBlockIndent')}>remove block indent</MenuButton>
      </SubMenu>
      <SubMenu label="insert">
        <MenuButton onClick={() => runAction(onInsertUrlLink)}>url link</MenuButton>
        <MenuButton onClick={() => runAction(onInsertNoteLink)}>note link</MenuButton>
        <MenuButton onClick={() => runAction(onInsertNotePreview)}>note preview</MenuButton>
        <MenuSeparator />
        <SubMenu label="aisle" onClick={() => runInsertAisle('right')}>
          <MenuButton onClick={() => runInsertAisle('left')}>to the left</MenuButton>
          <MenuButton onClick={() => runInsertAisle('right')}>to the right</MenuButton>
        </SubMenu>
        <MenuSeparator />
        <MenuButton onClick={() => runAction(onInsertAttachment)}>attachment</MenuButton>
        <MenuButton onClick={() => runCommand('addTable', { rowCount: 2, columnCount: 2 })}>table</MenuButton>
        <MenuButton onClick={() => runCommand('hr')}>horizontal rule</MenuButton>
        <MenuSeparator />
        <MenuButton onClick={() => runCommand('codeBlock')}>code block</MenuButton>
      </SubMenu>
      <MenuSeparator />
      <button
        type="button"
        className={`tab-context-delete ${canReveal ? '' : 'is-disabled'}`.trim()}
        aria-disabled={canReveal ? undefined : 'true'}
        disabled={!canReveal}
        onClick={() => runAction(() => onRevealLocation(menu.aisleId))}
      >
        {revealLabel}
      </button>
    </div>
  )
}
