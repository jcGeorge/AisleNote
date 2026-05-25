import { describe, expect, it } from 'vitest'
import {
  buildRetainedAisleEditorIds,
  getAislePreviewMarkdown,
  updateRecentAisleIds,
} from './aisle-editor-retention'
import type { PendingContent, ResolvedNoteAisle } from '../types/app'

describe('aisle editor retention helpers', () => {
  it('retains active, near-visible, adjacent, and recent aisles', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      activeAisleId: 'c',
      nearVisibleAisleIds: ['e'],
      recentAisleIds: ['a', 'f'],
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('excludes far inactive aisles after the cache no longer retains them', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e'],
      activeAisleId: 'a',
      nearVisibleAisleIds: [],
      recentAisleIds: [],
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b'])
  })

  it('maintains a most-recent aisle cache with a fixed size', () => {
    expect(updateRecentAisleIds(['b', 'c'], 'a')).toEqual(['a', 'b'])
    expect(updateRecentAisleIds(['a', 'b'], 'b')).toEqual(['b', 'a'])
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
