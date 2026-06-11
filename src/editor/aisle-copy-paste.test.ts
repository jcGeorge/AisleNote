import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteLocation, Space } from '../types/app'
import type { AisleStructuralSnapshot } from './aisle-structural-history'
import {
  buildFocusedAisleStructuralPasteReplacement,
  getCopyAsNewAislePasteFocusedAisleReplacementMode,
  getCopyAsPasteHereFocusedAisleReplacementMode,
} from './aisle-copy-paste'

const sourceLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-source',
  subTabId: null,
}

function createPasteState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-target',
      tabs: [
        {
          id: 'tab-source',
          title: 'source',
          noteBodyId: 'body-source',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-target',
          title: 'target',
          noteBodyId: 'body-target',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      {
        id: 'body-source',
        aisles: [
          { id: 'aisle-source-1', aisleBodyId: 'aisle-source-body-1' },
          { id: 'aisle-source-2', aisleBodyId: 'aisle-source-body-2' },
        ],
      },
      {
        id: 'body-target',
        aisles: [
          { id: 'aisle-target-left', aisleBodyId: 'aisle-target-body-left' },
          { id: 'aisle-target-focus', aisleBodyId: 'aisle-target-body-focus' },
          { id: 'aisle-target-right', aisleBodyId: 'aisle-target-body-right' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'aisle-source-body-1', markdown: 'source one', frontmatterStatus: 'none' },
      { id: 'aisle-source-body-2', markdown: 'source two', frontmatterStatus: 'none' },
      { id: 'aisle-target-body-left', markdown: 'left target', frontmatterStatus: 'none' },
      { id: 'aisle-target-body-focus', markdown: 'focused target', frontmatterStatus: 'none' },
      { id: 'aisle-target-body-right', markdown: 'right target', frontmatterStatus: 'none' },
    ],
    hotkeys: {
      shortcuts: {
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
        toggleNotesFilter: '',
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

function createSnapshot(activeAisleId = 'aisle-target-focus'): AisleStructuralSnapshot {
  return {
    locationKey: 'domain-1/space-1/tab-target/home',
    noteBodyId: 'body-target',
    aisles: [],
    activeAisleId,
    cursorLocation: null,
  }
}

describe('focused aisle structural paste replacement', () => {
  it('uses replace-any only for synced aisle paste-here', () => {
    expect(getCopyAsPasteHereFocusedAisleReplacementMode({
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })).toBe('always')
    expect(getCopyAsPasteHereFocusedAisleReplacementMode({
      version: 1,
      scope: 'aisle',
      action: 'copy',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })).toBe('blank-only')
    expect(getCopyAsPasteHereFocusedAisleReplacementMode({
      version: 1,
      scope: 'note',
      action: 'duplicate',
      source: sourceLocation,
    })).toBeNull()
  })

  it('keeps explicit new-aisle paste replacement blank-only', () => {
    expect(getCopyAsNewAislePasteFocusedAisleReplacementMode({
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })).toBe('blank-only')
    expect(getCopyAsNewAislePasteFocusedAisleReplacementMode({
      version: 1,
      scope: 'aisle',
      action: 'copy',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })).toBe('blank-only')
    expect(getCopyAsNewAislePasteFocusedAisleReplacementMode({
      version: 1,
      scope: 'aisle',
      action: 'link',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })).toBeNull()
  })

  it('replaces a non-empty focused aisle when pasting a synced aisle here', () => {
    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: createPasteState(),
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'duplicate',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
      beforeSnapshot: createSnapshot(),
      mode: 'always',
      maxAisles: 8,
    })

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected applied paste')
    expect(result.aisles.map((aisle) => aisle.markdown)).toEqual(['left target', 'source two', 'right target'])
    expect(result.aisles.map((aisle) => aisle.aisleBodyId)).toEqual([
      'aisle-target-body-left',
      'aisle-source-body-2',
      'aisle-target-body-right',
    ])
    expect(result.activeAisleId).toBe(result.aisles[1]?.id)
    expect(result.aisleBodies).toHaveLength(0)
  })

  it('does not replace a non-empty focused aisle for independent copies in blank-only mode', () => {
    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: createPasteState(),
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'copy',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
      beforeSnapshot: createSnapshot(),
      mode: 'blank-only',
      maxAisles: 8,
    })

    expect(result).toEqual({ status: 'not-applicable' })
  })

  it('replaces a blank focused aisle for independent copies in blank-only mode', () => {
    const state = createPasteState()
    state.noteAisleBodies = (state.noteAisleBodies ?? []).map((body) =>
      body.id === 'aisle-target-body-focus' ? { ...body, markdown: '' } : body,
    )

    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: state,
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'copy',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
      beforeSnapshot: createSnapshot(),
      mode: 'blank-only',
      maxAisles: 8,
    })

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected applied paste')
    expect(result.aisles.map((aisle) => aisle.markdown)).toEqual(['left target', 'source two', 'right target'])
    expect(result.aisles[1]?.aisleBodyId).not.toBe('aisle-source-body-2')
    expect(result.aisleBodies).toHaveLength(1)
  })

  it('blocks required replacement when the focused aisle is missing', () => {
    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: createPasteState(),
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'duplicate',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
      beforeSnapshot: createSnapshot('missing-aisle'),
      mode: 'always',
      maxAisles: 8,
    })

    expect(result).toEqual({ status: 'blocked', message: 'Destination aisle no longer exists.' })
  })
})
