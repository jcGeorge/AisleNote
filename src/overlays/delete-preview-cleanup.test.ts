import { describe, expect, it } from 'vitest'
import type { DeletedSubTabEntry, DeletedTabEntry, SubTab, Tab, WorkspaceData } from '../types/app'
import {
  getNotePreviewCleanupTargetsForDeleteTarget,
  getNotePreviewCleanupTargetsForTrash,
} from './delete-preview-cleanup'

function subTab(id: string): SubTab {
  return { id, title: id, noteBodyId: `body-${id}`, content: id }
}

function tab(id: string, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title: id,
    noteBodyId: `body-${id}`,
    homeContent: id,
    activeSubTabId: null,
    subTabs,
  }
}

function deletedTab(entryId: string, deleted: Tab): DeletedTabEntry {
  return { id: entryId, tab: deleted, deletedAt: 1 }
}

function deletedSubTab(entryId: string, parentTabId: string, deleted: SubTab): DeletedSubTabEntry {
  return {
    id: entryId,
    parentTabId,
    parentTabTitle: parentTabId,
    subTab: deleted,
    deletedAt: 1,
  }
}

function workspace(data: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    activeTabId: 'parent',
    tabs: [tab('parent', [subTab('sub-a'), subTab('sub-b')])],
    deletedTabs: [],
    deletedSubTabs: [],
    ...data,
  }
}

describe('delete preview cleanup targets', () => {
  it('targets a deleted sub-tab precisely', () => {
    expect(
      getNotePreviewCleanupTargetsForDeleteTarget(workspace(), 'domain', 'space', {
        type: 'subtab',
        tabId: 'parent',
        subTabId: 'sub-a',
      }),
    ).toEqual([{ domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'sub-a' }])
  })

  it('targets a deleted parent index and its child sub-tabs', () => {
    expect(
      getNotePreviewCleanupTargetsForDeleteTarget(workspace(), 'domain', 'space', {
        type: 'tab',
        tabId: 'parent',
      }),
    ).toEqual([
      { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: null },
      { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'sub-a' },
      { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'sub-b' },
    ])
  })

  it('targets original sub-tab ids for trash-only sub-tab buckets', () => {
    const data = workspace({
      deletedSubTabs: [
        deletedSubTab('deleted-entry-a', 'parent', subTab('sub-a')),
        deletedSubTab('deleted-entry-b', 'parent', subTab('sub-b')),
      ],
    })

    expect(
      getNotePreviewCleanupTargetsForDeleteTarget(data, 'domain', 'space', {
        type: 'trash-subtab',
        source: 'subtabs-only',
        deletedTabEntryId: null,
        parentTabId: 'parent',
        subTabId: 'deleted-entry-a',
      }),
    ).toEqual([{ domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'sub-a' }])
  })

  it('targets every trashed parent and sub-tab when deleting all trash', () => {
    const data = workspace({
      deletedTabs: [deletedTab('deleted-parent-entry', tab('deleted-parent', [subTab('nested-sub')]))],
      deletedSubTabs: [deletedSubTab('deleted-sub-entry', 'parent', subTab('loose-sub'))],
    })

    expect(getNotePreviewCleanupTargetsForTrash(data, 'domain', 'space')).toEqual([
      { domainId: 'domain', spaceId: 'space', tabId: 'deleted-parent', subTabId: null },
      { domainId: 'domain', spaceId: 'space', tabId: 'deleted-parent', subTabId: 'nested-sub' },
      { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'loose-sub' },
    ])
  })
})
