import { Fragment, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import {
  DEFAULT_TOOLBAR_LAYOUT_ID,
  TOOLBAR_TOOL_LABELS,
  getAvailableToolbarTools,
  isProtectedToolbarLayoutId,
  type ToolbarToolId,
} from '../../editor/toolbar-layouts'
import type { ToolbarLayout } from '../../types/app'
import { ToolbarToolVisual } from '../editor/ToolbarToolVisual'
import {
  canDropPalettePayload,
  canDropToolbarPayload,
  getToolbarDropIndexFromPointer,
  readToolbarDragPayload,
  type ToolbarDragPayload,
  type ToolbarItemDropRect,
  type ToolbarDropTarget,
  writeToolbarDragPayload,
} from './toolbar-settings-drag'

type ToolbarSettingsPanelProps = {
  toolbarLayouts: ToolbarLayout[]
  toolbarEditorLayoutId: string
  toolbarEditorShowNames: boolean
  onSelectToolbarLayout: (layoutId: string) => void
  onCreateToolbarLayout: () => void
  onDuplicateToolbarLayout: (layoutId: string) => void
  onRenameToolbarLayout: (layoutId: string, name: string) => void
  onDeleteToolbarLayout: (layoutId: string) => void
  onAddToolbarTool: (layoutId: string, toolId: string, targetIndex?: number) => void
  onAddToolbarSpacer: (layoutId: string, targetIndex?: number) => void
  onRemoveToolbarItem: (layoutId: string, itemId: string) => void
  onMoveToolbarItem?: (layoutId: string, itemId: string, direction: 'up' | 'down') => void
  onMoveToolbarItemToIndex: (layoutId: string, itemId: string, targetIndex: number) => void
  onToolbarEditorShowNamesChange: (enabled: boolean) => void
  onReadOnlyToolbarEditAttempt: () => void
}

export function ToolbarSettingsPanel({
  toolbarLayouts,
  toolbarEditorLayoutId,
  toolbarEditorShowNames,
  onSelectToolbarLayout,
  onCreateToolbarLayout,
  onDuplicateToolbarLayout,
  onRenameToolbarLayout,
  onDeleteToolbarLayout,
  onAddToolbarTool,
  onAddToolbarSpacer,
  onRemoveToolbarItem,
  onMoveToolbarItemToIndex,
  onToolbarEditorShowNamesChange,
  onReadOnlyToolbarEditAttempt,
}: ToolbarSettingsPanelProps) {
  const toolbarSurfaceRef = useRef<HTMLDivElement | null>(null)
  const toolbarItemRectsRef = useRef<ToolbarItemDropRect[]>([])
  const dragPayloadRef = useRef<ToolbarDragPayload | null>(null)
  const dropTargetRef = useRef<ToolbarDropTarget | null>(null)
  const [dragPayload, setDragPayload] = useState<ToolbarDragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<ToolbarDropTarget | null>(null)
  const selectedLayout = toolbarLayouts.find((layout) => layout.id === toolbarEditorLayoutId) ?? toolbarLayouts[0]
  const selectedLayoutId = selectedLayout?.id ?? DEFAULT_TOOLBAR_LAYOUT_ID
  const selectedProtected = isProtectedToolbarLayoutId(selectedLayoutId)
  const canEditSelectedLayout = Boolean(selectedLayout && !selectedProtected)
  const availableTools = useMemo(() => (selectedLayout ? getAvailableToolbarTools(selectedLayout) : []), [selectedLayout])
  const selectedItemCount = selectedLayout?.items.length ?? 0

  const updateDropTarget = (target: ToolbarDropTarget | null) => {
    const current = dropTargetRef.current
    const matches = current?.type === target?.type
      && (current?.type !== 'toolbar' || target?.type !== 'toolbar' || current.index === target.index)
    if (matches) return
    dropTargetRef.current = target
    setDropTarget(target)
  }

  const notifyReadOnlyToolbarEditAttempt = () => {
    if (canEditSelectedLayout) return
    onReadOnlyToolbarEditAttempt()
  }

  const handleReadOnlyPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (canEditSelectedLayout || event.button !== 0) return
    notifyReadOnlyToolbarEditAttempt()
  }

  const handleReadOnlyDragOver = (event: DragEvent) => {
    if (canEditSelectedLayout) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'none'
  }

  const handleReadOnlyDrop = (event: DragEvent) => {
    if (canEditSelectedLayout) return
    event.preventDefault()
    event.stopPropagation()
    finishDrag()
    notifyReadOnlyToolbarEditAttempt()
  }

  const startDrag = (event: DragEvent, payload: ToolbarDragPayload) => {
    if (!canEditSelectedLayout) {
      event.preventDefault()
      notifyReadOnlyToolbarEditAttempt()
      return
    }
    toolbarItemRectsRef.current = []
    dragPayloadRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.effectAllowed = 'move'
    writeToolbarDragPayload(event.dataTransfer, payload)
  }

  const finishDrag = () => {
    toolbarItemRectsRef.current = []
    dragPayloadRef.current = null
    setDragPayload(null)
    updateDropTarget(null)
  }

  const readDragPayload = (event: DragEvent): ToolbarDragPayload | null =>
    dragPayloadRef.current ?? dragPayload ?? readToolbarDragPayload(event.dataTransfer, null)

  const readToolbarItemRects = (): ToolbarItemDropRect[] =>
    Array.from(toolbarSurfaceRef.current?.querySelectorAll<HTMLElement>('[data-toolbar-layout-item]') ?? []).map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }
    })

  const getToolbarItemRects = (): ToolbarItemDropRect[] => {
    if (toolbarItemRectsRef.current.length === selectedItemCount) return toolbarItemRectsRef.current
    toolbarItemRectsRef.current = readToolbarItemRects()
    return toolbarItemRectsRef.current
  }

  const getToolbarTargetIndex = (event: DragEvent): number =>
    getToolbarDropIndexFromPointer(
      getToolbarItemRects(),
      { x: event.clientX, y: event.clientY },
      selectedItemCount,
    )

  const handleToolbarDragTarget = (event: DragEvent) => {
    if (!canEditSelectedLayout) return
    const payload = readDragPayload(event)
    if (!canDropToolbarPayload(payload)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateDropTarget({ type: 'toolbar', index: getToolbarTargetIndex(event) })
  }

  const handleToolbarDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canEditSelectedLayout) {
      finishDrag()
      return
    }
    const payload = readDragPayload(event)
    if (!canDropToolbarPayload(payload)) {
      finishDrag()
      return
    }
    const targetIndex = getToolbarTargetIndex(event)
    if (payload.source === 'layout') {
      onMoveToolbarItemToIndex(selectedLayoutId, payload.itemId, targetIndex)
    } else if (payload.source === 'tool') {
      onAddToolbarTool(selectedLayoutId, payload.toolId, targetIndex)
    } else {
      onAddToolbarSpacer(selectedLayoutId, targetIndex)
    }
    finishDrag()
  }

  const handlePaletteDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canEditSelectedLayout) {
      finishDrag()
      return
    }
    const payload = readDragPayload(event)
    if (canDropPalettePayload(payload)) {
      onRemoveToolbarItem(selectedLayoutId, payload.itemId)
    }
    finishDrag()
  }

  const handlePaletteDragTarget = (event: DragEvent) => {
    if (!canEditSelectedLayout) return
    const payload = readDragPayload(event)
    if (!canDropPalettePayload(payload)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateDropTarget({ type: 'palette' })
  }

  const renderToolVisual = ({
    toolId,
    className,
    dragging,
    payload,
    disabled = !canEditSelectedLayout,
  }: {
    toolId: ToolbarToolId
    className: string
    dragging?: boolean
    payload: ToolbarDragPayload
    disabled?: boolean
  }) => {
    const label = TOOLBAR_TOOL_LABELS[toolId]
    if (toolbarEditorShowNames) {
      return (
        <span
          className={[
            'settings-toolbar-named-tool',
            className,
            canEditSelectedLayout ? 'is-arrangeable' : '',
            dragging ? 'is-dragging' : '',
          ].filter(Boolean).join(' ')}
          title={label}
          aria-label={label}
          draggable={canEditSelectedLayout}
          onDragStart={(event) => startDrag(event, payload)}
          onDragEnd={finishDrag}
        >
          <ToolbarToolVisual
            toolId={toolId}
            iconOnlyTextTools
            preventMouseDownDefault={false}
            buttonProps={{
              className: 'settings-toolbar-named-tool-icon',
              draggable: false,
              disabled,
              tabIndex: -1,
            }}
          />
          <span className="settings-toolbar-visible-tool-name">{label}</span>
        </span>
      )
    }

    return (
      <ToolbarToolVisual
        toolId={toolId}
        iconOnlyTextTools
        preventMouseDownDefault={false}
        buttonProps={{
          className: [
            className,
            canEditSelectedLayout ? 'is-arrangeable' : '',
            dragging ? 'is-dragging' : '',
          ].filter(Boolean).join(' '),
          draggable: canEditSelectedLayout,
          disabled,
          onDragStart: (event) => startDrag(event, payload),
          onDragEnd: finishDrag,
        }}
      />
    )
  }

  return (
    <div className="settings-toolbar-panel">
      <div className="settings-toolbar-management" aria-label="toolbar layout management">
        <label className="settings-toolbar-field" htmlFor="settings-edit-toolbar-layout">
          <span className="settings-hotkey-label">layout</span>
          <select
            id="settings-edit-toolbar-layout"
            className="settings-select-input settings-toolbar-select"
            value={selectedLayoutId}
            onChange={(event) => onSelectToolbarLayout(event.target.value)}
          >
            {toolbarLayouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-toolbar-field settings-toolbar-name-field" htmlFor="settings-toolbar-layout-name">
          <span className="settings-hotkey-label">name</span>
          <input
            id="settings-toolbar-layout-name"
            type="text"
            className="settings-text-input"
            value={selectedLayout?.name ?? ''}
            disabled={selectedProtected}
            onChange={(event) => onRenameToolbarLayout(selectedLayoutId, event.target.value)}
          />
        </label>

        <div className="settings-toolbar-actions">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onCreateToolbarLayout}>
            new layout
          </button>
          <button
            type="button"
            className="btn btn-sm settings-action-btn"
            onClick={() => onDuplicateToolbarLayout(selectedLayoutId)}
          >
            duplicate
          </button>
          <button
            type="button"
            className="btn btn-sm settings-action-btn"
            disabled={selectedProtected}
            onClick={() => onDeleteToolbarLayout(selectedLayoutId)}
          >
            delete
          </button>
        </div>
      </div>

      <div
        className={`settings-toolbar-editor ${toolbarEditorShowNames ? 'show-names' : ''}`}
        aria-label="toolbar layout editor"
      >
        <div
          className={`settings-toolbar-preview ${canEditSelectedLayout ? 'is-editable' : 'is-readonly'}`}
          onPointerDownCapture={handleReadOnlyPointerDown}
          onDragOverCapture={handleReadOnlyDragOver}
          onDropCapture={handleReadOnlyDrop}
          onDragEnter={handleToolbarDragTarget}
          onDragOver={handleToolbarDragTarget}
          onDrop={handleToolbarDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              if (dropTargetRef.current?.type === 'toolbar') updateDropTarget(null)
            }
          }}
        >
          <div
            ref={toolbarSurfaceRef}
            className="settings-toolbar-surface toastui-editor-defaultUI-toolbar app-shared-editor-toolbar settings-toolbar-preview-inner"
          >
            {selectedLayout?.items.map((item, index) => (
              <span
                key={item.id}
                className={[
                  'settings-toolbar-editable-item-wrap',
                  dropTarget?.type === 'toolbar' && dropTarget.index === index ? 'is-drop-before' : '',
                  dropTarget?.type === 'toolbar' && dropTarget.index === selectedItemCount && index === selectedItemCount - 1
                    ? 'is-drop-after'
                    : '',
                ].filter(Boolean).join(' ')}
                data-toolbar-layout-item="true"
              >
                {item.type === 'tool' ? (
                  renderToolVisual({
                    toolId: item.toolId,
                    className: 'settings-toolbar-editable-icon',
                    dragging: dragPayload?.source === 'layout' && dragPayload.itemId === item.id,
                    payload: { source: 'layout', itemId: item.id },
                  })
                ) : (
                  <button
                    type="button"
                    className={[
                      'settings-toolbar-editable-spacer',
                      canEditSelectedLayout ? 'is-arrangeable' : '',
                      dragPayload?.source === 'layout' && dragPayload.itemId === item.id ? 'is-dragging' : '',
                    ].filter(Boolean).join(' ')}
                    title="spacer"
                    aria-label="spacer"
                    draggable={canEditSelectedLayout}
                    disabled={!canEditSelectedLayout}
                    data-toolbar-item-id={item.id}
                    onDragStart={(event) => startDrag(event, { source: 'layout', itemId: item.id })}
                    onDragEnd={finishDrag}
                  >
                    spacer
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div
          className={[
            'settings-toolbar-icon-box',
            canEditSelectedLayout ? 'is-editable' : 'is-readonly',
            dropTarget?.type === 'palette' ? 'is-drop-target' : '',
          ].filter(Boolean).join(' ')}
          aria-label="available toolbar tools"
          onPointerDownCapture={handleReadOnlyPointerDown}
          onDragOverCapture={handleReadOnlyDragOver}
          onDropCapture={handleReadOnlyDrop}
          onDragEnter={handlePaletteDragTarget}
          onDragOver={handlePaletteDragTarget}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              if (dropTargetRef.current?.type === 'palette') updateDropTarget(null)
            }
          }}
          onDrop={handlePaletteDrop}
        >
          <div className="settings-toolbar-surface toastui-editor-defaultUI-toolbar app-shared-editor-toolbar settings-toolbar-palette-inner">
            {availableTools.map((toolId) => (
              <Fragment key={toolId}>
                {renderToolVisual({
                  toolId,
                  className: 'settings-toolbar-palette-icon',
                  payload: { source: 'tool', toolId },
                })}
              </Fragment>
            ))}
            <button
              type="button"
              className="settings-toolbar-palette-spacer"
              title="spacer"
              aria-label="spacer"
              draggable={canEditSelectedLayout}
              disabled={!canEditSelectedLayout}
              onDragStart={(event) => startDrag(event, { source: 'spacer' })}
              onDragEnd={finishDrag}
            >
              spacer
            </button>
          </div>
        </div>

        <label className="settings-toolbar-name-toggle">
          <span className="settings-hotkey-label">show icons with names</span>
          <span className="form-check form-switch settings-switch">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={toolbarEditorShowNames}
              aria-label="show icons with names"
              onChange={(event) => onToolbarEditorShowNamesChange(event.target.checked)}
            />
          </span>
        </label>
      </div>
    </div>
  )
}
