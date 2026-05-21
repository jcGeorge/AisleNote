import { describe, expect, it } from 'vitest'
import {
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  type AisleStructuralSnapshot,
} from './aisle-structural-history'
import type { NoteAisle } from '../types/app'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'

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

  it('allows undoing an added aisle after blank placeholder-only editor content', () => {
    const before = createSnapshot([{ id: 'aisle-1', markdown: 'first' }])
    const after = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: '' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: `${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}` },
    ])).toBe(true)
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

  it('allows undoing and redoing a batch aisle edit from exact source states', () => {
    const before = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: 'second' },
      { id: 'aisle-3', markdown: 'third' },
    ])
    const after = createSnapshot([
      { id: 'aisle-3', markdown: 'third' },
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-4', markdown: '' },
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('allows batch aisle undo and redo after aisle text changed', () => {
    const before = createSnapshot([
      { id: 'aisle-1', aisleBodyId: 'body-1', markdown: 'first before' },
      { id: 'aisle-2', aisleBodyId: 'body-2', markdown: 'second before' },
    ])
    const after = createSnapshot([
      { id: 'aisle-2', aisleBodyId: 'body-2', markdown: 'second before' },
      { id: 'aisle-1', aisleBodyId: 'body-1', markdown: 'first before' },
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-2', aisleBodyId: 'body-2', markdown: 'second edited' },
      { id: 'aisle-1', aisleBodyId: 'body-1', markdown: 'first edited' },
    ])).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      { id: 'aisle-1', aisleBodyId: 'body-1', markdown: 'first edited again' },
      { id: 'aisle-2', aisleBodyId: 'body-2', markdown: 'second edited again' },
    ])).toBe(true)
  })

  it('allows exact undo and redo of aisle body de-couple edits', () => {
    const before = createSnapshot([
      { id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'current text' },
    ])
    const after = createSnapshot([
      { id: 'aisle-1', aisleBodyId: 'independent-body', markdown: 'current text' },
    ])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('blocks aisle body de-couple undo after the independent text changed', () => {
    const before = createSnapshot([
      { id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'current text' },
    ])
    const after = createSnapshot([
      { id: 'aisle-1', aisleBodyId: 'independent-body', markdown: 'current text' },
    ])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      { id: 'aisle-1', aisleBodyId: 'independent-body', markdown: 'edited after de-couple' },
    ])).toBe(false)
  })

  it('rejects stale batch edits after another reorder changed the source state', () => {
    const before = createSnapshot([
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: 'second' },
      { id: 'aisle-3', markdown: 'third' },
    ])
    const after = createSnapshot([
      { id: 'aisle-3', markdown: 'third' },
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-2', markdown: 'second' },
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      { id: 'aisle-2', markdown: 'second' },
      { id: 'aisle-1', markdown: 'first' },
      { id: 'aisle-3', markdown: 'third' },
    ])).toBe(false)
  })
})
