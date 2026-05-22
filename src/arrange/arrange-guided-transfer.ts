import { projectActiveDomainState } from '../state/domains'
import type { AppState, ArrangeHierarchyDropRequest, ArrangeInsertPosition, Domain, Space, TabArrangeDragPreview } from '../types/app'
import {
  createArrangeDestinationPromptState,
  createArrangeDomainDestinationPromptState,
  promptAllowsSpaceSelection,
  type ArrangeDestinationPromptState,
} from './arrange-guided-prompt'

export type ArrangeParentPlacement = {
  targetParentTabId: string
  position: ArrangeInsertPosition
}

export type ArrangeGuidedTransferResolution =
  | { type: 'none' }
  | {
      type: 'move-parent-to-space'
      request: ArrangeHierarchyDropRequest
      targetDomainId: string
      targetSpaceId: string
      placement?: ArrangeParentPlacement
    }
  | {
      type: 'move-subtabs-to-parent'
      request: ArrangeHierarchyDropRequest
      targetDomainId: string
      targetSpaceId: string
      targetParentTabId: string
    }
  | {
      type: 'prompt'
      prompt: ArrangeDestinationPromptState
      focus: {
        domainId: string
        spaceId: string
      }
    }

export function getDestinationSpaceInDomain(
  appState: AppState,
  domainId: string,
): { domain: Domain; space: Space } | null {
  const projected = projectActiveDomainState(appState)
  const domain = projected.domains.find((candidate) => candidate.id === domainId)
  if (!domain) return null
  const space = domain.spaces.find((candidate) => candidate.id === domain.activeSpaceId) ?? domain.spaces[0] ?? null
  return space ? { domain, space } : null
}

export function getOnlySpaceInDomain(appState: AppState, domainId: string): Space | null {
  const destination = getDestinationSpaceInDomain(appState, domainId)
  return destination && destination.domain.spaces.length === 1 ? destination.domain.spaces[0] : null
}

export function getOnlyParentTabInSpace(appState: AppState, domainId: string, spaceId: string) {
  const projected = projectActiveDomainState(appState)
  const domain = projected.domains.find((candidate) => candidate.id === domainId)
  const space = domain?.spaces.find((candidate) => candidate.id === spaceId)
  return space && space.data.tabs.length === 1 ? space.data.tabs[0] : null
}

function promptResolution(prompt: ArrangeDestinationPromptState): ArrangeGuidedTransferResolution {
  return {
    type: 'prompt',
    prompt,
    focus: {
      domainId: prompt.targetDomainId,
      spaceId: prompt.targetSpaceId,
    },
  }
}

function resolveParentDomainDestination(
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
  targetDomainId: string,
  targetSpaceId: string,
): ArrangeGuidedTransferResolution {
  if (request.item.type !== 'parent') return { type: 'none' }
  return promptResolution(
    createArrangeDomainDestinationPromptState(
      request,
      carriedPreview,
      targetDomainId,
      targetSpaceId,
      'space-or-parent-placement',
    ),
  )
}

function resolveSubTabSpaceDestination(
  appState: AppState,
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
  targetDomainId: string,
  targetSpaceId: string,
  revealHierarchyLevel: ArrangeDestinationPromptState['revealHierarchyLevel'],
  mode: Extract<ArrangeDestinationPromptState['mode'], 'space-or-parent' | 'parent'> = 'parent',
): ArrangeGuidedTransferResolution {
  if (request.item.type !== 'subtab') return { type: 'none' }

  const onlyParentTab = getOnlyParentTabInSpace(appState, targetDomainId, targetSpaceId)
  if (onlyParentTab) {
    return {
      type: 'move-subtabs-to-parent',
      request,
      targetDomainId,
      targetSpaceId,
      targetParentTabId: onlyParentTab.id,
    }
  }

  const targetRequest: ArrangeHierarchyDropRequest = {
    ...request,
    target: { type: 'space', domainId: targetDomainId, spaceId: targetSpaceId },
  }
  const prompt =
    revealHierarchyLevel === 2
      ? createArrangeDomainDestinationPromptState(targetRequest, carriedPreview, targetDomainId, targetSpaceId, mode)
      : createArrangeDestinationPromptState(targetRequest, carriedPreview)

  return prompt ? promptResolution(prompt) : { type: 'none' }
}

export function resolveArrangeDomainDestination(
  appState: AppState,
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
  targetDomainId: string,
): ArrangeGuidedTransferResolution {
  const destination = getDestinationSpaceInDomain(appState, targetDomainId)
  if (!destination) return { type: 'none' }

  const onlySpace = getOnlySpaceInDomain(appState, targetDomainId)
  const targetSpace = onlySpace ?? destination.space

  if (request.item.type === 'parent') {
    return resolveParentDomainDestination(request, carriedPreview, targetDomainId, targetSpace.id)
  }

  if (onlySpace) {
    return resolveSubTabSpaceDestination(appState, request, carriedPreview, targetDomainId, onlySpace.id, 2)
  }

  return promptResolution(
    createArrangeDomainDestinationPromptState(
      request,
      carriedPreview,
      targetDomainId,
      targetSpace.id,
      'space-or-parent',
    ),
  )
}

export function resolveArrangeHierarchyDrop(
  appState: AppState,
  request: ArrangeHierarchyDropRequest,
  carriedPreview: TabArrangeDragPreview,
): ArrangeGuidedTransferResolution {
  if (request.target.type === 'space') {
    const target = request.target
    if (request.item.type === 'parent') {
      return {
        type: 'move-parent-to-space',
        request,
        targetDomainId: target.domainId,
        targetSpaceId: target.spaceId,
      }
    }
    return resolveSubTabSpaceDestination(appState, request, carriedPreview, target.domainId, target.spaceId, 1)
  }

  return resolveArrangeDomainDestination(appState, request, carriedPreview, request.target.domainId)
}

export function resolveArrangePromptSpaceSelection(
  appState: AppState,
  prompt: ArrangeDestinationPromptState,
  spaceId: string,
): ArrangeGuidedTransferResolution {
  if (!promptAllowsSpaceSelection(prompt)) return { type: 'none' }
  if (prompt.request.item.type === 'parent') {
    return resolveParentDomainDestination(prompt.request, prompt.carriedPreview, prompt.targetDomainId, spaceId)
  }

  return resolveSubTabSpaceDestination(
    appState,
    prompt.request,
    prompt.carriedPreview,
    prompt.targetDomainId,
    spaceId,
    prompt.revealHierarchyLevel,
    prompt.mode === 'space-or-parent' ? 'space-or-parent' : 'parent',
  )
}
