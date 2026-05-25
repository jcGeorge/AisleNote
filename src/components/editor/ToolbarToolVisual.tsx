import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react'
import { TOOLBAR_TOOL_LABELS } from '../../editor/toolbar-layouts'
import type { ToolbarToolId } from '../../types/app'

const TOOLBAR_TOOL_ICON_CLASS: Partial<Record<ToolbarToolId, string>> = {
  heading: 'heading',
  bold: 'bold',
  italic: 'italic',
  highlight: 'highlight',
  strike: 'strike',
  taskList: 'task-list',
  bulletList: 'bullet-list',
  orderedList: 'ordered-list',
  dashList: 'dash-list',
  blockQuote: 'quote',
  blockIndent: 'indent',
  removeBlockIndent: 'outdent',
  hr: 'hrline',
  link: 'link',
  image: 'image',
  table: 'table',
  code: 'code',
  codeBlock: 'codeblock',
}

function getToolbarToolClassName(toolId: ToolbarToolId): string {
  if (toolId === 'copy') return 'note-copy-toolbar-btn'
  if (toolId === 'frontmatter') return 'frontmatter-toolbar-btn'
  if (toolId === 'tableOfContents') return 'table-of-contents-toolbar-btn'
  if (toolId === 'aisles') return 'aisles-toolbar-btn'
  if (toolId === 'undo') return 'editor-history-toolbar-btn editor-history-toolbar-btn-undo'
  if (toolId === 'redo') return 'editor-history-toolbar-btn editor-history-toolbar-btn-redo'
  if (toolId === 'clear') return 'clear-note-toolbar-btn'
  return `toastui-editor-toolbar-icons ${TOOLBAR_TOOL_ICON_CLASS[toolId] ?? ''}`.trim()
}

function ToolbarHistoryIcon() {
  return (
    <svg className="editor-history-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 7H5v3" />
      <path d="M5.5 9.5A7 7 0 1 1 7 17" />
    </svg>
  )
}

function getToolbarToolChildren(toolId: ToolbarToolId, iconOnlyTextTools: boolean): ReactNode {
  switch (toolId) {
    case 'copy':
      return (
        <span className="note-copy-toolbar-icon" aria-hidden="true">
          <span className="note-copy-toolbar-page note-copy-toolbar-page-back" />
          <span className="note-copy-toolbar-page note-copy-toolbar-page-front" />
          <span className="note-copy-toolbar-chain" />
        </span>
      )
    case 'frontmatter':
      return <span className="frontmatter-toolbar-icon" aria-hidden="true">fm</span>
    case 'tableOfContents':
      if (iconOnlyTextTools) return <span className="table-of-contents-toolbar-icon" aria-hidden="true" />
      return 'ToC'
    case 'aisles':
      return <span className="aisles-toolbar-icon" aria-hidden="true" />
    case 'undo':
      return <ToolbarHistoryIcon />
    case 'redo':
      return <ToolbarHistoryIcon />
    case 'clear':
      return '⌫'
    default:
      return null
  }
}

export type ToolbarToolVisualProps = {
  toolId: ToolbarToolId
  buttonRef?: RefObject<HTMLButtonElement | null>
  tooltipsDisabled?: boolean
  active?: boolean
  shortcutFeedback?: boolean
  iconOnlyTextTools?: boolean
  preventMouseDownDefault?: boolean
  onPress?: () => void
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>
}

export function ToolbarToolVisual({
  toolId,
  buttonRef,
  tooltipsDisabled = false,
  active = false,
  shortcutFeedback = false,
  iconOnlyTextTools = false,
  preventMouseDownDefault = true,
  onPress,
  buttonProps = {},
}: ToolbarToolVisualProps) {
  const {
    className = '',
    disabled,
    onClick,
    onMouseDown,
    title,
    type,
    ...restButtonProps
  } = buttonProps
  const label = TOOLBAR_TOOL_LABELS[toolId]
  const classNames = [
    getToolbarToolClassName(toolId),
    active ? 'active' : '',
    shortcutFeedback ? 'is-shortcut-feedback' : '',
    iconOnlyTextTools ? 'is-icon-only-text-tool' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      {...restButtonProps}
      ref={buttonRef}
      type={type ?? 'button'}
      className={classNames}
      title={tooltipsDisabled ? undefined : title ?? label}
      aria-label={buttonProps['aria-label'] ?? label}
      disabled={disabled}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if (event.defaultPrevented) return
        if (preventMouseDownDefault) event.preventDefault()
      }}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        onPress?.()
      }}
    >
      {getToolbarToolChildren(toolId, iconOnlyTextTools)}
    </button>
  )
}
