import { describe, expect, it } from 'vitest'
import {
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  type AisleStructuralSnapshot,
} from './aisle-structural-history'
import type { NoteAisle } from '../types/app'

const location = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-1',
  subTabId: null,
}

function createSnapshot(aisles: NoteAisle[], activeAisleId = aisles[0]?.id ?? ''): AisleStructuralSnapshot {
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
    const before = createSnapshot([{ id: 'aisle-1', markdown: 'first' }])
    const after = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: '' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
  })

  it('allows aisle undo after the editor already restored pre-add markdown', () => {
    const before = createSnapshot([{ id: 'aisle-1', markdown: 'keep this selected text' }])
    const after = createSnapshot([
      { id: 'aisle-1', markdown: 'keep this' },
      { id: 'aisle-2', markdown: 'selected text' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-1', markdown: 'keep this selected text' },
      { id: 'aisle-2', markdown: 'selected text' },
    ])).toBe(true)
  })

  it('does not remove an added aisle after its own content changed', () => {
    const before = createSnapshot([{ id: 'aisle-1', markdown: 'first' }])
    const after = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: '' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: 'typed later' },
    ])).toBe(false)
  })

  it('does not apply when another structural edit changed the aisle order', () => {
    const before = createSnapshot([{ id: 'aisle-1', markdown: 'first' }])
    const after = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: '' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-2', markdown: '' },
      { id: 'aisle-1', markdown: 'first' },
    ])).toBe(false)
  })
})
