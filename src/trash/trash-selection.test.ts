import { describe, expect, it } from 'vitest'
import type { TrashDomainBucket, TrashParentBucket, TrashSpaceBucket } from '../types/app'
import type { TrashSelectionState } from './trash-selection'
import {
  EMPTY_TRASH_SELECTION,
  getEffectiveTrashContextTargets,
  getTrashDomainTargets,
  getTrashSelectionActiveReplacementId,
  getTrashParentTarget,
  getTrashSpaceTargets,
  getTrashSpaceTarget,
  getTrashTargetSelectionId,
  getTrashTargetsForSelection,
  isTrashDomainSelectable,
  isTrashSpaceSelectable,
  updateTrashSelectionForClick,
} from './trash-selection'

function deletedDomain(id: string): TrashDomainBucket {
  return {
    id: `deleted-domain:${id}`,
    title: id,
    source: 'deleted-domain',
    domainId: `domain-${id}`,
    deletedDomainEntryId: id,
    spaces: [],
  }
}

function liveDomain(id: string): TrashDomainBucket {
  return {
    id: `live-domain:${id}`,
    title: id,
    source: 'live',
    domainId: id,
    deletedDomainEntryId: null,
    spaces: [],
  }
}

function liveSpace(id: string, parentTabs: TrashParentBucket[] = []): TrashSpaceBucket {
  return {
    id: `live-space:domain-a:space-${id}`,
    title: id,
    source: 'live',
    domainId: 'domain-a',
    spaceId: `space-${id}`,
    deletedSpaceEntryId: null,
    deletedDomainEntryId: null,
    space: {
      id: `space-${id}`,
      name: id,
      settings: { autoRemoveDeletedDays: 7 },
      data: { activeTabId: 'tab-a', tabs: [], deletedTabs: [], deletedSubTabs: [] },
    },
    parentTabs,
  }
}

function deletedSpace(id: string): TrashSpaceBucket {
  return {
    id: `deleted-space:${id}`,
    title: id,
    source: 'deleted-space',
    domainId: 'domain-a',
    spaceId: `space-${id}`,
    deletedSpaceEntryId: id,
    deletedDomainEntryId: null,
    space: {
      id: `space-${id}`,
      name: id,
      settings: { autoRemoveDeletedDays: 7 },
      data: { activeTabId: 'tab-a', tabs: [], deletedTabs: [], deletedSubTabs: [] },
    },
    parentTabs: [],
  }
}

function deletedDomainSpace(id: string): TrashSpaceBucket {
  return {
    id: `deleted-domain-live-space:deleted-domain-a:space-${id}`,
    title: id,
    source: 'deleted-domain-space',
    domainId: 'domain-a',
    spaceId: `space-${id}`,
    deletedSpaceEntryId: null,
    deletedDomainEntryId: 'deleted-domain-a',
    space: {
      id: `space-${id}`,
      name: id,
      settings: { autoRemoveDeletedDays: 7 },
      data: { activeTabId: 'tab-a', tabs: [], deletedTabs: [], deletedSubTabs: [] },
    },
    parentTabs: [],
  }
}

function parent(id: string): TrashParentBucket {
  return {
    id,
    title: id,
    source: 'deleted-tab',
    deletedTabEntryId: id,
    parentTabId: `parent-${id}`,
    homeContent: '',
    subTabs: [
      { id: `${id}-sub-a`, title: 'sub a', noteBodyId: 'body-a', content: '' },
      { id: `${id}-sub-b`, title: 'sub b', noteBodyId: 'body-b', content: '' },
    ],
  }
}

describe('trash selection helpers', () => {
  it('selects ranges with shift click', () => {
    const first = updateTrashSelectionForClick({
      selection: EMPTY_TRASH_SELECTION,
      kind: 'domain',
      itemId: 'deleted-domain:a',
      orderedIds: ['deleted-domain:a', 'deleted-domain:b', 'deleted-domain:c'],
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const ranged = updateTrashSelectionForClick({
      selection: first,
      kind: 'domain',
      itemId: 'deleted-domain:c',
      orderedIds: ['deleted-domain:a', 'deleted-domain:b', 'deleted-domain:c'],
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(ranged.ids).toEqual(['deleted-domain:a', 'deleted-domain:b', 'deleted-domain:c'])
  })

  it('selects a shift range from the current active item without a prior selection', () => {
    const selected = updateTrashSelectionForClick({
      selection: EMPTY_TRASH_SELECTION,
      kind: 'domain',
      itemId: 'deleted-domain:c',
      currentId: 'deleted-domain:a',
      orderedIds: ['deleted-domain:a', 'deleted-domain:b', 'deleted-domain:c'],
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(selected.ids).toEqual(['deleted-domain:a', 'deleted-domain:b', 'deleted-domain:c'])
    expect(selected.anchorId).toBe('deleted-domain:a')
  })

  it('selects shift ranges across mixed visible trash space buckets in both directions', () => {
    const orderedIds = ['live-space:domain-a:space-a', 'deleted-space:b', 'live-space:domain-a:space-c']
    const leftToRight = updateTrashSelectionForClick({
      selection: EMPTY_TRASH_SELECTION,
      kind: 'space',
      itemId: 'live-space:domain-a:space-c',
      currentId: 'live-space:domain-a:space-a',
      orderedIds,
      scopeId: 'live-domain:domain-a',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })
    const rightToLeft = updateTrashSelectionForClick({
      selection: EMPTY_TRASH_SELECTION,
      kind: 'space',
      itemId: 'live-space:domain-a:space-a',
      currentId: 'live-space:domain-a:space-c',
      orderedIds,
      scopeId: 'live-domain:domain-a',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(leftToRight.ids).toEqual(orderedIds)
    expect(rightToLeft.ids).toEqual(orderedIds)
  })

  it('seeds command selection with the current active item', () => {
    const selected = updateTrashSelectionForClick({
      selection: EMPTY_TRASH_SELECTION,
      kind: 'parent',
      itemId: 'parent-b',
      currentId: 'parent-a',
      orderedIds: ['parent-a', 'parent-b', 'parent-c'],
      scopeId: 'deleted-space:space-a',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(selected).toMatchObject({
      kind: 'parent',
      ids: ['parent-a', 'parent-b'],
      anchorId: 'parent-b',
      scopeId: 'deleted-space:space-a',
    })
  })

  it('returns a replacement id when command clicking the active selected item off', () => {
    const previous: TrashSelectionState = {
      kind: 'subtab',
      ids: ['sub-a', 'sub-b'],
      anchorId: 'sub-b',
      scopeId: 'parent-a',
    }
    const next = updateTrashSelectionForClick({
      selection: previous,
      kind: 'subtab',
      itemId: 'sub-a',
      currentId: 'sub-a',
      orderedIds: ['sub-a', 'sub-b'],
      scopeId: 'parent-a',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })

    expect(next.ids).toEqual(['sub-b'])
    expect(
      getTrashSelectionActiveReplacementId({
        previousSelection: previous,
        nextSelection: next,
        kind: 'subtab',
        itemId: 'sub-a',
        currentId: 'sub-a',
        scopeId: 'parent-a',
        modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
      }),
    ).toBe('sub-b')
  })

  it('toggles items with command/control click', () => {
    const selected = updateTrashSelectionForClick({
      selection: {
        kind: 'space',
        ids: ['deleted-space:a'],
        anchorId: 'deleted-space:a',
        scopeId: 'live-domain:domain-a',
      },
      kind: 'space',
      itemId: 'deleted-space:a',
      orderedIds: ['deleted-space:a'],
      scopeId: 'live-domain:domain-a',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(selected).toBe(EMPTY_TRASH_SELECTION)
  })

  it('expands selectable live trash containers to concrete descendant targets', () => {
    const deletedParent = parent('parent-a')
    const emptyLiveSpace = liveSpace('empty')
    const liveSpaceWithTrash = liveSpace('with-trash', [deletedParent])
    const standaloneDeletedSpace = deletedSpace('space-a')
    const liveDomainWithTrash: TrashDomainBucket = {
      ...liveDomain('a'),
      spaces: [emptyLiveSpace, liveSpaceWithTrash, standaloneDeletedSpace],
    }
    const domains = [liveDomainWithTrash, deletedDomain('b')]
    const spaces = [emptyLiveSpace, liveSpaceWithTrash, standaloneDeletedSpace]
    const parents = [parent('parent-a')]

    expect(
      getTrashTargetsForSelection({
        selection: { kind: 'domain', ids: ['live-domain:a', 'deleted-domain:b'], anchorId: 'deleted-domain:b', scopeId: null },
        domains,
        spaces,
        parents,
        selectedParent: parents[0],
      }),
    ).toEqual([
      getTrashParentTarget(deletedParent),
      { type: 'trash-space', source: 'deleted-space', deletedSpaceEntryId: 'space-a', deletedDomainEntryId: undefined, domainId: 'domain-a', spaceId: 'space-space-a' },
      { type: 'trash-domain', deletedDomainEntryId: 'b', domainId: 'domain-b' },
    ])

    expect(isTrashSpaceSelectable(emptyLiveSpace)).toBe(false)
    expect(isTrashSpaceSelectable(liveSpaceWithTrash)).toBe(true)
    expect(isTrashDomainSelectable(liveDomainWithTrash)).toBe(true)
    expect(getTrashSpaceTargets(liveSpaceWithTrash)).toEqual([getTrashParentTarget(deletedParent)])
    expect(getTrashDomainTargets(liveDomainWithTrash)).toEqual([
      getTrashParentTarget(deletedParent),
      { type: 'trash-space', source: 'deleted-space', deletedSpaceEntryId: 'space-a', deletedDomainEntryId: undefined, domainId: 'domain-a', spaceId: 'space-space-a' },
    ])
    expect(getTrashSpaceTarget(standaloneDeletedSpace)).toMatchObject({ type: 'trash-space', deletedSpaceEntryId: 'space-a' })
    expect(getTrashParentTarget(parents[0])).toMatchObject({ type: 'trash-tab', deletedTabEntryId: 'parent-a' })
  })

  it('treats deleted-domain child spaces without deleted-space entries as concrete targets', () => {
    const space = deletedDomainSpace('a')
    const target = getTrashSpaceTarget(space)

    expect(isTrashSpaceSelectable(space)).toBe(true)
    expect(target).toEqual({
      type: 'trash-space',
      source: 'deleted-domain-space',
      deletedSpaceEntryId: undefined,
      deletedDomainEntryId: 'deleted-domain-a',
      domainId: 'domain-a',
      spaceId: 'space-a',
    })
    expect(getTrashTargetSelectionId(target!)).toBe('deleted-domain-live-space:deleted-domain-a:space-a')
  })

  it('uses the active trash selection when the context target is selected', () => {
    const targets = [getTrashParentTarget(parent('parent-a')), getTrashParentTarget(parent('parent-b'))]
    const effective = getEffectiveTrashContextTargets(targets[1], targets, {
      kind: 'parent',
      ids: ['parent-a', 'parent-b'],
      anchorId: 'parent-a',
      scopeId: 'deleted-space:space-a',
    })

    expect(effective).toEqual(targets)
    expect(getTrashTargetSelectionId(targets[1])).toBe('parent-b')
  })
})
