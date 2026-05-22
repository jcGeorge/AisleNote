import { useEffect, useState } from 'react'
import type { TabArrangeDragPreview } from '../../types/app'
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { getArrangeDragPreviewStyle } from './arrange-drag-preview-style'

type TabArrangeDragPreviewOverlayProps = {
  preview: TabArrangeDragPreview
}

export function TabArrangeDragPreviewOverlay({ preview }: TabArrangeDragPreviewOverlayProps) {
  return (
    <ArrangeDragPreviewPortal>
      <div
        className={`tab-arrange-preview ${preview.variant === 'subtab' ? 'is-subtab' : 'is-parent'}`}
        style={getArrangeDragPreviewStyle(preview)}
      >
        <span>{preview.label}</span>
      </div>
    </ArrangeDragPreviewPortal>
  )
}

export function GuidedTabArrangeCarryPreview({ preview }: TabArrangeDragPreviewOverlayProps) {
  const [pointer, setPointer] = useState(() => ({ currentX: preview.currentX, currentY: preview.currentY }))

  useEffect(() => {
    setPointer({ currentX: preview.currentX, currentY: preview.currentY })
  }, [preview])

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      setPointer({ currentX: event.clientX, currentY: event.clientY })
    }

    window.addEventListener('pointermove', updatePointer, true)
    window.addEventListener('pointerdown', updatePointer, true)
    return () => {
      window.removeEventListener('pointermove', updatePointer, true)
      window.removeEventListener('pointerdown', updatePointer, true)
    }
  }, [])

  return (
    <TabArrangeDragPreviewOverlay
      preview={{
        ...preview,
        currentX: pointer.currentX,
        currentY: pointer.currentY,
      }}
    />
  )
}
