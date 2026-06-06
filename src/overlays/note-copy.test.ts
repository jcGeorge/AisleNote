import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { getLocationInfo } from '../notes/note-locations'
import { getAisleMarkdown } from '../notes/note-markdown'
import { applyMarkdownToAppState } from '../state/app-state'
import type { AppState, NoteAisle, NoteLocation, Space } from '../types/app'
import { applyNoteCopyToState } from './note-copy'

const sourceLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-source',
  subTabId: null,
}

const targetLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-target',
  subTabId: null,
}

const peerLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-peer',
  subTabId: null,
}

const aisleMarkdown = (state: AppState, aisle: NoteAisle | null | undefined) =>
  aisle ? getAisleMarkdown(aisle, state.noteAisleBodies) : ''

function createCopyTestState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-source',
      tabs: [
        {
          id: 'tab-source',
          title: 'Source',
          noteBodyId: 'body-source',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-target',
          title: 'Target',
          noteBodyId: 'body-target',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-peer',
          title: 'Peer',
          noteBodyId: 'body-source',
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
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      { id: 'body-source', aisles: [{ id: 'aisle-source', aisleBodyId: 'aisle-source' }] },
      {
        id: 'body-target',
        aisles: [
          { id: 'aisle-target', aisleBodyId: 'aisle-target' },
          { id: 'aisle-target-2', aisleBodyId: 'aisle-target-2' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'aisle-source', markdown: 'source text', frontmatterStatus: 'none' },
      { id: 'aisle-target', markdown: 'target text', frontmatterStatus: 'none' },
      { id: 'aisle-target-2', markdown: 'second target aisle', frontmatterStatus: 'none' },
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

describe('note copy helpers', () => {
  it('creates an independent copy of the target body', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'independent')

    expect(result.status).toBe('applied')
    const sourceInfo = getLocationInfo(result.state, sourceLocation)
    expect(sourceInfo.noteBodyId).not.toBe('body-source')
    expect(sourceInfo.noteBodyId).not.toBe('body-target')
    expect(result.state.noteBodies).toHaveLength(4)
    const sourceAisle = result.state.noteBodies.find((body) => body.id === sourceInfo.noteBodyId)?.aisles[0]
    expect(aisleMarkdown(result.state, sourceAisle)).toBe('target text')
    expect(getLocationInfo(result.state, targetLocation).noteBodyId).toBe('body-target')
  })

  it('links the source to the target body without cloning', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'linked')

    expect(result.status).toBe('applied')
    expect(getLocationInfo(result.state, sourceLocation).noteBodyId).toBe('body-target')
    expect(getLocationInfo(result.state, peerLocation).noteBodyId).toBe('body-source')
    expect(result.state.noteBodies).toHaveLength(3)
  })

  it('no-ops when linking a note to a target that already shares its body', () => {
    const linked = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'linked').state
    const result = applyNoteCopyToState(linked, sourceLocation, targetLocation, 'linked')

    expect(result.status).toBe('already-linked')
    expect(result.state).toBe(linked)
    expect(getLocationInfo(result.state, sourceLocation).noteBodyId).toBe('body-target')
    expect(getLocationInfo(result.state, targetLocation).noteBodyId).toBe('body-target')
  })

  it('turns a same-body target into an independent clone when making an independent copy', () => {
    const linked = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'linked').state
    const result = applyNoteCopyToState(linked, sourceLocation, targetLocation, 'independent')
    const sourceBodyId = getLocationInfo(result.state, sourceLocation).noteBodyId

    expect(result.status).toBe('applied')
    expect(sourceBodyId).not.toBe('body-target')
    expect(result.state.noteBodies).toHaveLength(4)
    const sourceAisle = result.state.noteBodies.find((body) => body.id === sourceBodyId)?.aisles[0]
    expect(aisleMarkdown(result.state, sourceAisle)).toBe('target text')
    expect(getLocationInfo(result.state, targetLocation).noteBodyId).toBe('body-target')
  })

  it('blocks exact self-copy', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, sourceLocation, 'independent')

    expect(result.status).toBe('self-copy')
    expect(result.state).toEqual(createCopyTestState())
  })

  it('replaces with independent selected aisle copies while keeping destination metadata', () => {
    const state = createCopyTestState()
    const targetAisleBody = state.noteAisleBodies?.find((body) => body.id === 'aisle-target-2')
    if (targetAisleBody) {
      targetAisleBody.frontmatter = { status: 'draft' }
      targetAisleBody.frontmatterStatus = 'valid'
    }
    const result = applyNoteCopyToState(
      state,
      sourceLocation,
      { ...targetLocation, aisleIds: ['aisle-target-2'] },
      'independent',
      'replace',
    )
    const sourceBodyId = getLocationInfo(result.state, sourceLocation).noteBodyId
    const sourceBody = result.state.noteBodies.find((body) => body.id === sourceBodyId)
    const sourceAisleBody = result.state.noteAisleBodies?.find((body) => body.id === sourceBody?.aisles[0]?.aisleBodyId)

    expect(result.status).toBe('applied')
    expect(sourceAisleBody?.frontmatter).toEqual({ status: 'draft' })
    expect(sourceBody?.aisles.map((aisle) => aisleMarkdown(result.state, aisle))).toEqual(['second target aisle'])
    expect(getLocationInfo(result.state, targetLocation).noteBodyId).toBe('body-target')
  })

  it('appends independent selected aisle copies to the destination body', () => {
    const result = applyNoteCopyToState(
      createCopyTestState(),
      sourceLocation,
      { ...targetLocation, aisleIds: ['aisle-target-2'] },
      'independent',
      'append',
    )

    expect(result.status).toBe('applied')
    expect(getLocationInfo(result.state, sourceLocation).noteBodyId).toBe('body-source')
    expect(getLocationInfo(result.state, peerLocation).noteBodyId).toBe('body-source')
    expect(result.state.noteBodies.find((body) => body.id === 'body-source')?.aisles.map((aisle) => aisleMarkdown(result.state, aisle))).toEqual([
      'source text',
      'second target aisle',
    ])
  })

  it('replaces with linked selected aisles as shared aisle text', () => {
    const state = createCopyTestState()
    const targetAisleBody = state.noteAisleBodies?.find((body) => body.id === 'aisle-target-2')
    if (targetAisleBody) {
      targetAisleBody.frontmatter = { owner: 'destination' }
      targetAisleBody.frontmatterStatus = 'valid'
    }
    const result = applyNoteCopyToState(
      state,
      sourceLocation,
      { ...targetLocation, aisleIds: ['aisle-target-2'] },
      'linked',
      'replace',
    )
    const sourceBodyId = getLocationInfo(result.state, sourceLocation).noteBodyId
    const sourceBody = result.state.noteBodies.find((body) => body.id === sourceBodyId)
    const targetBody = result.state.noteBodies.find((body) => body.id === 'body-target')
    const targetAisle = targetBody?.aisles.find((aisle) => aisle.id === 'aisle-target-2')
    const sourceAisleBody = result.state.noteAisleBodies?.find((body) => body.id === sourceBody?.aisles[0]?.aisleBodyId)

    expect(result.status).toBe('applied')
    expect(sourceAisleBody?.frontmatter).toEqual({ owner: 'destination' })
    expect(sourceBody?.aisles).toHaveLength(1)
    expect(aisleMarkdown(result.state, sourceBody?.aisles[0])).toBe('second target aisle')
    expect(sourceBody?.aisles[0]?.aisleBodyId).toBe(targetAisle?.aisleBodyId)
    expect(aisleMarkdown(result.state, sourceBody?.aisles[0])).not.toContain('{{tabs-preview')
  })

  it('appends linked all-aisle copies to the destination body', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'linked', 'append')
    const sourceBody = result.state.noteBodies.find((body) => body.id === 'body-source')
    const targetBody = result.state.noteBodies.find((body) => body.id === 'body-target')

    expect(result.status).toBe('applied')
    expect(sourceBody?.aisles).toHaveLength(3)
    expect(aisleMarkdown(result.state, sourceBody?.aisles[1])).toBe('target text')
    expect(aisleMarkdown(result.state, sourceBody?.aisles[2])).toBe('second target aisle')
    expect(sourceBody?.aisles[1]?.aisleBodyId).toBe(targetBody?.aisles[0]?.aisleBodyId)
    expect(sourceBody?.aisles[2]?.aisleBodyId).toBe(targetBody?.aisles[1]?.aisleBodyId)
  })

  it('updates every linked aisle when one shared aisle copy is edited', () => {
    const copied = applyNoteCopyToState(
      createCopyTestState(),
      sourceLocation,
      { ...targetLocation, aisleIds: ['aisle-target-2'] },
      'linked',
      'replace',
    )
    const sourceBodyId = getLocationInfo(copied.state, sourceLocation).noteBodyId
    const sourceBody = copied.state.noteBodies.find((body) => body.id === sourceBodyId)
    const sourceAisleId = sourceBody?.aisles[0]?.id ?? ''
    const edited = applyMarkdownToAppState(copied.state, 'space-1', 'tab-source', null, sourceAisleId, 'linked edit')
    const editedSourceBody = edited.noteBodies.find((body) => body.id === sourceBodyId)
    const editedTargetBody = edited.noteBodies.find((body) => body.id === 'body-target')

    expect(aisleMarkdown(edited, editedSourceBody?.aisles[0])).toBe('linked edit')
    expect(aisleMarkdown(edited, editedTargetBody?.aisles.find((aisle) => aisle.id === 'aisle-target-2'))).toBe('linked edit')
  })

  it('allows appending linked copies of a note into its own aisles', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, sourceLocation, 'linked', 'append')
    const sourceBody = result.state.noteBodies.find((body) => body.id === 'body-source')

    expect(result.status).toBe('applied')
    expect(sourceBody?.aisles).toHaveLength(2)
    expect(aisleMarkdown(result.state, sourceBody?.aisles[1])).toBe('source text')
    expect(sourceBody?.aisles[1]?.aisleBodyId).toBe(sourceBody?.aisles[0]?.aisleBodyId)
  })
})
