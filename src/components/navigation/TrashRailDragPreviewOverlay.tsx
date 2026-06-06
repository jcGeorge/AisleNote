import type { ArrangePreviewGhostItem, DeleteTarget } from '../../types/app'
import { ArrangeDragPreviewPortal } from './ArrangeDragPreviewPortal'
import { ArrangePreviewStack } from './ArrangePreviewStack'
import { getArrangeDragPreviewRect, getArrangeDragPreviewStyleFromRect } from './arrange-drag-preview-style'

export type TrashRailDragPreview = {
  kind: 'domain' | 'space' | 'parent' | 'subtab'
  draggedId: string
  selectedIds: string[]
  targets: DeleteTarget[]
  label: string
  dragCount: number
  ghostItems: ArrangePreviewGhostItem[]
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

type TrashRailDragPreviewOverlayProps = {
  preview: TrashRailDragPreview
}

export function TrashRailDragPreviewOverlay({ preview }: TrashRailDragPreviewOverlayProps) {
  const cardClassName =
    preview.kind === 'domain'
      ? 'compact-scope-arrange-preview compact-scope-btn compact-domain-btn is-domain is-active is-selected'
      : preview.kind === 'space'
        ? 'compact-scope-arrange-preview compact-scope-btn compact-space-btn is-space is-active is-selected'
        : preview.kind === 'parent'
          ? 'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected'
          : 'tab-arrange-preview is-subtab tab-btn subtab-btn is-selected'
  const targetRect = getArrangeDragPreviewRect(preview)

  return (
    <ArrangeDragPreviewPortal>
      <ArrangePreviewStack
        cardClassName={cardClassName}
        dragCount={preview.dragCount}
        ghostItems={preview.ghostItems}
        style={getArrangeDragPreviewStyleFromRect(targetRect)}
        targetRect={targetRect}
      >
        <span>{preview.label}</span>
      </ArrangePreviewStack>
    </ArrangeDragPreviewPortal>
  )
}

