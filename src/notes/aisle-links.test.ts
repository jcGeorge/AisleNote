import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { getAisleMarkdown } from './note-markdown'
import {
  buildAisleSlotKey,
  decoupleAisleSlotsInState,
  listLinkedAisleSlotsForAisleBody,
} from './aisle-links'

function createState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-1',
      items: [
        {
          type: 'folder',
          id: 'folder-work',
          title: 'Work',
          children: [
            {
              type: 'note',
              id: 'note-1',
              title: 'Specs',
              noteBodyId: 'body-1',
            },
          ],
        },
        {
          type: 'note',
          id: 'note-2',
          title: 'Mirror',
          noteBodyId: 'body-2',
        },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      {
        id: 'body-1',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'other-body' },
          { id: 'aisle-2', aisleBodyId: 'shared-body' },
        ],
      },
      {
        id: 'body-2',
        aisles: [{ id: 'aisle-3', aisleBodyId: 'shared-body' }],
      },
    ],
    noteAisleBodies: [
      { id: 'other-body', markdown: 'other text', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      {
        id: 'shared-body',
        markdown: 'shared text #Tag',
        tags: ['Tag'],
        frontmatter: { status: 'synced' },
        frontmatterStatus: 'valid',
      },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('linked aisle helpers', () => {
  it('lists linked aisle slots with stable keys and notebook labels', () => {
    const slots = listLinkedAisleSlotsForAisleBody(createState(), 'shared-body')

    expect(slots.map((slot) => slot.key)).toEqual([
      buildAisleSlotKey('body-2', 'aisle-3'),
      buildAisleSlotKey('body-1', 'aisle-2'),
    ])
    expect(slots.map((slot) => slot.label)).toEqual(['Mirror', 'Work > Specs / aisle 2'])
    expect(slots[1]).toMatchObject({ aisleIndex: 1, aisleCount: 2, aisleLabel: 'aisle 2' })
  })

  it('de-couples selected aisle slots with current text when keep text is enabled', () => {
    const result = decoupleAisleSlotsInState(
      createState(),
      'shared-body',
      new Set([buildAisleSlotKey('body-1', 'aisle-2')]),
      true,
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected aisle slots to de-couple')
    const keptAisle = result.state.noteBodies.find((body) => body.id === 'body-1')?.aisles[1]
    const decoupledAisle = result.state.noteBodies.find((body) => body.id === 'body-2')?.aisles[0]

    expect(keptAisle?.aisleBodyId).toBe('shared-body')
    expect(decoupledAisle?.aisleBodyId).not.toBe('shared-body')
    expect(decoupledAisle ? getAisleMarkdown(decoupledAisle, result.state.noteAisleBodies) : '').toBe('shared text #Tag')
    expect(result.state.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)?.frontmatter).toEqual({
      status: 'synced',
    })
  })

  it('de-couples aisle slots with empty text when keep text is disabled', () => {
    const result = decoupleAisleSlotsInState(
      createState(),
      'shared-body',
      new Set([buildAisleSlotKey('body-1', 'aisle-2')]),
      false,
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected aisle slots to de-couple')
    const decoupledAisle = result.state.noteBodies.find((body) => body.id === 'body-2')?.aisles[0]
    const decoupledBody = result.state.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)

    expect(decoupledBody?.markdown).toBe('')
    expect(decoupledBody?.frontmatterStatus).toBe('none')
  })

  it('blocks aisle de-couple when no synced aisle is retained', () => {
    expect(decoupleAisleSlotsInState(createState(), 'shared-body', new Set(), true)).toMatchObject({
      status: 'blocked',
      message: 'Select at least one aisle to retain the information.',
    })
  })
})
