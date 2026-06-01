import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ContextMenuState, LinkInsertMode } from '../../types/app'
import type { CopyAsAction, CopyAsScope } from '../../notes/copy-as-clipboard'
import { getCopyAsActionLabel } from '../../notes/copy-reference-labels'
import {
  clampContextMenuPosition,
  getSubmenuPosition,
  type MenuPosition,
  type MenuRect,
  type MenuSize,
  type MenuViewport,
} from './context-menu-position'

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

type ContextMenuHostProps = {
  contextMenu: ContextMenuState | null
  canDeleteSpace: boolean
  canDeleteDomain: boolean
  duplicateCount: number
  onClose: () => void
  onEnterArrangeMode: () => void
  onDuplicateSpace: () => void
  onRenameSpace: () => void
  onRenameDomain: () => void
  onCopyImage: () => void
  onRevealMediaFile: () => void
  onOpenInternalNoteLink: () => void
  onRenameInternalNoteLink: () => void
  onOpenDeduplicateModal: () => void
  onOpenCopyModal: () => void
  onMoveToTrash: () => void
  onRestoreFromTrash: () => void
  onEditorClipboard: (action: EditorClipboardAction, destination?: EditorPasteDestination) => void
  onEditorCommand: (command: string, payload?: Record<string, unknown>) => void
  onEditorInsertLink: (mode: LinkInsertMode | null) => void
  onEditorInsertAisle: () => void
  onEditorInsertAttachment: () => void
  onEditorFindReplace: () => void
  onEditorOpenContextLink: () => void
  onEditorEditContextLink: () => void
  onOpenScratchpadAbout: () => void
  copyAsMenu: CopyAsMenuState | null
  onCopyAs: (scope: CopyAsScope, action: CopyAsAction) => void
  onCopyAsUnavailable: (message: string) => void
}

export type EditorClipboardAction = 'cut' | 'copy' | 'paste' | 'pastePlainText'
export type EditorPasteDestination = 'here' | 'new-aisle-left' | 'new-aisle-right'

type CopyAsMenuItemState = {
  available: boolean
  reason?: string
}

type CopyAsMenuState = {
  note: Record<CopyAsAction, CopyAsMenuItemState>
  aisle?: Record<CopyAsAction, CopyAsMenuItemState>
}

function MenuButton({
  children,
  className = '',
  ariaDisabled = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  ariaDisabled?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`tab-context-delete ${ariaDisabled ? 'is-disabled' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-disabled={ariaDisabled ? 'true' : undefined}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function MenuSeparator() {
  return <div className="tab-context-separator" role="separator" />
}

const COPY_AS_MENU_ACTION_ORDER: CopyAsAction[] = ['copy', 'duplicate', 'link', 'preview']

function SubMenu({
  label,
  children,
  onClick,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = useState<MenuPosition>({ left: -9999, top: -9999 })

  const updatePanelPosition = useCallback(() => {
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

export function ContextMenuHost({
  contextMenu,
  duplicateCount,
  onEnterArrangeMode,
  onDuplicateSpace,
  onRenameSpace,
  onRenameDomain,
  onCopyImage,
  onRevealMediaFile,
  onOpenInternalNoteLink,
  onRenameInternalNoteLink,
  onOpenDeduplicateModal,
  onOpenCopyModal,
  onMoveToTrash,
  onRestoreFromTrash,
  onEditorClipboard,
  onEditorCommand,
  onEditorInsertLink,
  onEditorInsertAisle,
  onEditorInsertAttachment,
  onEditorFindReplace,
  onEditorOpenContextLink,
  onEditorEditContextLink,
  onOpenScratchpadAbout,
  copyAsMenu,
  onCopyAs,
  onCopyAsUnavailable,
}: ContextMenuHostProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [rootPosition, setRootPosition] = useState<MenuPosition>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!contextMenu) return

    const updateRootPosition = () => {
      const menu = rootRef.current
      setRootPosition(
        clampContextMenuPosition(
          { x: contextMenu.x, y: contextMenu.y },
          menu ? getElementSize(menu) : { width: 0, height: 0 },
          getViewportSize(),
        ),
      )
    }

    updateRootPosition()
    window.addEventListener('resize', updateRootPosition)
    return () => window.removeEventListener('resize', updateRootPosition)
  }, [contextMenu])

  if (!contextMenu) return null

  const renderCopyAsSubmenu = (scope: CopyAsScope, items: Record<CopyAsAction, CopyAsMenuItemState> | undefined) => {
    if (!items) return null
    return (
      <SubMenu label={`copy ${scope} as`}>
        {COPY_AS_MENU_ACTION_ORDER.map((action) => {
          const item = items[action]
          const unavailableReason = item.available ? '' : item.reason || `${scope} cannot be copied as ${action}.`
          return (
            <Fragment key={action}>
              {action === 'link' && <MenuSeparator />}
              <MenuButton
                ariaDisabled={!item.available}
                onClick={() => {
                  if (item.available) {
                    onCopyAs(scope, action)
                  } else {
                    onCopyAsUnavailable(unavailableReason)
                  }
                }}
              >
                {getCopyAsActionLabel(action)}
              </MenuButton>
            </Fragment>
          )
        })}
      </SubMenu>
    )
  }

  const renderPasteSubmenu = (action: Extract<EditorClipboardAction, 'paste' | 'pastePlainText'>, label: string) => (
    <SubMenu label={label} onClick={() => onEditorClipboard(action, 'here')}>
      <MenuButton onClick={() => onEditorClipboard(action, 'new-aisle-left')}>new aisle on left</MenuButton>
      <MenuButton onClick={() => onEditorClipboard(action, 'new-aisle-right')}>new aisle on right</MenuButton>
      <MenuButton onClick={() => onEditorClipboard(action, 'here')}>here</MenuButton>
    </SubMenu>
  )

  return (
    <div
      ref={rootRef}
      className="tab-context-menu"
      style={{ top: `${rootPosition.top}px`, left: `${rootPosition.left}px` }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
      {contextMenu.type === 'space' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onDuplicateSpace}>
            duplicate
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameSpace}>
            rename
          </button>
          <button type="button" className="tab-context-delete" onClick={onMoveToTrash}>
            trash it
          </button>
        </>
      ) : contextMenu.type === 'domain' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameDomain}>
            rename
          </button>
          <button type="button" className="tab-context-delete" onClick={onMoveToTrash}>
            trash it
          </button>
        </>
      ) : contextMenu.type === 'image' ? (
        <button type="button" className="tab-context-delete" onClick={onCopyImage}>
          copy image
        </button>
      ) : contextMenu.type === 'media' ? (
        <MenuButton onClick={onRevealMediaFile}>reveal file</MenuButton>
      ) : contextMenu.type === 'scratchpad' ? (
        <MenuButton onClick={onOpenScratchpadAbout}>about scratchpad</MenuButton>
      ) : contextMenu.type === 'editor' ? (
        <>
          {contextMenu.link && (
            <>
              <MenuButton onClick={onEditorOpenContextLink}>
                {contextMenu.link.type === 'internal' ? 'open linked note' : 'open link'}
              </MenuButton>
              <MenuButton onClick={onEditorEditContextLink}>edit link</MenuButton>
              <MenuSeparator />
            </>
          )}
          <MenuButton onClick={() => onEditorClipboard('cut')}>cut</MenuButton>
          <MenuButton onClick={() => onEditorClipboard('copy')}>copy</MenuButton>
          {renderPasteSubmenu('paste', 'paste')}
          {renderPasteSubmenu('pastePlainText', 'paste as plain text')}
          <MenuButton onClick={() => onEditorInsertLink(null)}>add link</MenuButton>
          <MenuSeparator />
          <MenuButton onClick={onEditorFindReplace}>find & replace</MenuButton>
          <MenuButton onClick={onOpenCopyModal}>make copy</MenuButton>
          {renderCopyAsSubmenu('note', copyAsMenu?.note)}
          {renderCopyAsSubmenu('aisle', copyAsMenu?.aisle)}
          <MenuSeparator />
          <SubMenu label="format">
            <MenuButton onClick={() => onEditorCommand('bold')}>bold</MenuButton>
            <MenuButton onClick={() => onEditorCommand('italic')}>italic</MenuButton>
            <MenuButton onClick={() => onEditorCommand('strike')}>strikethrough</MenuButton>
            <MenuButton onClick={() => onEditorCommand('highlight')}>highlight</MenuButton>
            <MenuButton onClick={() => onEditorCommand('code')}>inline code</MenuButton>
          </SubMenu>
          <SubMenu label="paragraph">
            <MenuButton onClick={() => onEditorCommand('bulletList')}>bullet list</MenuButton>
            <MenuButton onClick={() => onEditorCommand('dashList')}>dash list</MenuButton>
            <MenuButton onClick={() => onEditorCommand('orderedList')}>numbered list</MenuButton>
            <MenuButton onClick={() => onEditorCommand('taskList')}>task list</MenuButton>
            <MenuSeparator />
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <MenuButton key={level} onClick={() => onEditorCommand('heading', { level })}>
                heading {level}
              </MenuButton>
            ))}
            <MenuButton onClick={() => onEditorCommand('heading', { level: 0 })}>paragraph</MenuButton>
            <MenuSeparator />
            <MenuButton onClick={() => onEditorCommand('blockQuote')}>quote block</MenuButton>
            <MenuButton onClick={() => onEditorCommand('blockIndent')}>block indent</MenuButton>
            <MenuButton onClick={() => onEditorCommand('removeBlockIndent')}>remove block indent</MenuButton>
          </SubMenu>
          <SubMenu label="insert">
            <MenuButton onClick={() => onEditorInsertLink('note')}>note link</MenuButton>
            <MenuButton onClick={() => onEditorInsertLink('url')}>url link</MenuButton>
            <MenuSeparator />
            <MenuButton onClick={onEditorInsertAisle}>aisle</MenuButton>
            <MenuSeparator />
            <MenuButton onClick={onEditorInsertAttachment}>attachment</MenuButton>
            <MenuButton onClick={() => onEditorCommand('addTable', { rowCount: 2, columnCount: 2 })}>table</MenuButton>
            <MenuButton onClick={() => onEditorCommand('hr')}>horizontal rule</MenuButton>
            <MenuSeparator />
            <MenuButton onClick={() => onEditorCommand('codeBlock')}>code block</MenuButton>
          </SubMenu>
        </>
      ) : contextMenu.type === 'internal-note-link' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onOpenInternalNoteLink}>
            open linked note
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameInternalNoteLink}>
            edit link name
          </button>
        </>
      ) : contextMenu.type === 'trash-tab' ||
        contextMenu.type === 'trash-subtab' ||
        contextMenu.type === 'trash-domain' ||
        contextMenu.type === 'trash-space' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onRestoreFromTrash}>
            restore
          </button>
        </>
      ) : contextMenu.type === 'home-tab' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onOpenCopyModal}>
            make copy
          </button>
          {renderCopyAsSubmenu('note', copyAsMenu?.note)}
          {renderCopyAsSubmenu('aisle', copyAsMenu?.aisle)}
        </>
      ) : (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onOpenCopyModal}>
            make copy
          </button>
          {renderCopyAsSubmenu('note', copyAsMenu?.note)}
          {renderCopyAsSubmenu('aisle', copyAsMenu?.aisle)}
          {duplicateCount > 1 && (
            <button type="button" className="tab-context-delete" onClick={onOpenDeduplicateModal}>
              de-couple
            </button>
          )}
          <button type="button" className="tab-context-delete" onClick={onMoveToTrash}>
            trash it
          </button>
        </>
      )}
    </div>
  )
}
