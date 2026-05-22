import { describe, expect, it } from 'vitest'
import type { AppState, WorkspaceData } from '../types/app'
import { buildTrashDomainBuckets, buildTrashParentBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash-model'

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

  it('exposes parent tabs inside deleted-domain spaces', () => {
    const state = {
      activeDomainId: 'domain-live',
      activeSpaceId: '',
      spaces: [],
      domains: [],
      deletedSpaces: [],
      deletedDomains: [
        {
          id: 'deleted-domain-entry',
          deletedAt: 1,
          deletedSpaces: [],
          domain: {
            id: 'domain-a',
            name: 'Domain A',
            activeSpaceId: 'space-a',
            spaces: [
              {
                id: 'space-a',
                name: 'Space A',
                settings: { autoRemoveDeletedDays: 7 },
                data: {
                  activeTabId: 'parent-a',
                  tabs: [
                    {
                      id: 'parent-a',
                      title: 'Parent A',
                      noteBodyId: 'parent-body',
                      homeContent: 'parent home',
                      activeSubTabId: null,
                      subTabs: [],
                    },
                  ],
                  deletedTabs: [],
                  deletedSubTabs: [],
                },
              },
            ],
          },
        },
      ],
    } as unknown as AppState

    const buckets = buildTrashDomainBuckets(state)

    expect(buckets[0].spaces[0].parentTabs[0]).toMatchObject({
      source: 'deleted-domain-tab',
      deletedDomainEntryId: 'deleted-domain-entry',
      deletedSpaceEntryId: null,
      domainId: 'domain-a',
      spaceId: 'space-a',
      parentTabId: 'parent-a',
    })
  })

  it('keeps deleted-domain space restore targets separate from deleted-space entries', () => {
    const state = {
      activeDomainId: 'domain-live',
      activeSpaceId: '',
      spaces: [],
      domains: [],
      deletedSpaces: [],
      deletedDomains: [
        {
          id: 'deleted-domain-entry',
          deletedAt: 1,
          deletedSpaces: [
            {
              id: 'deleted-space-entry',
              domainId: 'domain-a',
              domainName: 'Domain A',
              deletedAt: 2,
              space: {
                id: 'space-b',
                name: 'Deleted Space',
                settings: { autoRemoveDeletedDays: 7 },
                data: { activeTabId: '', tabs: [], deletedTabs: [], deletedSubTabs: [] },
              },
            },
          ],
          domain: {
            id: 'domain-a',
            name: 'Domain A',
            activeSpaceId: 'space-a',
            spaces: [
              {
                id: 'space-a',
                name: 'Domain Space',
                settings: { autoRemoveDeletedDays: 7 },
                data: { activeTabId: '', tabs: [], deletedTabs: [], deletedSubTabs: [] },
              },
            ],
          },
        },
      ],
    } as unknown as AppState

    const deletedDomain = buildTrashDomainBuckets(state)[0]

    expect(deletedDomain.spaces[0]).toMatchObject({
      source: 'deleted-domain-space',
      spaceId: 'space-a',
      deletedSpaceEntryId: null,
      deletedDomainEntryId: 'deleted-domain-entry',
    })
    expect(deletedDomain.spaces[1]).toMatchObject({
      source: 'deleted-domain-space',
      spaceId: 'space-b',
      deletedSpaceEntryId: 'deleted-space-entry',
      deletedDomainEntryId: 'deleted-domain-entry',
    })
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
