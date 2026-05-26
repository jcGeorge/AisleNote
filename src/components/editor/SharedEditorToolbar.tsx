import { Fragment, type RefObject } from 'react'
import {
  getDefaultToolbarLayout,
  getToolbarGroupClassName,
  getToolbarLayoutRenderSegments,
} from '../../editor/toolbar-layouts'
import type { ToolbarFormatKey, ToolbarFormatState, ToolbarHeadingLevel } from './toolbar-state'
import type { ToolbarLayout, ToolbarLayoutItem, ToolbarToolId } from '../../types/app'
import { ToolbarToolVisual } from './ToolbarToolVisual'

const TOOLBAR_FORMAT_LABELS: Record<ToolbarFormatKey, string> = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  highlight: 'Highlight',
}

type SharedEditorToolbarProps = {
  layout?: ToolbarLayout
  copyButtonRef: RefObject<HTMLButtonElement | null>
  headingButtonRef: RefObject<HTMLButtonElement | null>
  aisleButtonRef: RefObject<HTMLButtonElement | null>
  tooltipsDisabled?: boolean
  interactionDisabled?: boolean
  toolbarFormatState: ToolbarFormatState
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarShortcutFeedback: ToolbarFormatKey | null
  onOpenCopy: () => void
  onOpenFrontmatter: () => void
  onOpenTableOfContents: () => void
  onOpenAisleEditModal: () => void
  onToggleHeading: () => void
  onCommand: (command: string, payload?: Record<string, unknown>) => void
  onHistory: (direction: 'undo' | 'redo') => void
  onInsertImage: () => void
  onInsertWebLink: () => void
  onClear: () => void
  onDisabledInteraction?: () => void
}

type ToolbarRenderContext = {
  copyButtonRef: RefObject<HTMLButtonElement | null>
  headingButtonRef: RefObject<HTMLButtonElement | null>
  aisleButtonRef: RefObject<HTMLButtonElement | null>
  tooltipsDisabled: boolean
  toolbarFormatState: ToolbarFormatState
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarShortcutFeedback: ToolbarFormatKey | null
  onOpenCopy: () => void
  onOpenFrontmatter: () => void
  onOpenTableOfContents: () => void
  onOpenAisleEditModal: () => void
  onToggleHeading: () => void
  onCommand: (command: string, payload?: Record<string, unknown>) => void
  onHistory: (direction: 'undo' | 'redo') => void
  onInsertImage: () => void
  onInsertWebLink: () => void
  onClear: () => void
}

function getToolbarToolRef(toolId: ToolbarToolId, context: ToolbarRenderContext): RefObject<HTMLButtonElement | null> | undefined {
  if (toolId === 'copy') return context.copyButtonRef
  if (toolId === 'heading') return context.headingButtonRef
  if (toolId === 'aisles') return context.aisleButtonRef
  return undefined
}

function getToolbarToolActive(toolId: ToolbarToolId, context: ToolbarRenderContext): boolean {
  if (toolId === 'heading') return typeof context.activeHeadingLevel === 'number' && context.activeHeadingLevel > 0
  if (toolId === 'bold' || toolId === 'italic' || toolId === 'strike' || toolId === 'highlight') {
    return context.toolbarFormatState[toolId]
  }
  return false
}

function isToolbarToolShortcutFeedback(toolId: ToolbarToolId, context: ToolbarRenderContext): boolean {
  return toolId === context.toolbarShortcutFeedback
}

function runToolbarTool(toolId: ToolbarToolId, context: ToolbarRenderContext) {
  switch (toolId) {
    case 'copy':
      context.onOpenCopy()
      return
    case 'frontmatter':
      context.onOpenFrontmatter()
      return
    case 'tableOfContents':
      context.onOpenTableOfContents()
      return
    case 'aisles':
      context.onOpenAisleEditModal()
      return
    case 'undo':
      context.onHistory('undo')
      return
    case 'redo':
      context.onHistory('redo')
      return
    case 'heading':
      context.onToggleHeading()
      return
    case 'bold':
    case 'italic':
    case 'strike':
    case 'highlight':
      context.onCommand(toolId)
      return
    case 'taskList':
    case 'bulletList':
    case 'orderedList':
    case 'dashList':
    case 'blockQuote':
    case 'blockIndent':
    case 'removeBlockIndent':
    case 'hr':
    case 'code':
    case 'codeBlock':
      context.onCommand(toolId)
      return
    case 'link':
      context.onInsertWebLink()
      return
    case 'image':
      context.onInsertImage()
      return
    case 'table':
      context.onCommand('addTable', { rowCount: 2, columnCount: 2 })
      return
    case 'clear':
      context.onClear()
      return
  }
}

function renderToolbarTool(toolId: ToolbarToolId, context: ToolbarRenderContext) {
  const button = (
    <ToolbarToolVisual
      toolId={toolId}
      buttonRef={getToolbarToolRef(toolId, context)}
      tooltipsDisabled={context.tooltipsDisabled}
      active={getToolbarToolActive(toolId, context)}
      shortcutFeedback={isToolbarToolShortcutFeedback(toolId, context)}
      onPress={() => runToolbarTool(toolId, context)}
    />
  )
  return toolId === 'heading' || toolId === 'aisles' ? (
    <span key={toolId} className="note-toolbar-menu-anchor">
      {button}
    </span>
  ) : button
}

function groupHasShortcutFeedback(group: ToolbarLayoutItem[], toolbarShortcutFeedback: ToolbarFormatKey | null): boolean {
  if (!toolbarShortcutFeedback) return false
  return group.some((item) => item.type === 'tool' && item.toolId === toolbarShortcutFeedback)
}

export function SharedEditorToolbar({
  layout = getDefaultToolbarLayout(),
  copyButtonRef,
  headingButtonRef,
  aisleButtonRef,
  tooltipsDisabled = false,
  interactionDisabled = false,
  toolbarFormatState,
  activeHeadingLevel,
  toolbarShortcutFeedback,
  onOpenCopy,
  onOpenFrontmatter,
  onOpenTableOfContents,
  onOpenAisleEditModal,
  onToggleHeading,
  onCommand,
  onHistory,
  onInsertImage,
  onInsertWebLink,
  onClear,
  onDisabledInteraction,
}: SharedEditorToolbarProps) {
  if (layout.items.length === 0) return null

  const renderContext: ToolbarRenderContext = {
    copyButtonRef,
    headingButtonRef,
    aisleButtonRef,
    tooltipsDisabled,
    toolbarFormatState,
    activeHeadingLevel,
    toolbarShortcutFeedback,
    onOpenCopy,
    onOpenFrontmatter,
    onOpenTableOfContents,
    onOpenAisleEditModal,
    onToggleHeading,
    onCommand,
    onHistory,
    onInsertImage,
    onInsertWebLink,
    onClear,
  }
  const segments = getToolbarLayoutRenderSegments(layout.items)

  return (
    <div
      className={`note-shared-toolbar toastui-editor-toolbar ${interactionDisabled ? 'is-interaction-disabled' : ''}`}
      role="toolbar"
      aria-label="Note formatting toolbar"
      aria-disabled={interactionDisabled ? 'true' : undefined}
      onPointerDownCapture={(event) => {
        if (!interactionDisabled || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        onDisabledInteraction?.()
      }}
      onClickCapture={(event) => {
        if (!interactionDisabled) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDownCapture={(event) => {
        if (!interactionDisabled || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        event.stopPropagation()
        onDisabledInteraction?.()
      }}
      onPointerDown={(event) => {
        if (interactionDisabled) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        event.stopPropagation()
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        if (interactionDisabled) {
          event.stopPropagation()
        }
      }}
    >
      <div className="toastui-editor-defaultUI-toolbar app-shared-editor-toolbar">
        {segments.map((segment) => (
          segment.type === 'spacer' ? (
            <span key={`${layout.id}-spacer-${segment.id}`} className="note-toolbar-layout-spacer" aria-hidden="true" />
          ) : (
            <div key={`${layout.id}-${segment.id}`} className={getToolbarGroupClassName(segment.items)}>
              {segment.items.map((item) => (
                <Fragment key={item.id}>
                  {item.type === 'tool' ? renderToolbarTool(item.toolId, renderContext) : null}
                </Fragment>
              ))}
              {groupHasShortcutFeedback(segment.items, toolbarShortcutFeedback) && (
                <span className="note-toolbar-shortcut-feedback" role="status">
                  {TOOLBAR_FORMAT_LABELS[toolbarShortcutFeedback!]}
                </span>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  )
}
