import { describe, expect, it } from 'vitest'
import type { DeletedSubTabEntry, DeletedTabEntry, SubTab, Tab, WorkspaceData } from '../types/app'
import { restoreTrashTarget } from './trash-restore'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    content: `${title} content`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    homeContent: `${title} home`,
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function deletedTab(id: string, deleted: Tab): DeletedTabEntry {
  return {
    id,
    tab: deleted,
    deletedAt: 1,
  }
}

function deletedSubTab(id: string, parentTabId: string, deleted: SubTab): DeletedSubTabEntry {
  return {
    id,
    parentTabId,
    parentTabTitle: 'Parent',
    subTab: deleted,
    deletedAt: 1,
  }
}

function workspace(
  tabs: Tab[] = [tab('live-parent')],
  deletedTabs: DeletedTabEntry[] = [],
  deletedSubTabs: DeletedSubTabEntry[] = [],
): WorkspaceData {
  return {
    activeTabId: tabs[0]?.id ?? 'missing',
    tabs,
    deletedTabs,
    deletedSubTabs,
  }
}

describe('trash item restore', () => {
  it('restores a deleted parent tab from the trash rail', () => {
    const restored = tab('deleted-parent', 'Deleted', [subTab('child')])
    const next = restoreTrashTarget(workspace([tab('live-parent')], [deletedTab('deleted-entry', restored)]), {
      type: 'trash-tab',
      source: 'deleted-tab',
      deletedTabEntryId: 'deleted-entry',
      parentTabId: restored.id,
    })

    expect(next.tabs.map((entry) => entry.id)).toEqual(['live-parent', restored.id])
    expect(next.tabs[1]).toEqual(restored)
    expect(next.deletedTabs).toEqual([])
  })

  it('restores grouped deleted sub-tabs from a subtabs-only parent bucket', () => {
    const liveParent = tab('parent', 'Parent')
    const next = restoreTrashTarget(
      workspace(
        [liveParent],
        [],
        [deletedSubTab('deleted-sub-1', liveParent.id, subTab('sub-1')), deletedSubTab('deleted-sub-2', liveParent.id, subTab('sub-2'))],
      ),
      {
        type: 'trash-tab',
        source: 'subtabs-only',
        deletedTabEntryId: null,
        parentTabId: liveParent.id,
      },
    )

    expect(next.tabs[0].subTabs.map((entry) => entry.id)).toEqual(['sub-1', 'sub-2'])
    expect(next.deletedSubTabs).toEqual([])
  })

  it('restores a single sub-tab out of a deleted parent bucket', () => {
    const deletedParent = tab('deleted-parent', 'Deleted', [subTab('sub-1'), subTab('sub-2')])
    const next = restoreTrashTarget(
      workspace([tab('live-parent')], [deletedTab('deleted-entry', deletedParent)]),
      {
        type: 'trash-subtab',
        source: 'deleted-tab',
        deletedTabEntryId: 'deleted-entry',
        parentTabId: deletedParent.id,
        subTabId: 'sub-1',
      },
      { createParentNoteBodyId: () => 'restored-parent-body' },
    )

    expect(next.tabs.map((entry) => entry.id)).toEqual(['live-parent', deletedParent.id])
    expect(next.tabs[1]).toMatchObject({
      id: deletedParent.id,
      title: deletedParent.title,
      noteBodyId: 'restored-parent-body',
      activeSubTabId: 'sub-1',
    })
    expect(next.tabs[1].subTabs.map((entry) => entry.id)).toEqual(['sub-1'])
    expect(next.deletedTabs[0].tab.subTabs.map((entry) => entry.id)).toEqual(['sub-2'])
  })

  it('restores a single subtabs-only deleted sub-tab', () => {
    const restoredSubTab = subTab('sub-1')
    const next = restoreTrashTarget(
      workspace([tab('parent', 'Parent')], [], [deletedSubTab('deleted-sub-1', 'parent', restoredSubTab)]),
      {
        type: 'trash-subtab',
        source: 'subtabs-only',
        deletedTabEntryId: null,
        parentTabId: 'parent',
        subTabId: 'deleted-sub-1',
      },
    )

    expect(next.tabs[0].subTabs).toEqual([restoredSubTab])
    expect(next.deletedSubTabs).toEqual([])
  })
})
