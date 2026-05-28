import { describe, expect, it } from 'vitest'
import {
  applyAisleStructuralEntryToState,
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  getResolvedAislesForStructuralSnapshot,
  type AisleStructuralSnapshot,
} from './aisle-structural-history'
import type { AppState, NoteCursorLocation, ResolvedNoteAisle, Space } from '../types/app'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'
import { DEFAULT_STATE } from '../state/app-state'
import { resolveNoteAisles } from '../notes/aisle-body-state'
import { SCRATCHPAD_CURSOR_LOCATION_KEY } from '../state/scratchpad'

const location = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-1',
  subTabId: null,
}

const aisle = (id: string, markdown: string, aisleBodyId = id): ResolvedNoteAisle => ({ id, aisleBodyId, markdown })

function createSnapshot(
  aisles: ResolvedNoteAisle[],
  activeAisleId = aisles[0]?.id ?? '',
  cursorLocation: NoteCursorLocation | null = null,
): AisleStructuralSnapshot {
  return {
    location,
    locationKey: 'domain-1::space-1::tab-1::__home__',
    noteBodyId: 'body-1',
    aisles,
    activeAisleId,
    cursorLocation,
  }
}

function createStateWithAisles(aisles: ResolvedNoteAisle[], cursorLocations: AppState['ui']['noteCursorLocations'] = {}): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space 1',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Tab 1',
          noteBodyId: 'body-1',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [
      {
        id: 'domain-1',
        name: 'Domain 1',
        activeSpaceId: 'space-1',
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies: [
      {
        id: 'body-1',
        aisles: aisles.map(({ id, aisleBodyId }) => ({ id, aisleBodyId })),
      },
    ],
    noteAisleBodies: aisles.map(({ aisleBodyId, markdown }) => ({ id: aisleBodyId, markdown })),
    ui: {
      ...DEFAULT_STATE.ui,
      noteCursorLocations: cursorLocations,
    },
  }
}

function createScratchpadSnapshot(
  aisles: ResolvedNoteAisle[],
  activeAisleId = aisles[0]?.id ?? '',
  cursorLocation: NoteCursorLocation | null = null,
): AisleStructuralSnapshot {
  return {
    scope: 'scratchpad',
    locationKey: SCRATCHPAD_CURSOR_LOCATION_KEY,
    noteBodyId: 'scratch-body',
    aisles,
    activeAisleId,
    cursorLocation,
  }
}

function createStateWithScratchpadAisles(
  aisles: ResolvedNoteAisle[],
  cursorLocations: AppState['ui']['noteCursorLocations'] = {},
): AppState {
  return {
    ...DEFAULT_STATE,
    scratchpad: {
      noteBodyId: 'scratch-body',
      activeAisleId: aisles[0]?.id,
    },
    noteBodies: [
      {
        id: 'scratch-body',
        aisles: aisles.map(({ id, aisleBodyId }) => ({ id, aisleBodyId })),
      },
    ],
    noteAisleBodies: aisles.map(({ aisleBodyId, markdown }) => ({ id: aisleBodyId, markdown })),
    ui: {
      ...DEFAULT_STATE.ui,
      noteCursorLocations: cursorLocations,
    },
  }
}

describe('aisle structural history', () => {
  it('resolves structural snapshot aisles from stored aisle body markdown', () => {
    const state = createStateWithAisles([aisle('aisle-1', 'stored markdown', 'body-1')])

    expect(getResolvedAislesForStructuralSnapshot(state, 'body-1')).toEqual([
      aisle('aisle-1', 'stored markdown', 'body-1'),
    ])
  })

  it('allows undoing an added aisle from the exact post-add state', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
  })

  it('allows redoing an added aisle from the exact pre-add state', () => {
    const before = createSnapshot([aisle('aisle-1', 'keep this selected text')])
    const after = createSnapshot([aisle('aisle-1', 'keep this'), aisle('aisle-2', 'selected text')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('allows aisle undo after the editor already restored pre-add markdown', () => {
    const before = createSnapshot([aisle('aisle-1', 'keep this selected text')])
    const after = createSnapshot([aisle('aisle-1', 'keep this'), aisle('aisle-2', 'selected text')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'keep this selected text'),
      aisle('aisle-2', 'selected text'),
    ])).toBe(true)
  })

  it('does not remove an added aisle after its own content changed', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'typed later'),
    ])).toBe(false)
  })

  it('does not redo an added aisle after the original aisle content changed', () => {
    const before = createSnapshot([aisle('aisle-1', 'keep this selected text')])
    const after = createSnapshot([aisle('aisle-1', 'keep this'), aisle('aisle-2', 'selected text')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      aisle('aisle-1', 'edited after undo'),
    ])).toBe(false)
  })

  it('applies add-aisle undo to app state and restores the previous active aisle', () => {
    const beforeCursorLocation: NoteCursorLocation = {
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': {
          anchor: 4,
          head: 4,
          updatedAt: 1,
        },
      },
      updatedAt: 1,
    }
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: 'aisle-2',
      aisles: {
        ...beforeCursorLocation.aisles,
        'aisle-2': {
          anchor: 1,
          head: 1,
          updatedAt: 2,
        },
      },
      updatedAt: 2,
    }
    const before = createSnapshot([aisle('aisle-1', 'keep this selected text', 'body-1')], 'aisle-1', beforeCursorLocation)
    const after = createSnapshot([
      aisle('aisle-1', 'keep this', 'body-1'),
      aisle('aisle-2', 'selected text', 'body-2'),
    ], 'aisle-2', afterCursorLocation)
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)
    const currentState = createStateWithAisles(after.aisles, {
      [after.locationKey]: afterCursorLocation,
    })

    const nextState = applyAisleStructuralEntryToState(currentState, entry, 'undo')
    const nextBody = nextState?.noteBodies.find((body) => body.id === 'body-1')

    expect(nextState).not.toBeNull()
    expect(nextBody ? resolveNoteAisles(nextBody.aisles, nextState?.noteAisleBodies) : []).toEqual(before.aisles)
    expect(nextState?.ui.noteCursorLocations[before.locationKey]).toEqual(beforeCursorLocation)
    expect(nextState?.activeSpaceId).toBe('space-1')
    expect(nextState?.spaces[0]?.data.activeTabId).toBe('tab-1')
  })

  it('applies scratchpad add-aisle undo without requiring a note location', () => {
    const beforeCursorLocation: NoteCursorLocation = {
      activeAisleId: 'aisle-1',
      aisles: {},
      updatedAt: 1,
    }
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: 'aisle-2',
      aisles: {},
      updatedAt: 2,
    }
    const before = createScratchpadSnapshot([aisle('aisle-1', 'first', 'body-1')], 'aisle-1', beforeCursorLocation)
    const after = createScratchpadSnapshot([
      aisle('aisle-1', 'first', 'body-1'),
      aisle('aisle-2', '', 'body-2'),
    ], 'aisle-2', afterCursorLocation)
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)
    const currentState = createStateWithScratchpadAisles(after.aisles, {
      [SCRATCHPAD_CURSOR_LOCATION_KEY]: afterCursorLocation,
    })

    const nextState = applyAisleStructuralEntryToState(currentState, entry, 'undo')
    const nextBody = nextState?.noteBodies.find((body) => body.id === 'scratch-body')

    expect(nextState).not.toBeNull()
    expect(nextBody ? resolveNoteAisles(nextBody.aisles, nextState?.noteAisleBodies) : []).toEqual(before.aisles)
    expect(nextState?.scratchpad?.activeAisleId).toBe('aisle-1')
    expect(nextState?.ui.noteCursorLocations[SCRATCHPAD_CURSOR_LOCATION_KEY]).toEqual(beforeCursorLocation)
  })

  it('allows undoing an added aisle after blank placeholder-only editor content', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'first'),
      aisle('aisle-2', `${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`),
    ])).toBe(true)
  })

  it('does not apply when another structural edit changed the aisle order', () => {
    const before = createSnapshot([aisle('aisle-1', 'first')])
    const after = createSnapshot([aisle('aisle-1', 'first'), aisle('aisle-2', '')], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('add-aisle', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-2', ''),
      aisle('aisle-1', 'first'),
    ])).toBe(false)
  })

  it('allows undoing and redoing a batch aisle edit from exact source states', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
      aisle('aisle-3', 'third'),
    ])
    const after = createSnapshot([
      aisle('aisle-3', 'third'),
      aisle('aisle-1', 'first'),
      aisle('aisle-4', ''),
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('allows batch aisle undo and redo after aisle text changed', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first before', 'body-1'),
      aisle('aisle-2', 'second before', 'body-2'),
    ])
    const after = createSnapshot([
      aisle('aisle-2', 'second before', 'body-2'),
      aisle('aisle-1', 'first before', 'body-1'),
    ], 'aisle-2')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-2', 'second edited', 'body-2'),
      aisle('aisle-1', 'first edited', 'body-1'),
    ])).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      aisle('aisle-1', 'first edited again', 'body-1'),
      aisle('aisle-2', 'second edited again', 'body-2'),
    ])).toBe(true)
  })

  it('allows exact undo and redo of aisle body de-couple edits', () => {
    const before = createSnapshot([aisle('aisle-1', 'current text', 'shared-body')])
    const after = createSnapshot([aisle('aisle-1', 'current text', 'independent-body')])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', after.aisles)).toBe(true)
    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', before.aisles)).toBe(true)
  })

  it('blocks aisle body de-couple undo after the independent text changed', () => {
    const before = createSnapshot([aisle('aisle-1', 'current text', 'shared-body')])
    const after = createSnapshot([aisle('aisle-1', 'current text', 'independent-body')])
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'undo', [
      aisle('aisle-1', 'edited after de-couple', 'independent-body'),
    ])).toBe(false)
  })

  it('rejects stale batch edits after another reorder changed the source state', () => {
    const before = createSnapshot([
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
      aisle('aisle-3', 'third'),
    ])
    const after = createSnapshot([
      aisle('aisle-3', 'third'),
      aisle('aisle-1', 'first'),
      aisle('aisle-2', 'second'),
    ], 'aisle-1')
    const entry = createAisleStructuralHistoryEntry('edit-aisles', before, after)

    expect(canApplyAisleStructuralEntryToAisles(entry, 'redo', [
      aisle('aisle-2', 'second'),
      aisle('aisle-1', 'first'),
      aisle('aisle-3', 'third'),
    ])).toBe(false)
  })
})
