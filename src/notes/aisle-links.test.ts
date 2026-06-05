import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteBody, Space } from '../types/app'
import { getAisleMarkdown, resolveNoteAisles } from './note-markdown'
import {
  buildAisleSlotKey,
  decoupleAisleSlotsInState,
  getLinkedAisleIdsForNoteBody,
  listLinkedAisleSlotsForAisleBody,
  materializeDecoupledAisleCopies,
} from './aisle-links'
import { isNoteBodyLinked } from './link-status'

function createAisleLinkTestState(noteBodies: NoteBody[], tabs: Array<{ id: string; noteBodyId: string }>): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? 'tab-1',
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.id,
        noteBodyId: tab.noteBodyId,
        activeSubTabId: null,
        subTabs: [],
      })),
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies,
    noteAisleBodies: [{ id: 'shared-body', markdown: 'authoritative shared text' }],
    hotkeys: {
      shortcuts: {
        toggleTabsTarget: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('linked aisle helpers', () => {
  it('detects aisle links across located note bodies', () => {
    const state = createAisleLinkTestState(
      [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-body' }] },
      ],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-2' },
      ],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set(['aisle-1']))
  })

  it('detects two aisle slots in one note sharing an aisle body', () => {
    const state = createAisleLinkTestState(
      [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-body' },
            { id: 'aisle-2', aisleBodyId: 'shared-body' },
          ],
        },
      ],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set(['aisle-1', 'aisle-2']))
  })

  it('does not treat whole-note duplicates as aisle links', () => {
    const state = createAisleLinkTestState(
      [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] }],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-1' },
      ],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set())
    expect(isNoteBodyLinked(state, 'body-1')).toBe(true)
  })

  it('can distinguish same-note aisle slots from cross-note linked status', () => {
    const state = createAisleLinkTestState(
      [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-body' },
            { id: 'aisle-2', aisleBodyId: 'shared-body' },
          ],
        },
      ],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set(['aisle-1', 'aisle-2']))
    expect(getLinkedAisleIdsForNoteBody(state, 'body-1', { scope: 'cross-note' })).toEqual(new Set())
    expect(isNoteBodyLinked(state, 'body-1')).toBe(false)
  })

  it('ignores orphan note bodies when detecting aisle links', () => {
    const state = createAisleLinkTestState(
      [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] },
        { id: 'body-orphan', aisles: [{ id: 'aisle-orphan', aisleBodyId: 'shared-body' }] },
      ],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set())
  })

  it('lists located linked aisle slots with stable keys and aisle labels for multi-aisle notes', () => {
    const state = createAisleLinkTestState(
      [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'other-body' },
            { id: 'aisle-2', aisleBodyId: 'shared-body' },
          ],
        },
        { id: 'body-2', aisles: [{ id: 'aisle-3', aisleBodyId: 'shared-body' }] },
        { id: 'body-orphan', aisles: [{ id: 'aisle-orphan', aisleBodyId: 'shared-body' }] },
      ],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-2' },
      ],
    )

    const slots = listLinkedAisleSlotsForAisleBody(state, 'shared-body')

    expect(slots.map((slot) => slot.key)).toEqual([
      buildAisleSlotKey('body-1', 'aisle-2'),
      buildAisleSlotKey('body-2', 'aisle-3'),
    ])
    expect(slots[0]).toMatchObject({ aisleIndex: 1, aisleCount: 2, aisleLabel: 'aisle 2' })
    expect(slots[1]).toMatchObject({ aisleIndex: 0, aisleCount: 1, aisleLabel: null })
    expect(slots.map((slot) => slot.label)).toEqual(['Domain > Space > tab-1 > home / aisle 2', 'Domain > Space > tab-2 > home'])
  })

  it('de-couples selected aisle slots with current data when keep-data is enabled', () => {
    const state = createAisleLinkTestState(
      [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-body' }] },
      ],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-2' },
      ],
    )
    state.noteAisleBodies = [
      {
        id: 'shared-body',
        markdown: 'authoritative shared text #Tag',
        tags: ['Tag'],
        frontmatter: { status: 'linked' },
        frontmatterStatus: 'valid',
      },
    ]

    const result = decoupleAisleSlotsInState(
      state,
      'shared-body',
      new Set([buildAisleSlotKey('body-1', 'aisle-1')]),
      true,
    )
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected aisle slots to de-couple')
    const keptBody = result.state.noteBodies.find((body) => body.id === 'body-1')
    const decoupledBody = result.state.noteBodies.find((body) => body.id === 'body-2')
    const decoupledAisle = decoupledBody?.aisles[0]

    expect(keptBody?.aisles[0]?.aisleBodyId).toBe('shared-body')
    expect(decoupledAisle?.aisleBodyId).not.toBe('shared-body')
    expect(decoupledAisle ? getAisleMarkdown(decoupledAisle, result.state.noteAisleBodies) : '').toBe('authoritative shared text #Tag')
    expect(result.state.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)?.frontmatter).toEqual({
      status: 'linked',
    })
  })

  it('de-couples aisle slots with empty data when keep-data is disabled', () => {
    const state = createAisleLinkTestState(
      [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-body' }] },
      ],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-2' },
      ],
    )

    const result = decoupleAisleSlotsInState(
      state,
      'shared-body',
      new Set([buildAisleSlotKey('body-1', 'aisle-1')]),
      false,
    )
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected aisle slots to de-couple')
    const decoupledAisle = result.state.noteBodies.find((body) => body.id === 'body-2')?.aisles[0]
    const decoupledBody = result.state.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)

    expect(decoupledAisle?.aisleBodyId).not.toBe('shared-body')
    expect(decoupledBody?.markdown).toBe('')
    expect(decoupledBody?.frontmatterStatus).toBe('none')
  })

  it('blocks aisle slot de-couple when no linked slot is retained', () => {
    const state = createAisleLinkTestState(
      [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-body' }] },
      ],
      [
        { id: 'tab-1', noteBodyId: 'body-1' },
        { id: 'tab-2', noteBodyId: 'body-2' },
      ],
    )

    expect(decoupleAisleSlotsInState(state, 'shared-body', new Set(), true)).toMatchObject({
      status: 'blocked',
      message: 'select at least one aisle to retain the information',
    })
  })

  it('materializes staged aisle de-couples with fresh aisle bodies and authoritative text', () => {
    const state = createAisleLinkTestState(
      [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body' }] }],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )
    const [decoupled] = materializeDecoupledAisleCopies(
      state,
      resolveNoteAisles(state.noteBodies[0].aisles, state.noteAisleBodies),
      ['aisle-1'],
    )

    expect(decoupled.id).toBe('aisle-1')
    expect(decoupled.aisleBodyId).not.toBe('shared-body')
    expect(decoupled.markdown).toBe('authoritative shared text')
  })
})
