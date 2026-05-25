import { describe, expect, it } from 'vitest'
import {
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  type AisleStructuralSnapshot,
} from './aisle-structural-history'
import type { ResolvedNoteAisle } from '../types/app'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'

const location = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-1',
  subTabId: null,
}

const aisle = (id: string, markdown: string, aisleBodyId = id): ResolvedNoteAisle => ({ id, aisleBodyId, markdown })

function createSnapshot(aisles: ResolvedNoteAisle[], activeAisleId = aisles[0]?.id ?? ''): AisleStructuralSnapshot {
  return {
    location,
    locationKey: 'domain-1::space-1::tab-1::__home__',
    noteBodyId: 'body-1',
    aisles,
    activeAisleId,
    cursorLocation: null,
  }
}

describe('aisle structural history', () => {
  it('allows undoing an added aisle from the exact post-add state', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
  })

  it('allows aisle undo after the editor already restored pre-add markdown', () => {
    const before = createSnapshot([aisle('aisle-1', 'keep this selected text')])
    const after = createSnapshot([aisle('aisle-1', 'keep this'), aisle('aisle-2', 'selected text')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'keep this selected text'),
      aisle('aisle-2', 'selected text'),
    ])).toBe(true)
  })

  it('does not remove an added aisle after its own content changed', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'typed later'),
    ])).toBe(false)
  })

  it('allows undoing an added aisle after blank placeholder-only editor content', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'first'),
      aisle('aisle-2', `${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`),
    ])).toBe(true)
  })

  it('does not apply when another structural edit changed the aisle order', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-2', ''),
      aisle('aisle-1', 'first'),
    ])).toBe(false)
  })

  it('allows undoing and redoing a batch aisle edit from exact source states', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
      aisle('aisle-3', 'third'),
    ])
    const after = createSnapshot([
      aisle('aisle-3', 'third'),
      aisle('aisle-1', 'first'),
      aisle('aisle-4', ''),
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('allows batch aisle undo and redo after aisle text changed', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first before', 'body-1'),
      aisle('aisle-2', 'second before', 'body-2'),
    ])
    const after = createSnapshot([
      aisle('aisle-2', 'second before', 'body-2'),
      aisle('aisle-1', 'first before', 'body-1'),
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-2', 'second edited', 'body-2'),
      aisle('aisle-1', 'first edited', 'body-1'),
    ])).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      aisle('aisle-1', 'first edited again', 'body-1'),
      aisle('aisle-2', 'second edited again', 'body-2'),
    ])).toBe(true)
  })

  it('allows exact undo and redo of aisle body de-couple edits', () => {
    const before = createSnapshot([aisle('aisle-1', 'current text', 'shared-body')])
    const after = createSnapshot([aisle('aisle-1', 'current text', 'independent-body')])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('blocks aisle body de-couple undo after the independent text changed', () => {
    const before = createSnapshot([aisle('aisle-1', 'current text', 'shared-body')])
    const after = createSnapshot([aisle('aisle-1', 'current text', 'independent-body')])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'edited after de-couple', 'independent-body'),
    ])).toBe(false)
  })

  it('rejects stale batch edits after another reorder changed the source state', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
      aisle('aisle-3', 'third'),
    ])
    const after = createSnapshot([
      aisle('aisle-3', 'third'),
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      aisle('aisle-2', 'second'),
      aisle('aisle-1', 'first'),
      aisle('aisle-3', 'third'),
    ])).toBe(false)
  })
})
