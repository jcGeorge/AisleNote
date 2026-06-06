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
        activeSubTabId: null,
        subTabs: [{ id: 'deleted-sub', title: 'Deleted Sub', noteBodyId: 'body-sub'}],
      },
    },
  ],
  deletedSubTabs: [
    {
      id: 'orphan-sub-entry',
      parentTabId: 'live-parent',
      parentTabTitle: 'Live Parent',
      deletedAt: 2,
      subTab: { id: 'orphan-sub', title: 'Orphan Sub', noteBodyId: 'body-orphan'},
    },
  ],
}

const state = {
  noteBodies: [
    { id: 'body-parent', aisles: [{ id: 'aisle-parent', aisleBodyId: 'aisle-body-parent' }] },
    { id: 'body-sub', aisles: [{ id: 'aisle-sub', aisleBodyId: 'aisle-body-sub' }] },
    { id: 'body-orphan', aisles: [{ id: 'aisle-orphan', aisleBodyId: 'aisle-body-orphan' }] },
  ],
  noteAisleBodies: [
    { id: 'aisle-body-parent', markdown: 'deleted home' },
    { id: 'aisle-body-sub', markdown: 'deleted sub' },
    { id: 'aisle-body-orphan', markdown: 'orphan content' },
  ],
} as unknown as AppState

describe('trash model', () => {
  it('groups deleted parents and subtabs-only parents separately', () => {
    const buckets = buildTrashParentBuckets(state, workspace)

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
      noteBodies: [{ id: 'parent-body', aisles: [{ id: 'parent-aisle', aisleBodyId: 'parent-aisle-body' }] }],
      noteAisleBodies: [{ id: 'parent-aisle-body', markdown: 'parent body' }],
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

  it('hides empty live containers and keeps live containers with deleted descendants', () => {
    const state = {
      activeDomainId: 'domain-empty',
      activeSpaceId: 'space-empty',
      spaces: [],
      deletedDomains: [],
      deletedSpaces: [
        {
          id: 'deleted-space-entry',
          domainId: 'domain-trash',
          domainName: 'Domain Trash',
          deletedAt: 3,
          space: {
            id: 'space-deleted',
            name: 'Deleted Space',
            settings: { autoRemoveDeletedDays: 7 },
            data: { activeTabId: '', tabs: [], deletedTabs: [], deletedSubTabs: [] },
          },
        },
      ],
      domains: [
        {
          id: 'domain-empty',
          name: 'Domain Empty',
          activeSpaceId: 'space-empty',
          spaces: [
            {
              id: 'space-empty',
              name: 'Empty Space',
              settings: { autoRemoveDeletedDays: 7 },
              data: { activeTabId: '', tabs: [], deletedTabs: [], deletedSubTabs: [] },
            },
          ],
        },
        {
          id: 'domain-trash',
          name: 'Domain Trash',
          activeSpaceId: 'space-live-trash',
          spaces: [
            {
              id: 'space-live-empty',
              name: 'Live Empty',
              settings: { autoRemoveDeletedDays: 7 },
              data: { activeTabId: '', tabs: [], deletedTabs: [], deletedSubTabs: [] },
            },
            {
              id: 'space-live-trash',
              name: 'Live Trash',
              settings: { autoRemoveDeletedDays: 7 },
              data: {
                activeTabId: '',
                tabs: [],
                deletedTabs: [
                  {
                    id: 'deleted-tab-entry',
                    deletedAt: 4,
                    tab: {
                      id: 'parent-a',
                      title: 'Parent A',
                      noteBodyId: 'body-a',
                      activeSubTabId: null,
                      subTabs: [],
                    },
                  },
                ],
                deletedSubTabs: [],
              },
            },
          ],
        },
      ],
      noteBodies: [{ id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] }],
      noteAisleBodies: [{ id: 'aisle-body-a', markdown: 'deleted parent' }],
    } as unknown as AppState

    const buckets = buildTrashDomainBuckets(state)

    expect(buckets.map((bucket) => bucket.id)).toEqual(['live-domain:domain-trash'])
    expect(buckets[0].spaces.map((space) => space.id)).toEqual([
      'live-space:domain-trash:space-live-trash',
      'deleted-space:deleted-space-entry',
    ])
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
    const buckets = buildTrashParentBuckets(state, workspace)
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
