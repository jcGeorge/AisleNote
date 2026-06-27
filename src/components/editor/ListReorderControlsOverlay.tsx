import React from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { ListReorderControlsState, ListReorderHandleSegment } from '../../editor/useListReorderControls'

void React

type ListReorderControlsOverlayProps = {
  visible: boolean
  listReorderControls: ListReorderControlsState
  onBeginListHandleGesture: (segment: ListReorderHandleSegment, event: MouseEvent<HTMLButtonElement>) => void
}

function getListHandleLabel(kind: ListReorderHandleSegment['kind'], index: number) {
  if (kind === 'numbered') return `Move numbered item ${index + 1}`
  if (kind === 'task') return `Move task ${index + 1}`
  if (kind === 'dash') return `Move dash item ${index + 1}`
  return `Move bullet item ${index + 1}`
}

export function ListReorderControlsOverlay({
  visible,
  listReorderControls,
  onBeginListHandleGesture,
}: ListReorderControlsOverlayProps) {
  if (!visible || !listReorderControls.visible) return null

  const stopPointerEvent = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const stopMouseEvent = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleMouseDown = (segment: ListReorderHandleSegment, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onBeginListHandleGesture(segment, event)
  }

  return (
    <div className="list-reorder-controls-overlay-layer">
      {listReorderControls.handles.map((segment) => {
        const label = getListHandleLabel(segment.kind, segment.index)
        return (
          <button
            key={segment.key}
            type="button"
            className={`list-reorder-handle list-reorder-handle-${segment.kind}`}
            aria-label={label}
            data-app-tooltip={label}
            data-list-reorder-kind={segment.kind}
            style={{
              top: `${segment.top}px`,
              left: `${segment.left}px`,
              width: `${segment.width}px`,
              height: `${segment.height}px`,
            }}
            onPointerDown={stopPointerEvent}
            onMouseDown={(event) => handleMouseDown(segment, event)}
            onClick={stopMouseEvent}
          />
        )
      })}
    </div>
  )
}
