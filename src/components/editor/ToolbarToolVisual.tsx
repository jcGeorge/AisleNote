import * as React from 'react'
import { TOOLBAR_TOOL_LABELS } from '../../editor/toolbar-layouts'
import type { ToolbarToolId } from '../../types/app'
import { ToolbarToolIcon } from './ToolbarToolIcon'

const TOOLBAR_TOOL_EXTRA_CLASSES: Partial<Record<ToolbarToolId, string>> = {
  copy: 'note-copy-toolbar-btn',
  frontmatter: 'frontmatter-toolbar-btn',
  tableOfContents: 'table-of-contents-toolbar-btn',
  aisles: 'aisles-toolbar-btn',
  findReplace: 'find-replace-toolbar-btn',
  undo: 'editor-history-toolbar-btn editor-history-toolbar-btn-undo',
  redo: 'editor-history-toolbar-btn editor-history-toolbar-btn-redo',
  clear: 'clear-note-toolbar-btn',
}

function getToolbarToolClassName(toolId: ToolbarToolId): string {
  const kebabToolId = toolId.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
  return ['app-toolbar-tool-btn', `app-toolbar-tool-btn-${kebabToolId}`, TOOLBAR_TOOL_EXTRA_CLASSES[toolId]]
    .filter(Boolean)
    .join(' ')
}

export type ToolbarToolVisualProps = {
  toolId: ToolbarToolId
  buttonRef?: React.RefObject<HTMLButtonElement | null>
  tooltipsDisabled?: boolean
  active?: boolean
  shortcutFeedback?: boolean
  iconOnlyTextTools?: boolean
  preventMouseDownDefault?: boolean
  onPress?: () => void
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
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
  const tooltip = tooltipsDisabled ? undefined : title ?? label
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
      data-app-tooltip={tooltip}
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
      <ToolbarToolIcon toolId={toolId} active={active} />
    </button>
  )
}
