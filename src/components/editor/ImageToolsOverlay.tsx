import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import type { ImageToolsState, InlineCropState } from '../../types/app'

export type InlineCropDragMode = 'move' | 'resize-n' | 'resize-e' | 'resize-s' | 'resize-w' | 'resize-se'

type ImageToolsOverlayProps = {
  visible: boolean
  imageTools: ImageToolsState
  inlineCrop: InlineCropState
  onStartCrop: () => void
  onApplyCrop: () => void
  onCancelCrop: () => void
  onBeginResize: (event: PointerEvent<HTMLButtonElement>) => void
  onBeginCropDrag: (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => void
}

function CropHandle({
  className,
  style,
  mode,
  label,
  onBeginCropDrag,
}: {
  className: string
  style: React.CSSProperties
  mode: InlineCropDragMode
  label: string
  onBeginCropDrag: (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      draggable={false}
      aria-label={label}
      onMouseDown={(event) => onBeginCropDrag(mode, event)}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
      title={label}
    />
  )
}

function CropButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button type="button" className="image-tool-btn" onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function ImageToolsOverlay({
  visible,
  imageTools,
  inlineCrop,
  onStartCrop,
  onApplyCrop,
  onCancelCrop,
  onBeginResize,
  onBeginCropDrag,
}: ImageToolsOverlayProps) {
  if (!visible || !imageTools.visible) return null

  return (
    <>
      <div className="image-tools" style={{ top: `${imageTools.cropTop}px`, left: `${imageTools.cropLeft}px` }}>
        {!inlineCrop.active ? (
          <CropButton onClick={onStartCrop} title="Crop">
            crop
          </CropButton>
        ) : (
          <>
            <CropButton onClick={onApplyCrop} title="Apply crop">
              apply
            </CropButton>
            <CropButton onClick={onCancelCrop} title="Cancel crop">
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
          title="Drag to resize"
        />
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
          />
        </>
      )}
    </>
  )
}
