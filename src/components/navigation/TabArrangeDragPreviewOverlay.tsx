import { useEffect, useState } from 'react'
import type { TabArrangeDragPreview } from '../../types/app'
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { ArrangePreviewStack } from './ArrangePreviewStack'
import { getArrangeDragPreviewRect, getArrangeDragPreviewStyleFromRect } from './arrange-drag-preview-style'

type TabArrangeDragPreviewOverlayProps = {
  preview: TabArrangeDragPreview
}

export function TabArrangeDragPreviewOverlay({ preview }: TabArrangeDragPreviewOverlayProps) {
  const cardClassName =
    preview.variant === 'subtab'
      ? 'tab-arrange-preview is-subtab tab-btn subtab-btn is-selected'
      : 'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected'
  const targetRect = getArrangeDragPreviewRect(preview)
  return (
    <ArrangeDragPreviewPortal>
      <ArrangePreviewStack
        cardClassName={cardClassName}
        dragCount={preview.dragCount}
        ghostOrigins={preview.ghostOrigins}
        style={getArrangeDragPreviewStyleFromRect(targetRect)}
        targetRect={targetRect}
      >
        <span>{preview.label}</span>
      </ArrangePreviewStack>
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
