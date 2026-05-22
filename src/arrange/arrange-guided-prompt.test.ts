import { describe, expect, it } from 'vitest'
import type { ArrangeHierarchyDropRequest, TabArrangeDragPreview } from '../types/app'
import {
  copyTabArrangeCarryPreview,
  createArrangeDomainDestinationPromptState,
  createArrangeDestinationPromptState,
  getArrangeDestinationPromptMessage,
  isSubTabDropOnSourceSpace,
  promptAllowsSpaceSelection,
} from './arrange-guided-prompt'

const parentPreview: TabArrangeDragPreview = {
  item: { type: 'tab', tabId: 'parent-a' },
  label: 'Parent A + 2',
  variant: 'parent',
  currentX: 100,
  currentY: 80,
  offsetX: 12,
  offsetY: 7,
  width: 140,
  height: 32,
}

const subtabPreview: TabArrangeDragPreview = {
  item: { type: 'subtab', parentTabId: 'parent-a', subTabId: 'sub-a' },
  label: 'Sub A + 1',
  variant: 'subtab',
  currentX: 90,
  currentY: 70,
  offsetX: 9,
  offsetY: 6,
  width: 120,
  height: 32,
}

const parentToDomain: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'space-a',
  item: { type: 'parent', parentTabIds: ['parent-a'] },
  target: { type: 'domain', domainId: 'domain-b' },
}

const subtabToDomain: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'space-a',
  item: { type: 'subtab', parentTabId: 'parent-a', subTabIds: ['sub-a'] },
  target: { type: 'domain', domainId: 'domain-b' },
}

const subtabToSpace: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'space-a',
  item: { type: 'subtab', parentTabId: 'parent-a', subTabIds: ['sub-a'] },
  target: { type: 'space', domainId: 'domain-a', spaceId: 'space-b' },
}

const subtabToSourceSpace: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'space-a',
  item: { type: 'subtab', parentTabId: 'parent-a', subTabIds: ['sub-a'] },
  target: { type: 'space', domainId: 'domain-a', spaceId: 'space-a' },
}

const parentToSpace: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'space-a',
  item: { type: 'parent', parentTabIds: ['parent-a'] },
  target: { type: 'space', domainId: 'domain-a', spaceId: 'space-b' },
}

describe('guided arrange prompt carry preview', () => {
  it('copies the active tab drag preview at release coordinates', () => {
    const carried = copyTabArrangeCarryPreview(parentPreview, 220, 150)

    expect(carried).not.toBe(parentPreview)
    expect(carried.item).not.toBe(parentPreview.item)
    expect(carried).toEqual({
      ...parentPreview,
      item: { type: 'tab', tabId: 'parent-a' },
      currentX: 220,
      currentY: 150,
    })
  })

  it('creates a space-or-placement prompt with the carried preview for parent-to-domain drops', () => {
    const prompt = createArrangeDomainDestinationPromptState(parentToDomain, parentPreview, 'domain-b', 'space-active')

    expect(prompt).toMatchObject({
      request: parentToDomain,
      mode: 'space-or-parent-placement',
      targetDomainId: 'domain-b',
      targetSpaceId: 'space-active',
      revealHierarchyLevel: 2,
      carriedPreview: parentPreview,
    })
    expect(promptAllowsSpaceSelection(prompt)).toBe(true)
  })

  it('creates a space-or-parent prompt with the carried preview for subtab-to-domain drops', () => {
    const prompt = createArrangeDomainDestinationPromptState(subtabToDomain, subtabPreview, 'domain-b', 'space-active')

    expect(prompt).toMatchObject({
      request: subtabToDomain,
      mode: 'space-or-parent',
      targetDomainId: 'domain-b',
      targetSpaceId: 'space-active',
      revealHierarchyLevel: 2,
      carriedPreview: subtabPreview,
    })
    expect(promptAllowsSpaceSelection(prompt)).toBe(true)
  })

  it('creates a parent-selection prompt with spaces-only reveal for subtab-to-space drops', () => {
    const prompt = createArrangeDestinationPromptState(subtabToSpace, subtabPreview)

    expect(prompt).toMatchObject({
      request: subtabToSpace,
      mode: 'parent',
      targetDomainId: 'domain-a',
      targetSpaceId: 'space-b',
      revealHierarchyLevel: 1,
      carriedPreview: subtabPreview,
    })
    expect(prompt && promptAllowsSpaceSelection(prompt)).toBe(false)
  })

  it('creates a parent-selection prompt when a domain drop resolves to a fixed space', () => {
    const prompt = createArrangeDomainDestinationPromptState(
      subtabToDomain,
      subtabPreview,
      'domain-b',
      'space-only',
      'parent',
    )

    expect(prompt).toMatchObject({
      request: subtabToDomain,
      mode: 'parent',
      targetDomainId: 'domain-b',
      targetSpaceId: 'space-only',
      revealHierarchyLevel: 2,
      carriedPreview: subtabPreview,
    })
  })

  it('does not create a prompt for parent-to-space drops because the move completes immediately', () => {
    expect(createArrangeDestinationPromptState(parentToSpace, parentPreview)).toBeNull()
  })

  it('returns prompt messages for each guided destination mode', () => {
    expect(getArrangeDestinationPromptMessage('space-or-parent-placement')).toBe(
      'now select a space or place the parent tab',
    )
    expect(getArrangeDestinationPromptMessage('space-or-parent')).toBe('now select a space or parent tab')
    expect(getArrangeDestinationPromptMessage('parent')).toBe('now select a parent tab')
  })

  it('identifies sub-tab drops onto their own source space as drag-ending no-ops', () => {
    expect(isSubTabDropOnSourceSpace(subtabToSourceSpace)).toBe(true)
    expect(isSubTabDropOnSourceSpace(subtabToSpace)).toBe(false)
    expect(isSubTabDropOnSourceSpace(subtabToDomain)).toBe(false)
    expect(isSubTabDropOnSourceSpace(parentToSpace)).toBe(false)
  })
})
