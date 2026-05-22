import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import type { AppState, Space } from '../types/app'
import { applyFreshEditorSnapshotToState, getSnapshotEditorMarkdown, pendingContentMatchesTarget } from './useEditorPersistence'

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
        homeContent: '',
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
    noteBodies: [{ id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'body-a-aisle', markdown: 'old' }] }],
    noteAisleBodies: [{ id: 'body-a-aisle', createdAt: 1, updatedAt: 1, markdown: 'old' }],
  } as unknown as AppState
}

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
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'body-a',
      markdown: 'cached',
    }

    expect(pendingContentMatchesTarget(pending, {
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: null,
      aisleId: 'aisle-a',
      aisleBodyId: 'body-a',
    })).toBe(true)
    expect(pendingContentMatchesTarget(pending, {
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
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
      },
      '# Fresh heading',
      {
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: null,
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a-aisle',
        markdown: 'stale pending',
      },
    )

    expect(next.noteBodies[0].aisles[0].markdown).toBe('# Fresh heading')
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a-aisle')?.markdown).toBe('# Fresh heading')
  })
})
