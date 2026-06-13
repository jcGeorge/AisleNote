import { describe, expect, it } from 'vitest'
import {
  buildRetainedAisleEditorIds,
  buildRetainedAisleEditorIdsForCore,
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

  it('can retain background-mounted aisles for small notes after first paint', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd'],
      activeAisleId: 'b',
      backgroundAisleIds: ['a', 'b', 'c', 'd'],
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('can retain multiple recent aisles without mounting unknown aisles', () => {
    const retained = buildRetainedAisleEditorIds({
      aisleIds: ['a', 'b', 'c', 'd'],
      activeAisleId: 'd',
      recentAisleIds: ['c', 'b', 'a', 'missing'],
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps only the active CodeMirror aisle even when other aisles are near-visible or recent', () => {
    const retained = buildRetainedAisleEditorIdsForCore({
      editorCore: 'codemirror',
      aisleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11'],
      activeAisleId: 'a11',
      backgroundAisleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11'],
      nearVisibleAisleIds: ['a10'],
      recentAisleIds: ['a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1'],
      toastRecentRetainLimit: 3,
      smallNoteLiveLimit: 4,
    })

    expect(Array.from(retained).sort()).toEqual(['a11'])
  })

  it('keeps only aisle 3 live during a CodeMirror 1 to 2 to 3 activation sequence', () => {
    const retained = buildRetainedAisleEditorIdsForCore({
      editorCore: 'codemirror',
      aisleIds: ['aisle-1', 'aisle-2', 'aisle-3', 'aisle-4'],
      activeAisleId: 'aisle-3',
      nearVisibleAisleIds: ['aisle-1', 'aisle-2', 'aisle-3'],
      recentAisleIds: ['aisle-2', 'aisle-1'],
      toastRecentRetainLimit: 3,
      smallNoteLiveLimit: 4,
    })

    expect(Array.from(retained).sort()).toEqual(['aisle-3'])
  })

  it('keeps all Lexical aisles mounted so inactive aisles can remain read-only WYSIWYG surfaces', () => {
    const retained = buildRetainedAisleEditorIdsForCore({
      editorCore: 'lexical',
      aisleIds: ['aisle-1', 'aisle-2', 'aisle-3', 'aisle-4'],
      activeAisleId: 'aisle-3',
      backgroundAisleIds: ['aisle-1', 'aisle-2', 'aisle-3', 'aisle-4'],
      nearVisibleAisleIds: ['aisle-1', 'aisle-2'],
      recentAisleIds: ['aisle-2', 'aisle-1'],
      toastRecentRetainLimit: 3,
      smallNoteLiveLimit: 4,
    })

    expect(Array.from(retained).sort()).toEqual(['aisle-1', 'aisle-2', 'aisle-3', 'aisle-4'])
  })

  it('keeps Toast UI small-note background retention behavior unchanged', () => {
    const retained = buildRetainedAisleEditorIdsForCore({
      editorCore: 'toast',
      aisleIds: ['a', 'b', 'c', 'd'],
      activeAisleId: 'b',
      backgroundAisleIds: ['a', 'b', 'c', 'd'],
      nearVisibleAisleIds: [],
      recentAisleIds: [],
      toastRecentRetainLimit: 3,
      smallNoteLiveLimit: 4,
    })

    expect(Array.from(retained).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps Toast UI large-note retention limited to near-visible and three recent aisles', () => {
    const retained = buildRetainedAisleEditorIdsForCore({
      editorCore: 'toast',
      aisleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
      activeAisleId: 'a8',
      backgroundAisleIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
      nearVisibleAisleIds: ['a7'],
      recentAisleIds: ['a6', 'a5', 'a4', 'a3'],
      toastRecentRetainLimit: 3,
      smallNoteLiveLimit: 4,
    })

    expect(Array.from(retained).sort()).toEqual(['a4', 'a5', 'a6', 'a7', 'a8'])
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
