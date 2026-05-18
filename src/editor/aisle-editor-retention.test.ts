import { describe, expect, it } from 'vitest'
import {
  buildRetainedAisleEditorIds,
  getAislePreviewMarkdown,
  updateRecentAisleIds,
} from './aisle-editor-retention'
import type { NoteAisle, PendingContent } from '../types/app'

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
    const aisle: NoteAisle = { id: 'aisle-1', markdown: 'stored' }
    const pendingContent: PendingContent = {
      spaceId: 'space-1',
      tabId: 'tab-1',
      subTabId: null,
      aisleId: 'aisle-1',
      markdown: 'pending',
    }

    expect(
      getAislePreviewMarkdown({
        aisle,
        pendingContent,
        lastEditorMarkdownByAisle: new Map([['aisle-1', 'last']]),
      }),
    ).toBe('pending')
    expect(
      getAislePreviewMarkdown({
        aisle,
        pendingContent: null,
        lastEditorMarkdownByAisle: new Map([['aisle-1', 'last']]),
      }),
    ).toBe('last')
  })
})
