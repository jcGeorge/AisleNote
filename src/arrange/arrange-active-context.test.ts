import { describe, expect, it } from 'vitest'
import type { ArrangeSelectionState } from '../types/app'
import { resolveArrangeSelectionClick } from './arrange-active-context'

describe('arrange active context selection resolution', () => {
  it('returns the next selection and replacement when the active item is toggled out', () => {
    const selection: ArrangeSelectionState = {
      kind: 'domain',
      parentTabId: null,
      domainId: null,
      selectedIds: ['domain-a', 'domain-b', 'domain-c'],
      anchorId: 'domain-a',
    }

    const resolution = resolveArrangeSelectionClick({
      selection,
      kind: 'domain',
      itemId: 'domain-a',
      orderedIds: ['domain-a', 'domain-b', 'domain-c'],
      currentId: 'domain-a',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(resolution.nextSelection.selectedIds).toEqual(['domain-b', 'domain-c'])
    expect(resolution.activeReplacementId).toBe('domain-c')
  })

  it('does not request active replacement for range selection or non-active toggles', () => {
    const selection: ArrangeSelectionState = {
      kind: 'space',
      parentTabId: null,
      domainId: 'domain-a',
      selectedIds: ['space-a', 'space-b', 'space-c'],
      anchorId: 'space-a',
    }

    expect(
      resolveArrangeSelectionClick({
        selection,
        kind: 'space',
        domainId: 'domain-a',
        itemId: 'space-c',
        orderedIds: ['space-a', 'space-b', 'space-c'],
        currentId: 'space-a',
        modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
      }).activeReplacementId,
    ).toBeNull()
    expect(
      resolveArrangeSelectionClick({
        selection,
        kind: 'space',
        domainId: 'domain-a',
        itemId: 'space-b',
        orderedIds: ['space-a', 'space-b', 'space-c'],
        currentId: 'space-a',
        modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
      }).activeReplacementId,
    ).toBeNull()
  })
})
