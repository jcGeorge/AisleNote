import { describe, expect, it } from 'vitest'
import type { WorkspaceData } from '../types/app'
import { buildTrashParentBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash-model'

const workspace: WorkspaceData = {
  activeTabId: 'live',
  tabs: [],
  deletedTabs: [
    {
      id: 'deleted-tab-entry',
      deletedAt: 1,
      tab: {
        id: 'deleted-parent',
        title: 'Deleted Parent',
        noteBodyId: 'body-parent',
        homeContent: 'deleted home',
        activeSubTabId: null,
        subTabs: [{ id: 'deleted-sub', title: 'Deleted Sub', noteBodyId: 'body-sub', content: 'deleted sub' }],
      },
    },
  ],
  deletedSubTabs: [
    {
      id: 'orphan-sub-entry',
      parentTabId: 'live-parent',
      parentTabTitle: 'Live Parent',
      deletedAt: 2,
      subTab: { id: 'orphan-sub', title: 'Orphan Sub', noteBodyId: 'body-orphan', content: 'orphan content' },
    },
  ],
}

describe('trash model', () => {
  it('groups deleted parents and subtabs-only parents separately', () => {
    const buckets = buildTrashParentBuckets(workspace)

    expect(buckets.map((bucket) => bucket.source)).toEqual(['deleted-tab', 'subtabs-only'])
    expect(buckets[1].subTabs[0].content).toBe('orphan content')
  })

  it('resolves trash display markdown for home, parent, and subtab selections', () => {
    const buckets = buildTrashParentBuckets(workspace)
    const parent = buckets[0]

    expect(
      resolveTrashContentDisplay({
        trashTabId: TRASH_HOME_ID,
        trashHomeContent: 'home',
        selectedTrashTab: null,
        selectedTrashSubTab: null,
      }).markdown,
    ).toBe('home')
    expect(
      resolveTrashContentDisplay({
        trashTabId: parent.id,
        trashHomeContent: 'home',
        selectedTrashTab: parent,
        selectedTrashSubTab: null,
      }).markdown,
    ).toBe('deleted home')
    expect(
      resolveTrashContentDisplay({
        trashTabId: parent.id,
        trashHomeContent: 'home',
        selectedTrashTab: parent,
        selectedTrashSubTab: parent.subTabs[0],
      }).markdown,
    ).toBe('deleted sub')
  })
})
