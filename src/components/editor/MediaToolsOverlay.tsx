import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import type { ImageTransformOperation } from '../../editor/image-transform'
import { ResizeCornerIcon } from './ResizeCornerIcon'

export type MediaToolsState = {
  visible: boolean
  menuMode: 'start' | 'transform'
  toolbarTop: number
  toolbarLeft: number
  resizeTop: number
  resizeLeft: number
}

type MediaToolsOverlayProps = {
  visible: boolean
  mediaTools: MediaToolsState
  onOpenTransform: () => void
  onReturnToStart: () => void
  onTransformMedia: (operation: ImageTransformOperation) => unknown
  onBeginResize: (event: PointerEvent<HTMLButtonElement>) => void
}

function ToolButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="image-tool-btn"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
      aria-label={label}
      data-app-tooltip={label}
    >
      {children}
    </button>
  )
}

function TransformButton({
  operation,
  label,
  iconClassName,
  onTransformMedia,
}: {
  operation: ImageTransformOperation
  label: string
  iconClassName: string
  onTransformMedia: (operation: ImageTransformOperation) => unknown
}) {
  return (
    <button
      type="button"
      className="image-tool-btn image-transform-btn media-transform-btn"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        void onTransformMedia(operation)
      }}
      aria-label={label}
      data-app-tooltip={label}
    >
      <span className={`image-transform-icon ${iconClassName}`} aria-hidden="true" />
    </button>
  )
}

export function MediaToolsOverlay({
  visible,
  mediaTools,
  onOpenTransform,
  onReturnToStart,
  onTransformMedia,
  onBeginResize,
}: MediaToolsOverlayProps) {
  if (!visible || !mediaTools.visible) return null

  const stopToolbarPointerEvent = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const stopToolbarMouseEvent = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      <div
        className="image-tools media-tools"
        style={{
          top: `${mediaTools.toolbarTop}px`,
          left: `${mediaTools.toolbarLeft}px`,
        }}
        onPointerDown={stopToolbarPointerEvent}
        onMouseDown={stopToolbarMouseEvent}
        onClick={stopToolbarMouseEvent}
      >
        {mediaTools.menuMode === 'transform' ? (
          <>
            <TransformButton
              operation="rotate-ccw"
              label="Rotate counterclockwise"
              iconClassName="is-rotate-ccw"
              onTransformMedia={onTransformMedia}
            />
            <TransformButton
              operation="rotate-cw"
              label="Rotate clockwise"
              iconClassName="is-rotate-cw"
              onTransformMedia={onTransformMedia}
            />
            <TransformButton
              operation="flip-horizontal"
              label="Flip horizontal"
              iconClassName="is-flip-horizontal"
              onTransformMedia={onTransformMedia}
            />
            <TransformButton
              operation="flip-vertical"
              label="Flip vertical"
              iconClassName="is-flip-vertical"
              onTransformMedia={onTransformMedia}
            />
            <button
              type="button"
              className="image-tool-btn image-transform-return-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                onReturnToStart()
              }}
              aria-label="Return"
              data-app-tooltip="Return"
            >
              return
            </button>
          </>
        ) : (
          <ToolButton onClick={onOpenTransform} label="Transform">
            transform
          </ToolButton>
        )}
      </div>

      <button
        type="button"
        className="image-resize-handle media-resize-handle"
        style={{ top: `${mediaTools.resizeTop}px`, left: `${mediaTools.resizeLeft}px` }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => event.preventDefault()}
        onPointerDown={onBeginResize}
        aria-label="Resize video"
        data-app-tooltip="Drag to resize"
      >
        <ResizeCornerIcon />
      </button>
    </>
  )
}
