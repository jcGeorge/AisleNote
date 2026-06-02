import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import { getNoteBodyTags } from './tag-state'

describe('note tag derivation', () => {
  it('derives note tags from the union of its aisle bodies', () => {
    const state = parseSavedState(JSON.stringify({
      domains: [
        {
          id: 'domain',
          name: 'Domain',
          activeSpaceId: 'space',
          spaces: [
            {
              id: 'space',
              name: 'Space',
              settings: { autoRemoveDeletedDays: 7 },
              data: {
                activeTabId: 'tab',
                tabs: [{ id: 'tab', title: 'Tab', noteBodyId: 'body', activeSubTabId: null, subTabs: [] }],
                deletedTabs: [],
                deletedSubTabs: [],
              },
            },
          ],
        },
      ],
      activeDomainId: 'domain',
      activeSpaceId: 'space',
      spaces: [],
      noteBodies: [
        {
          id: 'body',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
            { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
          ],
        },
      ],
      noteAisleBodies: [
        { id: 'aisle-body-1', markdown: '#Sermon first' },
        { id: 'aisle-body-2', markdown: '#sermon #Study second' },
      ],
    }))

    expect(getNoteBodyTags(state, state.noteBodies[0])).toEqual(['Sermon', 'Study'])
  })
})
