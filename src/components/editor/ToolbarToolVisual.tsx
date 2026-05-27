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
  if (toolId === 'director') return 'director-toolbar-btn'
  if (toolId === 'findReplace') return 'find-replace-toolbar-btn'
  if (toolId === 'undo') return 'editor-history-toolbar-btn editor-history-toolbar-btn-undo'
  if (toolId === 'redo') return 'editor-history-toolbar-btn editor-history-toolbar-btn-redo'
  if (toolId === 'clear') return 'clear-note-toolbar-btn'
  return `toastui-editor-toolbar-icons ${TOOLBAR_TOOL_ICON_CLASS[toolId] ?? ''}`.trim()
}

function ToolbarHistoryIcon() {
  return (
    <svg className="editor-history-toolbar-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="editor-history-toolbar-arc" d="M9.8 16.2A9.9 9.9 0 1 1 16.8 27.3" />
      <path className="editor-history-toolbar-head" d="M9.8 9.5v6.7h6.7" />
    </svg>
  )
}

function TableOfContentsToolbarIcon() {
  return (
    <span className="table-of-contents-toolbar-icon" aria-hidden="true">
      <span className="table-of-contents-toolbar-icon-row table-of-contents-toolbar-icon-row-1" />
      <span className="table-of-contents-toolbar-icon-row table-of-contents-toolbar-icon-row-2" />
      <span className="table-of-contents-toolbar-icon-row table-of-contents-toolbar-icon-row-3" />
      <span className="table-of-contents-toolbar-icon-row table-of-contents-toolbar-icon-row-4" />
    </span>
  )
}

function AislesToolbarIcon() {
  return (
    <svg className="aisles-toolbar-icon" viewBox="0 0 36 32" aria-hidden="true" focusable="false">
      <path className="aisles-toolbar-icon-frame" d="M8 5.6 28 2.4v27.2L8 24.4Z" />
      <path className="aisles-toolbar-icon-shelf" d="M8 13.2h20" />
      <path className="aisles-toolbar-icon-shelf" d="M8 22.1l20 4" />
      <path className="aisles-toolbar-icon-item" d="M11.4 9.9h5v3.3h-5z" />
      <path className="aisles-toolbar-icon-item" d="M16.4 8.7h6.1v4.5" />
      <path className="aisles-toolbar-icon-item" d="M11.4 18.1h4.8v5.2" />
      <path className="aisles-toolbar-icon-item" d="M16.2 17.5h5v6.7" />
      <path className="aisles-toolbar-icon-item" d="M21.2 17h4.8v8.2" />
    </svg>
  )
}

function DirectorToolbarIcon() {
  return (
    <svg className="director-toolbar-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="director-toolbar-icon-ring" d="M16 4.5a11.5 11.5 0 1 0 0 23 11.5 11.5 0 0 0 0-23Z" />
      <path className="director-toolbar-icon-needle" d="m20.9 9.9-2.3 8.7-7.5 3.5 2.3-8.7Z" />
      <path className="director-toolbar-icon-center" d="M16 15.1a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z" />
    </svg>
  )
}

function FindReplaceToolbarIcon() {
  return (
    <svg className="find-replace-toolbar-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="find-replace-toolbar-lens" d="M14.1 6.5a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2Z" />
      <path className="find-replace-toolbar-handle" d="m19.8 19.8 5.7 5.7" />
    </svg>
  )
}

function getToolbarToolChildren(toolId: ToolbarToolId): ReactNode {
  switch (toolId) {
    case 'copy':
      return (
        <span className="note-copy-toolbar-icon" aria-hidden="true">
          <span className="note-copy-toolbar-document" />
          <span className="note-copy-toolbar-chain" />
        </span>
      )
    case 'frontmatter':
      return <span className="frontmatter-toolbar-icon" aria-hidden="true">fm</span>
    case 'tableOfContents':
      return <TableOfContentsToolbarIcon />
    case 'aisles':
      return <AislesToolbarIcon />
    case 'director':
      return <DirectorToolbarIcon />
    case 'findReplace':
      return <FindReplaceToolbarIcon />
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
      {getToolbarToolChildren(toolId)}
    </button>
  )
}
