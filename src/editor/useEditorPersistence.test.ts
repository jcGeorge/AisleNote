import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { getAisleMarkdown } from '../notes/note-markdown'
import type { AppState, NoteAisle, Space } from '../types/app'
import {
  applyEditorContentSnapshotsToState,
  applyFreshEditorSnapshotToState,
  getEditorFocusBoundarySaveOptions,
  getSnapshotEditorMarkdown,
  isEditorContentTargetCurrent,
  pendingContentMatchesTarget,
  resolveEditorFocusBoundaryFlushAction,
  shouldCollectMountedEditorSnapshotsForFocusBoundary,
  shouldPersistFocusBoundarySnapshot,
} from './useEditorPersistence'

function persistenceState(): AppState {
  const space: Space = {
    id: 'space-a',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-a',
      tabs: [{
        id: 'tab-a',
        title: 'Tab',
        noteBodyId: 'body-a',
        activeSubTabId: null,
        subTabs: [],
      }],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  return {
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [{ id: 'domain-a', name: 'Domain', activeSpaceId: 'space-a', spaces: [space] }],
    spaces: [space],
    noteBodies: [{ id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'body-a-aisle' }] }],
    noteAisleBodies: [{ id: 'body-a-aisle', createdAt: 1, updatedAt: 1, markdown: 'old' }],
  } as unknown as AppState
}

const aisleMarkdown = (state: AppState, aisle: NoteAisle | null | undefined) =>
  aisle ? getAisleMarkdown(aisle, state.noteAisleBodies) : ''

describe('editor persistence snapshot helpers', () => {
  it('reads fresh editor markdown for close-time snapshots', () => {
    const editor = { getMarkdown: () => 'fresh' } as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn((target: Editor) => (target as unknown as { getMarkdown: () => string }).getMarkdown())

    expect(getSnapshotEditorMarkdown(editor, 'cached', getNormalizedEditorMarkdown)).toBe('fresh')
    expect(getNormalizedEditorMarkdown).toHaveBeenCalledWith(editor)
  })

  it('falls back to cached markdown if the live editor cannot be read', () => {
    const editor = {} as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn(() => {
      throw new Error('editor unavailable')
    })

    expect(getSnapshotEditorMarkdown(editor, 'cached', getNormalizedEditorMarkdown)).toBe('cached')
  })

  it('identifies stale pending content that should not overwrite a fresh active snapshot', () => {
    const pending = {
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'body-a',
      markdown: 'cached',
    }

    expect(pendingContentMatchesTarget(pending, {
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'body-a',
    })).toBe(true)
    expect(pendingContentMatchesTarget(pending, {
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-b',
      aisleBodyId: 'body-b',
    })).toBe(false)
  })

  it('applies fresh editor markdown instead of stale pending content for the same target', () => {
    const next = applyFreshEditorSnapshotToState(
      persistenceState(),
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
      },
      '# Fresh heading',
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
        markdown: 'stale pending',
      },
    )

    expect(aisleMarkdown(next, next.noteBodies[0].aisles[0])).toBe('# Fresh heading')
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('# Fresh heading')
  })

  it('applies multiple pending aisle snapshots without overwriting sibling aisles', () => {
    const base = persistenceState()
    const secondAisle = { id: 'aisle-b', aisleBodyId: 'body-b-aisle' }
    base.noteBodies[0].aisles.push(secondAisle)
    base.noteAisleBodies?.push({ id: 'body-b-aisle', createdAt: '1', updatedAt: '1', markdown: 'old b' })

    const next = applyEditorContentSnapshotsToState(base, [
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
        markdown: 'aisle one draft 🚙',
      },
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-b',
        aisleBodyId: 'body-b-aisle',
        markdown: 'aisle two draft 🥺',
      },
    ])

    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('aisle one draft 🚙')
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-b-aisle')?.markdown).toBe('aisle two draft 🥺')
    expect(next.noteBodies[0].aisles.map((aisle) => aisleMarkdown(next, aisle))).toEqual(['aisle one draft 🚙', 'aisle two draft 🥺'])
  })

  it('keeps linked aisle bodies intentionally shared when the aisle body id is shared', () => {
    const base = persistenceState()
    base.noteBodies[0].aisles.push({ id: 'aisle-b', aisleBodyId: 'body-a-aisle' })

    const next = applyEditorContentSnapshotsToState(base, [{
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-b',
      aisleBodyId: 'body-a-aisle',
      markdown: 'shared linked draft',
    }])

    expect(next.noteBodies[0].aisles.map((aisle) => aisleMarkdown(next, aisle))).toEqual(['shared linked draft', 'shared linked draft'])
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('shared linked draft')
  })

  it('skips stale explicit aisle body targets instead of falling back to another aisle', () => {
    const base = persistenceState()

    expect(isEditorContentTargetCurrent(base, {
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'missing-aisle-body',
    })).toBe(false)

    const next = applyEditorContentSnapshotsToState(base, [{
      noteBodyId: 'body-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'missing-aisle-body',
      markdown: 'should not land on aisle-a',
    }])

    expect(next).toBe(base)
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('old')
  })

  it('lets mounted aisle snapshots win over stale pending content on save boundaries', () => {
    const base = persistenceState()
    base.noteBodies[0].aisles.push({ id: 'aisle-b', aisleBodyId: 'body-b-aisle' })
    base.noteAisleBodies?.push({ id: 'body-b-aisle', createdAt: '1', updatedAt: '1', markdown: 'old b' })

    const next = applyEditorContentSnapshotsToState(base, [
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
        markdown: 'stale active cache',
      },
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
        markdown: 'live aisle one 🚙',
      },
      {
        noteBodyId: 'body-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-b',
        aisleBodyId: 'body-b-aisle',
        markdown: 'live aisle two 🥺',
      },
    ])

    expect(next.noteBodies[0].aisles.map((aisle) => aisleMarkdown(next, aisle))).toEqual(['live aisle one 🚙', 'live aisle two 🥺'])
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('live aisle one 🚙')
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-b-aisle')?.markdown).toBe('live aisle two 🥺')
  })

  it('resolves focus-boundary flush events with coalescing and forced exits', () => {
    expect(resolveEditorFocusBoundaryFlushAction('blur', null)).toBe('schedule')
    expect(resolveEditorFocusBoundaryFlushAction('blur', 12)).toBe('ignore')
    expect(resolveEditorFocusBoundaryFlushAction('visibilitychange', null, 'visible')).toBe('ignore')
    expect(resolveEditorFocusBoundaryFlushAction('visibilitychange', null, 'hidden')).toBe('schedule')
    expect(resolveEditorFocusBoundaryFlushAction('visibilitychange', 12, 'hidden')).toBe('ignore')
    expect(resolveEditorFocusBoundaryFlushAction('pagehide', 12, 'hidden')).toBe('force')
    expect(resolveEditorFocusBoundaryFlushAction('beforeunload', 12)).toBe('force')
  })

  it('uses async persistence for blur and visibility boundaries but sync persistence for exit boundaries', () => {
    expect(getEditorFocusBoundarySaveOptions('blur', 2)).toEqual({
      preferSync: false,
      trigger: 'editor-focus-boundary:blur',
      pendingEditorCount: 2,
    })
    expect(getEditorFocusBoundarySaveOptions('visibilitychange', 1)).toEqual({
      preferSync: false,
      trigger: 'editor-focus-boundary:visibilitychange',
      pendingEditorCount: 1,
    })
    expect(getEditorFocusBoundarySaveOptions('beforeunload', 3)).toEqual({
      preferSync: true,
      trigger: 'editor-focus-boundary:beforeunload',
      pendingEditorCount: 3,
    })
    expect(getEditorFocusBoundarySaveOptions('pagehide', 4)).toEqual({
      preferSync: true,
      trigger: 'editor-focus-boundary:pagehide',
      pendingEditorCount: 4,
    })
  })

  it('only collects mounted editor snapshots on focus boundaries when content is pending or the page is exiting', () => {
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('blur', 0)).toBe(false)
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('visibilitychange', 0)).toBe(false)
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('blur', 1)).toBe(true)
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('visibilitychange', 1)).toBe(true)
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('beforeunload', 0)).toBe(true)
    expect(shouldCollectMountedEditorSnapshotsForFocusBoundary('pagehide', 0)).toBe(true)
  })

  it('skips no-op blur and visibility saves while keeping pending and exit saves conservative', () => {
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'blur',
      pendingEditorCount: 0,
      stateChanged: false,
    })).toBe(false)
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'visibilitychange',
      pendingEditorCount: 0,
      stateChanged: false,
    })).toBe(false)
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'blur',
      pendingEditorCount: 0,
      stateChanged: true,
    })).toBe(true)
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'blur',
      pendingEditorCount: 1,
      stateChanged: false,
    })).toBe(true)
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'beforeunload',
      pendingEditorCount: 0,
      stateChanged: false,
    })).toBe(true)
    expect(shouldPersistFocusBoundarySnapshot({
      eventName: 'pagehide',
      pendingEditorCount: 0,
      stateChanged: false,
    })).toBe(true)
  })
})
