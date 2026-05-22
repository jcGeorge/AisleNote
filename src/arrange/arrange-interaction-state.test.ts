import { describe, expect, it } from 'vitest'
import type { ArrangeDestinationPromptState } from './arrange-guided-prompt'
import {
  areArrangeRailControlsDisabled,
  areNavigationContextMenusDisabled,
  getArrangeInteractionState,
  isArrangeGuidedCarryActive,
  isArrangeLiveDragActive,
  isArrangeTrashActionActive,
} from './arrange-interaction-state'

const prompt = {
  request: {
    sourceDomainId: 'domain-a',
    sourceSpaceId: 'space-a',
    item: { type: 'parent', parentTabIds: ['tab-a'] },
    target: { type: 'domain', domainId: 'domain-b' },
  },
  mode: 'space-or-parent-placement',
  targetDomainId: 'domain-b',
  targetSpaceId: 'space-b',
  revealHierarchyLevel: 2,
  carriedPreview: {
    item: { type: 'tab', tabId: 'tab-a' },
    label: 'Tab A',
    variant: 'parent',
    currentX: 20,
    currentY: 30,
    offsetX: 4,
    offsetY: 5,
    width: 80,
    height: 28,
  },
} satisfies ArrangeDestinationPromptState

describe('arrange interaction state', () => {
  it('derives idle affordances when no drag or guided carry is active', () => {
    const interaction = getArrangeInteractionState(null, null)

    expect(interaction.mode).toBe('idle')
    expect(isArrangeLiveDragActive(interaction)).toBe(false)
    expect(isArrangeGuidedCarryActive(interaction)).toBe(false)
    expect(isArrangeTrashActionActive(interaction)).toBe(false)
    expect(areArrangeRailControlsDisabled(interaction)).toBe(false)
    expect(areNavigationContextMenusDisabled(interaction)).toBe(false)
  })

  it('treats live drag as trash-active and disables rail controls/context menus', () => {
    const interaction = getArrangeInteractionState({ type: 'space', spaceId: 'space-a' }, null)

    expect(interaction).toEqual({ mode: 'live-drag', drag: { item: { type: 'space', spaceId: 'space-a' } } })
    expect(isArrangeLiveDragActive(interaction)).toBe(true)
    expect(isArrangeTrashActionActive(interaction)).toBe(true)
    expect(areArrangeRailControlsDisabled(interaction)).toBe(true)
    expect(areNavigationContextMenusDisabled(interaction)).toBe(true)
  })

  it('treats guided carry as trash-active while leaving navigation menus governed by live drag only', () => {
    const interaction = getArrangeInteractionState(null, prompt)

    expect(interaction).toEqual({ mode: 'guided-carry', carry: { prompt } })
    expect(isArrangeGuidedCarryActive(interaction)).toBe(true)
    expect(isArrangeTrashActionActive(interaction)).toBe(true)
    expect(areArrangeRailControlsDisabled(interaction)).toBe(true)
    expect(areNavigationContextMenusDisabled(interaction)).toBe(false)
  })

  it('prioritizes the live drag session if both inputs are temporarily present', () => {
    expect(getArrangeInteractionState({ type: 'domain', domainId: 'domain-a' }, prompt)).toEqual({
      mode: 'live-drag',
      drag: { item: { type: 'domain', domainId: 'domain-a' } },
    })
  })
})

