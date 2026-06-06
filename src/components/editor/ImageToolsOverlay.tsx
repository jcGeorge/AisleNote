import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import type { CropRatioPresetId } from '../../editor/crop-ratios'
import type { ImageTransformOperation } from '../../editor/image-transform'
import type { GeneralIconId } from '../../icons/app-icons'
import type { ImageToolsState, InlineCropState } from '../../types/app'
import { AppIcon } from '../icons/AppIcon'
import { CropRatioSelect } from './CropRatioSelect'
import { ResizeCornerIcon } from './ResizeCornerIcon'

export type InlineCropDragMode = 'move' | 'resize-n' | 'resize-e' | 'resize-s' | 'resize-w' | 'resize-se'

type ImageToolsOverlayProps = {
  visible: boolean
  imageTools: ImageToolsState
  inlineCrop: InlineCropState
  onStartCrop: () => void
  onOpenTransform: () => void
  onCopyImage: () => void | Promise<unknown>
  onReturnToStart: () => void
  onTransformImage: (operation: ImageTransformOperation) => void | Promise<unknown>
  onApplyCrop: () => void
  onCancelCrop: () => void
  onSetCropRatio: (presetId: CropRatioPresetId) => void
  onBeginResize: (event: PointerEvent<HTMLButtonElement>) => void
  onBeginCropDrag: (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => void
}

function CropHandle({
  className,
  style,
  mode,
  label,
  children,
  onBeginCropDrag,
}: {
  className: string
  style: React.CSSProperties
  mode: InlineCropDragMode
  label: string
  children?: ReactNode
  onBeginCropDrag: (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      draggable={false}
      aria-label={label}
      data-app-tooltip={label}
      onMouseDown={(event) => onBeginCropDrag(mode, event)}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
    >
      {children}
    </button>
  )
}

function CropButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
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

function ImageTransformButton({
  operation,
  label,
  iconId,
  onTransformImage,
}: {
  operation: ImageTransformOperation
  label: string
  iconId: GeneralIconId
  onTransformImage: (operation: ImageTransformOperation) => void | Promise<unknown>
}) {
  return (
    <button
      type="button"
      className="image-tool-btn image-transform-btn"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        void onTransformImage(operation)
      }}
      aria-label={label}
      data-app-tooltip={label}
    >
      <AppIcon iconId={iconId} className="image-transform-icon" />
    </button>
  )
}

function ImageCopyButton({ onCopyImage }: { onCopyImage: () => void | Promise<unknown> }) {
  return (
    <button
      type="button"
      className="image-tool-btn image-copy-btn"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        void onCopyImage()
      }}
      aria-label="Copy image"
      data-app-tooltip="Copy image"
    >
      <span className="image-copy-icon" aria-hidden="true" />
    </button>
  )
}

export function ImageToolsOverlay({
  visible,
  imageTools,
  inlineCrop,
  onStartCrop,
  onOpenTransform,
  onCopyImage,
  onReturnToStart,
  onTransformImage,
  onApplyCrop,
  onCancelCrop,
  onSetCropRatio,
  onBeginResize,
  onBeginCropDrag,
}: ImageToolsOverlayProps) {
  if (!visible || !imageTools.visible) return null

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
        className="image-tools"
        style={{
          top: `${imageTools.toolbarTop}px`,
          left: `${imageTools.toolbarLeft}px`,
        }}
        onPointerDown={stopToolbarPointerEvent}
        onMouseDown={stopToolbarMouseEvent}
        onClick={stopToolbarMouseEvent}
      >
        {!inlineCrop.active ? (
          imageTools.menuMode === 'transform' ? (
            <>
              <ImageTransformButton
                operation="rotate-ccw"
                label="Rotate counterclockwise"
                iconId="rotateCounterClockwise"
                onTransformImage={onTransformImage}
              />
              <ImageTransformButton
                operation="rotate-cw"
                label="Rotate clockwise"
                iconId="rotateClockwise"
                onTransformImage={onTransformImage}
              />
              <ImageTransformButton
                operation="flip-horizontal"
                label="Flip horizontal"
                iconId="flipX"
                onTransformImage={onTransformImage}
              />
              <ImageTransformButton
                operation="flip-vertical"
                label="Flip vertical"
                iconId="flipY"
                onTransformImage={onTransformImage}
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
            <>
              <CropButton onClick={onStartCrop} label="Crop">
                crop
              </CropButton>
              <CropButton onClick={onOpenTransform} label="Transform">
                transform
              </CropButton>
              <ImageCopyButton onCopyImage={onCopyImage} />
            </>
          )
        ) : (
          <>
            <CropRatioSelect value={inlineCrop.ratioPresetId} onChange={onSetCropRatio} />
            <CropButton onClick={onApplyCrop} label="Apply crop">
              apply
            </CropButton>
            <CropButton onClick={onCancelCrop} label="Cancel crop">
              cancel
            </CropButton>
          </>
        )}
      </div>

      {!inlineCrop.active && (
        <button
          type="button"
          className="image-resize-handle"
          style={{ top: `${imageTools.resizeTop}px`, left: `${imageTools.resizeLeft}px` }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
          onPointerDown={onBeginResize}
          aria-label="Resize image"
          data-app-tooltip="Drag to resize"
        >
          <ResizeCornerIcon />
        </button>
      )}

      {inlineCrop.active && (
        <>
          <div
            className="inline-crop-box"
            style={{
              top: `${inlineCrop.top}px`,
              left: `${inlineCrop.left}px`,
              width: `${inlineCrop.width}px`,
              height: `${inlineCrop.height}px`,
            }}
            onMouseDown={(event) => onBeginCropDrag('move', event)}
          />
          <CropHandle
            className="inline-crop-edge-handle inline-crop-edge-handle-n"
            style={{
              top: `${inlineCrop.top}px`,
              left: `${inlineCrop.left + inlineCrop.width / 2}px`,
            }}
            mode="resize-n"
            label="Resize crop area from top"
            onBeginCropDrag={onBeginCropDrag}
          />
          <CropHandle
            className="inline-crop-edge-handle inline-crop-edge-handle-e"
            style={{
              top: `${inlineCrop.top + inlineCrop.height / 2}px`,
              left: `${inlineCrop.left + inlineCrop.width}px`,
            }}
            mode="resize-e"
            label="Resize crop area from right"
            onBeginCropDrag={onBeginCropDrag}
          />
          <CropHandle
            className="inline-crop-edge-handle inline-crop-edge-handle-s"
            style={{
              top: `${inlineCrop.top + inlineCrop.height}px`,
              left: `${inlineCrop.left + inlineCrop.width / 2}px`,
            }}
            mode="resize-s"
            label="Resize crop area from bottom"
            onBeginCropDrag={onBeginCropDrag}
          />
          <CropHandle
            className="inline-crop-edge-handle inline-crop-edge-handle-w"
            style={{
              top: `${inlineCrop.top + inlineCrop.height / 2}px`,
              left: `${inlineCrop.left}px`,
            }}
            mode="resize-w"
            label="Resize crop area from left"
            onBeginCropDrag={onBeginCropDrag}
          />
          <CropHandle
            className="inline-crop-resize-handle"
            style={{
              top: `${inlineCrop.top + inlineCrop.height}px`,
              left: `${inlineCrop.left + inlineCrop.width}px`,
            }}
            mode="resize-se"
            label="Resize crop area"
            onBeginCropDrag={onBeginCropDrag}
          >
            <ResizeCornerIcon />
          </CropHandle>
        </>
      )}
    </>
  )
}
