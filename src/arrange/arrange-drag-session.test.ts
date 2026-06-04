import { describe, expect, it } from 'vitest'
import type { ArrangeModeState } from '../types/app'
import {
  clearArrangeModeLiveDragState,
  shouldClearArrangeSelectionAfterLiveDragFinish,
  type ArrangeLiveDragFinishKind,
  type ArrangeLiveDragItemKind,
} from './arrange-drag-session'

const activeMode: ArrangeModeState = {
  active: true,
  scope: 'tabs',
  source: 'press',
  dragItem: { type: 'tab', tabId: 'parent-a' },
  overParentTabId: 'parent-b',
  overParentInsert: 'after',
  overSubTabId: 'subtab-b',
  overSubTabInsert: 'before',
  overSpaceId: 'space-b',
  overSpaceInsert: 'after',
  overDomainId: 'domain-b',
  overDomainInsert: 'before',
}

describe('arrange live drag session policy', () => {
  it.each([
    ['parent', 'noop', false],
    ['parent', 'reorder', false],
    ['parent', 'trash', true],
    ['parent', 'blocked', true],
    ['parent', 'hierarchy-drop', true],
    ['subtab', 'noop', false],
    ['subtab', 'reorder', false],
    ['subtab', 'trash', true],
    ['subtab', 'hierarchy-drop', true],
    ['space', 'noop', false],
    ['space', 'reorder', true],
    ['space', 'trash', true],
    ['space', 'blocked', true],
    ['space', 'cross-domain-move', true],
    ['domain', 'noop', false],
    ['domain', 'reorder', true],
    ['domain', 'trash', true],
    ['domain', 'blocked', true],
  ] satisfies Array<[ArrangeLiveDragItemKind, ArrangeLiveDragFinishKind, boolean]>)(
    'selection clear policy for %s %s',
    (itemKind, finishKind, expected) => {
      expect(shouldClearArrangeSelectionAfterLiveDragFinish({ itemKind, finishKind })).toBe(expected)
    },
  )

  it('clears only the requested live-drag drop targets', () => {
    expect(clearArrangeModeLiveDragState(activeMode, 'domains')).toMatchObject({
      dragItem: null,
      overParentTabId: 'parent-b',
      overSpaceId: 'space-b',
      overDomainId: null,
      overDomainInsert: null,
    })
    expect(clearArrangeModeLiveDragState(activeMode, 'spaces')).toMatchObject({
      dragItem: null,
      overParentTabId: 'parent-b',
      overSpaceId: null,
      overSpaceInsert: null,
      overDomainId: 'domain-b',
    })
    expect(clearArrangeModeLiveDragState(activeMode, 'tabs')).toMatchObject({
      dragItem: null,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: null,
      overSubTabInsert: null,
      overSpaceId: 'space-b',
    })
    expect(clearArrangeModeLiveDragState(activeMode, 'all')).toMatchObject({
      dragItem: null,
      overParentTabId: null,
      overSubTabId: null,
      overSpaceId: null,
      overDomainId: null,
    })
  })
})
