import type { ArrangeHierarchyDropRequest, TabArrangeDragPreview } from '../types/app'

export type ArrangeDestinationPromptMode =
  | 'space-or-parent-placement'
  | 'space-or-parent'
  | 'parent'

export type ArrangeDestinationPromptState = {
  request: ArrangeHierarchyDropRequest
  mode: ArrangeDestinationPromptMode
  targetDomainId: string
  targetSpaceId: string
  revealHierarchyLevel: 1 | 2
  carriedPreview: TabArrangeDragPreview
}

export function copyTabArrangeCarryPreview(
  preview: TabArrangeDragPreview,
  currentX: number,
  currentY: number,
): TabArrangeDragPreview {
  return {
    ...preview,
    item: { ...preview.item },
    currentX,
    currentY,
  }
}

export function isSubTabDropOnSourceSpace(request: ArrangeHierarchyDropRequest): boolean {
  return (
    request.item.type === 'subtab' &&
    request.target.type === 'space' &&
    request.sourceDomainId === request.target.domainId &&
    request.sourceSpaceId === request.target.spaceId
  )
}

export function createArrangeDestinationPromptState(
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
): ArrangeDestinationPromptState | null {
  if (request.target.type === 'space') {
    if (request.item.type === 'parent') return null
    return {
      request,
      mode: 'parent',
      targetDomainId: request.target.domainId,
      targetSpaceId: request.target.spaceId,
      revealHierarchyLevel: 1,
      carriedPreview,
    }
  }

  return null
}

export function createArrangeDomainDestinationPromptState(
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
  targetDomainId: string,
  targetSpaceId: string,
  mode: Extract<ArrangeDestinationPromptMode, 'space-or-parent-placement' | 'space-or-parent' | 'parent'> =
    request.item.type === 'parent' ? 'space-or-parent-placement' : 'space-or-parent',
): ArrangeDestinationPromptState {
  return {
    request: {
      ...request,
      target:
        request.target.type === 'space'
          ? { type: 'space', domainId: targetDomainId, spaceId: targetSpaceId }
          : request.target,
    },
    mode,
    targetDomainId,
    targetSpaceId,
    revealHierarchyLevel: 2,
    carriedPreview,
  }
}

export function getArrangeDestinationPromptMessage(mode: ArrangeDestinationPromptMode): string {
  if (mode === 'space-or-parent-placement') return 'now select a space or place the parent tab'
  if (mode === 'space-or-parent') return 'now select a space or parent tab'
  return 'now select a parent tab'
}

export function promptAllowsSpaceSelection(prompt: ArrangeDestinationPromptState): boolean {
  return prompt.mode === 'space-or-parent-placement' || prompt.mode === 'space-or-parent'
}
