import { describe, expect, it } from 'vitest'
import {
  buildRetainedAisleEditorIds,
  getAislePreviewMarkdown,
} from './aisle-editor-retention'
import type { PendingContent, ResolvedNoteAisle } from '../types/app'

describe('aisle editor retention helpers', () => {
  it('retains only active and near-visible aisles', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      activeAisleId: 'c',
      nearVisibleAisleIds: ['e'],
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
