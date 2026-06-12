import { describe, expect, it } from 'vitest'
import {
  buildRetainedAisleEditorIds,
  getAislePreviewMarkdown,
} from './aisle-editor-retention'
import type { PendingContent, ResolvedNoteAisle } from '../types/app'

describe('aisle editor retention helpers', () => {
  it('retains only the active aisle by default', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      activeAisleId: 'c',
      nearVisibleAisleIds: ['e'],
    })

    expect(Array.from(retained).sort()).toEqual(['c'])
  })

  it('can opt in to retaining near-visible aisles', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      activeAisleId: 'c',
      nearVisibleAisleIds: ['e'],
      retainNearVisibleAisles: true,
    })

    expect(Array.from(retained).sort()).toEqual(['c', 'e'])
  })

  it('excludes inactive aisles when they are not visible', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e'],
      activeAisleId: 'a',
      nearVisibleAisleIds: [],
    })

    expect(Array.from(retained).sort()).toEqual(['a'])
  })

  it('can retain a recent aisle for ablation testing', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd'],
      activeAisleId: 'c',
      nearVisibleAisleIds: [],
      recentAisleIds: ['b', 'missing'],
    })

    expect(Array.from(retained).sort()).toEqual(['b', 'c'])
  })

  it('can retain multiple recent aisles without mounting unknown aisles', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd'],
      activeAisleId: 'd',
      recentAisleIds: ['c', 'b', 'a', 'missing'],
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('prefers pending and last editor markdown for fallback previews', () => {
    const aisle: ResolvedNoteAisle = { id: 'aisle-1', aisleBodyId: 'body-1', markdown: 'stored' }
    const pendingContent: PendingContent = {
      noteBodyId: 'note-1',
      spaceId: 'space-1',
      tabId: 'tab-1',
      subTabId: null,
      aisleId: 'aisle-1',
      aisleBodyId: 'body-1',
      markdown: 'pending',
    }

    expect(
      getAislePreviewMarkdown({
        aisle,
        pendingContent: new Map([['body-1', pendingContent]]),
        lastEditorMarkdownByAisle: new Map([['body-1', 'last']]),
      }),
    ).toBe('pending')
    expect(
      getAislePreviewMarkdown({
        aisle,
        pendingContent: new Map(),
        lastEditorMarkdownByAisle: new Map([['body-1', 'last']]),
      }),
    ).toBe('last')
  })
})
