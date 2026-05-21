import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteBody, Space } from '../types/app'
import { getLinkedAisleIdsForNoteBody, materializeDecoupledAisleCopies } from './aisle-links'
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
        homeContent: '',
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
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      customThemePalette: null,
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
        { id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'one' }] },
        { id: 'body-2', frontmatter: null, aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-body', markdown: 'two' }] },
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
          frontmatter: null,
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'one' },
            { id: 'aisle-2', aisleBodyId: 'shared-body', markdown: 'two' },
          ],
        },
      ],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set(['aisle-1', 'aisle-2']))
  })

  it('does not treat whole-note duplicates as aisle links', () => {
    const state = createAisleLinkTestState(
      [{ id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'one' }] }],
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
          frontmatter: null,
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'one' },
            { id: 'aisle-2', aisleBodyId: 'shared-body', markdown: 'two' },
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
        { id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'one' }] },
        { id: 'body-orphan', frontmatter: null, aisles: [{ id: 'aisle-orphan', aisleBodyId: 'shared-body', markdown: 'orphan' }] },
      ],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )

    expect(getLinkedAisleIdsForNoteBody(state, 'body-1')).toEqual(new Set())
  })

  it('materializes staged aisle de-couples with fresh aisle bodies and authoritative text', () => {
    const state = createAisleLinkTestState(
      [{ id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-body', markdown: 'stale' }] }],
      [{ id: 'tab-1', noteBodyId: 'body-1' }],
    )
    const [decoupled] = materializeDecoupledAisleCopies(state, state.noteBodies[0].aisles, ['aisle-1'])

    expect(decoupled.id).toBe('aisle-1')
    expect(decoupled.aisleBodyId).not.toBe('shared-body')
    expect(decoupled.markdown).toBe('authoritative shared text')
  })
})
