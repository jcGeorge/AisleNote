import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { BUILT_IN_THEME_PALETTE_SEEDS, DEFAULT_CUSTOM_THEME_PALETTE, DEFAULT_UI_SETTINGS } from '../settings/defaults'
import { syncNoteBodyAisleStructureInState } from '../notes/note-state'
import { getAisleMarkdown } from '../notes/note-markdown'
import type {
  AppState,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  DeletedSubTabEntry,
  DeletedTabEntry,
  Space,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'
import {
  DEFAULT_STATE,
  applyAutoPurgeToAppState,
  applyMarkdownToAppState,
  getNextAutoPurgeTimeForAppState,
  parseSavedState,
} from './app-state'
import { getScratchpadNoteBody } from './scratchpad'
import { AUTO_PURGE_DAY_MS } from './workspace'

const liveTab: Tab = {
  id: 'live-tab',
  title: 'Live',
  noteBodyId: 'live-body',
  activeSubTabId: null,
  subTabs: [],
}

function deletedTab(id: string, deletedAt: number): DeletedTabEntry {
  return {
    id: `deleted-${id}`,
    tab: {
      id,
      title: id,
      noteBodyId: `${id}-body`,
      activeSubTabId: null,
      subTabs: [],
    },
    deletedAt,
  }
}

function deletedSubTab(id: string, deletedAt: number): DeletedSubTabEntry {
  const subTab: SubTab = {
    id,
    title: id,
    noteBodyId: `${id}-body`,
  }
  return {
    id: `deleted-${id}`,
    parentTabId: liveTab.id,
    parentTabTitle: liveTab.title,
    subTab,
    deletedAt,
  }
}

function workspace(
  deletedTabs: DeletedTabEntry[] = [],
  deletedSubTabs: DeletedSubTabEntry[] = [],
): WorkspaceData {
  return {
    activeTabId: liveTab.id,
    tabs: [liveTab],
    deletedTabs,
    deletedSubTabs,
  }
}

function space(id: string, autoRemoveDeletedDays: number, data: WorkspaceData): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays },
    data,
  }
}

function deletedSpaceEntry(id: string, deletedAt: number, targetSpace: Space): DeletedSpaceEntry {
  return {
    id,
    domainId: 'domain-1',
    domainName: 'Domain',
    space: targetSpace,
    deletedAt,
  }
}

function deletedDomainEntry(
  id: string,
  deletedAt: number,
  spaces: Space[],
  deletedSpaces: DeletedSpaceEntry[] = [],
): DeletedDomainEntry {
  return {
    id,
    domain: {
      id: `${id}-domain`,
      name: id,
      activeSpaceId: spaces[0]?.id ?? '',
      spaces,
    },
    deletedSpaces,
    deletedAt,
  }
}

function appStateWithSpaces(spaces: Space[]): AppState {
  const domain = {
    id: 'domain-1',
    name: 'Domain',
    activeSpaceId: spaces[0]?.id ?? '',
    spaces,
  }
  return {
    theme: 'dawn',
    activeDomainId: domain.id,
    domains: [domain],
    deletedDomains: [],
    deletedSpaces: [],
    noteBodies: [],
    activeSpaceId: domain.activeSpaceId,
    spaces,
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
}

function defaultModernSpace(): Space {
  return {
    id: 'space',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: 'tab',
      tabs: [
        {
          id: 'tab',
          title: 'Tab',
          noteBodyId: 'body-1',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function modernState(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.domains)) return raw
  const spaces = Array.isArray(raw.spaces) && raw.spaces.length > 0 ? raw.spaces : [defaultModernSpace()]
  const activeSpaceId = typeof raw.activeSpaceId === 'string' ? raw.activeSpaceId : String((spaces[0] as { id?: string }).id ?? '')
  const domain = {
    id: 'domain',
    name: 'Domain',
    activeSpaceId,
    spaces,
  }
  return {
    ...raw,
    activeDomainId: typeof raw.activeDomainId === 'string' ? raw.activeDomainId : domain.id,
    domains: [domain],
    activeSpaceId,
    spaces,
  }
}

function parseModernState(raw: Record<string, unknown>): AppState {
  return parseSavedState(JSON.stringify(modernState(raw)))
}

describe('app state normalization', () => {
  it('normalizes missing scratchpad data into a single editable aisle', () => {
    const state = parseModernState({ ui: {} })
    const scratchpadBody = getScratchpadNoteBody(state)

    expect(state.scratchpad?.noteBodyId).toBeTruthy()
    expect(scratchpadBody?.aisles).toHaveLength(1)
    expect(state.noteAisleBodies?.some((body) => body.id === scratchpadBody?.aisles[0]?.aisleBodyId)).toBe(true)
  })

  it('normalizes scratchpad aisle limits independently from normal note limits', () => {
    const missing = parseModernState({ ui: {} })
    const custom = parseModernState({ ui: { scratchpadAisleLimit: 24 } })
    const tooSmall = parseModernState({ ui: { scratchpadAisleLimit: 2 } })
    const tooLarge = parseModernState({ ui: { scratchpadAisleLimit: 99 } })

    expect(missing.ui.scratchpadAisleLimit).toBe(16)
    expect(custom.ui.scratchpadAisleLimit).toBe(24)
    expect(tooSmall.ui.scratchpadAisleLimit).toBe(8)
    expect(tooLarge.ui.scratchpadAisleLimit).toBe(40)
  })

  it('normalizes persisted inbox messages and toast history', () => {
    const state = parseModernState({
      messages: [
        {
          id: 'message-1',
          type: 'duplicate-auto-decoupled',
          status: 'unread',
          createdAt: '2026-06-01T00:00:00.000Z',
          signature: 'signature-1',
          title: 'duplicate files de-coupled',
          body: '1 changed duplicate file was de-coupled.',
          anchorPath: 'notes/anchor.md',
          decoupledPaths: ['notes/other.md'],
          affectedLocations: [
            {
              label: 'de-coupled',
              path: 'notes/other.md',
              location: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
            },
          ],
        },
        {
          id: 'message-2',
          type: 'storage-notebook-recovered',
          status: 'acknowledged',
          createdAt: '2026-06-01T00:02:00.000Z',
          signature: 'storage-recovery-1',
          title: 'Started local notebook',
          body: 'Tabs could not load the connected notebook.',
          failedNotebookPath: '/tmp/Bad Notebook',
          failedNotebookAvailable: false,
          activeNotebookPath: '/tmp/Default Notebook',
          activeNotebookName: 'Default Notebook',
          recoveryMode: 'created-local',
          issueSummary: ['manifest.json: Root manifest is corrupt.'],
        },
        { id: 'ignored', type: 'unknown' },
      ],
      toastHistory: [
        {
          id: 1,
          createdAt: '2026-06-01T00:00:00.000Z',
          message: 'first warning',
          tone: 'warning',
        },
        {
          id: 2,
          createdAt: '2026-06-01T00:01:00.000Z',
          message: 'second success',
          tone: 'success',
        },
        { id: 3, message: '', tone: 'error' },
      ],
    })

    expect(state.messages).toHaveLength(2)
    expect(state.messages?.[0]).toMatchObject({
      id: 'message-1',
      status: 'unread',
      anchorPath: 'notes/anchor.md',
      decoupledPaths: ['notes/other.md'],
    })
    expect(state.messages?.[1]).toMatchObject({
      id: 'message-2',
      type: 'storage-notebook-recovered',
      status: 'acknowledged',
      failedNotebookPath: '/tmp/Bad Notebook',
      failedNotebookAvailable: false,
      activeNotebookPath: '/tmp/Default Notebook',
      activeNotebookName: 'Default Notebook',
      recoveryMode: 'created-local',
      issueSummary: ['manifest.json: Root manifest is corrupt.'],
    })
    expect(state.messages?.[0].affectedLocations?.[0].location).toEqual({
      domainId: 'domain',
      spaceId: 'space',
      tabId: 'tab',
      subTabId: null,
    })
    expect(state.toastHistory).toEqual([
      {
        id: 1,
        createdAt: '2026-06-01T00:00:00.000Z',
        message: 'first warning',
        tone: 'warning',
      },
      {
        id: 2,
        createdAt: '2026-06-01T00:01:00.000Z',
        message: 'second success',
        tone: 'success',
      },
    ])
  })

  it('normalizes unknown message statuses to unread', () => {
    const state = parseModernState({
      messages: [
        {
          id: 'message-1',
          type: 'storage-notebook-recovered',
          status: 'snoozed',
          createdAt: '2026-06-01T00:00:00.000Z',
          signature: 'storage-recovery-1',
          title: 'Started local notebook',
          body: 'Tabs could not load the connected notebook.',
        },
      ],
    })

    expect(state.messages?.[0]).toMatchObject({
      id: 'message-1',
      status: 'unread',
    })
  })

  it('keeps only the newest 70 normalized toast history entries', () => {
    const state = parseModernState({
      toastHistory: Array.from({ length: 72 }, (_, index) => ({
        id: index + 1,
        createdAt: `2026-06-01T00:${String(index).padStart(2, '0')}:00.000Z`,
        message: `toast ${index + 1}`,
        tone: 'warning',
      })),
    })

    expect(state.toastHistory?.map((toast) => toast.id)).toEqual(Array.from({ length: 70 }, (_, index) => index + 3))
  })

  it('fills default command shortcuts when saved hotkeys only contain newline shortcuts', () => {
    const state = parseModernState({
      hotkeys: {
        newlineShortcuts: {
          shortcuts: {
            controlEnter: 'blockQuote',
          },
          menuOperations: ['blockQuote'],
        },
      },
    })

    expect(state.hotkeys.shortcuts.toggleNotesTrash).toBe(DEFAULT_SHORTCUTS.toggleNotesTrash)
    expect(state.hotkeys.shortcuts.toggleNotesScratchpad).toBe(DEFAULT_SHORTCUTS.toggleNotesScratchpad)
    expect(state.hotkeys.shortcuts.toggleNotesFilter).toBe(DEFAULT_SHORTCUTS.toggleNotesFilter)
    expect(state.hotkeys.shortcuts.openSpaces).toBe(DEFAULT_SHORTCUTS.openSpaces)
    expect(state.hotkeys.newlineShortcuts.shortcuts.controlEnter).toBe('blockQuote')
    expect(state.hotkeys.newlineShortcuts.shortcuts.shiftEnter).toBe(
      DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.shiftEnter,
    )
  })

  it('rejects legacy spaces-only app data', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'invalid-theme',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  activeSubTabId: 'sub-1',
                  subTabs: [{ id: 'sub-1', title: 'Sub', content: 'legacy sub' }],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      }),
    )

    expect(state).toBe(DEFAULT_STATE)
  })

  it('updates note body markdown through the aisle body source of truth', () => {
    const state = parseSavedState(null)
    const space = state.spaces[0]
    const tab = space.data.tabs[0]
    const aisleId = state.noteBodies.find((body) => body.id === tab.noteBodyId)?.aisles[0]?.id ?? ''
    const next = applyMarkdownToAppState(state, space.id, tab.id, null, aisleId, 'updated')
    const nextTab = next.spaces[0].data.tabs[0]
    const nextBody = next.noteBodies.find((body) => body.id === nextTab.noteBodyId)

    expect(nextBody?.aisles[0] ? getAisleMarkdown(nextBody.aisles[0], next.noteAisleBodies) : '').toBe('updated')
  })

  it('updates derived aisle tags when markdown changes', () => {
    const state = parseSavedState(null)
    const space = state.spaces[0]
    const tab = space.data.tabs[0]
    const body = state.noteBodies.find((candidate) => candidate.id === tab.noteBodyId)
    const aisle = body?.aisles[0]
    const next = applyMarkdownToAppState(state, space.id, tab.id, null, aisle?.id ?? '', '#Sermon\n\nBody #Study')
    const nextAisleBody = next.noteAisleBodies?.find((candidate) => candidate.id === aisle?.aisleBodyId)

    expect(nextAisleBody?.tags).toEqual(['Sermon', 'Study'])
  })

  it('migrates frontmatter tags into visible markdown and marks them computed', () => {
    const state = parseModernState({
      noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
      noteAisleBodies: [
        {
          id: 'aisle-body-1',
          markdown: '---\ntags:\n  - Card\n  - Unfinished\n---\nBody',
        },
      ],
    })
    const aisleBody = state.noteAisleBodies?.find((candidate) => candidate.id === 'aisle-body-1')

    expect(aisleBody?.markdown).toBe('#Card #Unfinished\n\nBody')
    expect(aisleBody?.tags).toEqual(['Card', 'Unfinished'])
    expect(aisleBody?.frontmatter).toEqual({ tags: ['Card', 'Unfinished'] })
    expect(aisleBody?.frontmatterMeta?.computedFields).toEqual({ tags: 'tags' })
  })

  it('does not re-import stale computed frontmatter tags after visible tags are removed', () => {
    const state = parseModernState({
      noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
      noteAisleBodies: [
        {
          id: 'aisle-body-1',
          markdown: '---\ntags:\n  - Old\n---\nBody without tags',
          frontmatterMeta: { computedFields: { tags: 'tags' } },
        },
      ],
    })
    const aisleBody = state.noteAisleBodies?.find((candidate) => candidate.id === 'aisle-body-1')

    expect(aisleBody?.markdown).toBe('Body without tags')
    expect(aisleBody?.tags).toEqual([])
    expect(aisleBody?.frontmatter).toEqual({ tags: [] })
  })

  it('normalizes structural aisles with shared aisle body records', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
        noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'body text' }],
      })

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')
    const aisleBodyId = body?.aisles[0]?.aisleBodyId

    expect(aisleBodyId).toBe('aisle-body-1')
    expect(state.noteAisleBodies?.find((aisleBody) => aisleBody.id === aisleBodyId)?.markdown).toBe('body text')
    expect(body?.aisles[0] ? getAisleMarkdown(body.aisles[0], state.noteAisleBodies) : '').toBe('body text')
  })

  it('repairs duplicate entity ids while parsing manually edited state', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: 'sub-1',
                  subTabs: [{ id: 'sub-1', title: 'Sub', noteBodyId: 'body-2' }],
                },
                {
                  id: 'tab-1',
                  title: 'Duplicate Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: 'sub-1',
                  subTabs: [{ id: 'sub-1', title: 'Duplicate Sub', noteBodyId: 'body-2' }],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] },
          { id: 'body-1', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-body-2' }] },
          { id: 'body-2', aisles: [{ id: 'aisle-3', aisleBodyId: 'aisle-body-3' }] },
        ],
        noteAisleBodies: [
          { id: 'aisle-body-1', markdown: 'first' },
          { id: 'aisle-body-1', markdown: 'duplicate' },
          { id: 'aisle-body-2', markdown: 'second' },
          { id: 'aisle-body-3', markdown: 'sub' },
        ],
      })
    const tabs = state.spaces[0].data.tabs
    const tabIds = tabs.map((tabEntry) => tabEntry.id)
    const subTabIds = tabs.flatMap((tabEntry) => tabEntry.subTabs.map((subTab) => subTab.id))
    const noteBodyIds = state.noteBodies.map((body) => body.id)
    const aisleBodyIds = (state.noteAisleBodies ?? []).map((body) => body.id)

    expect(new Set(tabIds).size).toBe(tabIds.length)
    expect(new Set(subTabIds).size).toBe(subTabIds.length)
    expect(new Set(noteBodyIds).size).toBe(noteBodyIds.length)
    expect(new Set(aisleBodyIds).size).toBe(aisleBodyIds.length)
    expect(tabs[0].noteBodyId).toBe('body-1')
    expect(tabs[1].noteBodyId).toBe('body-1')
  })

  it('updates duplicate linked aisle slots together without stale sibling whitespace winning', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'Hat Trick!\\n\\nold whitespace' }],
        noteBodies: [
          {
            id: 'body-1',
            aisles: [
              { id: 'aisle-1', aisleBodyId: 'shared-aisle-body' },
              { id: 'aisle-2', aisleBodyId: 'shared-aisle-body' },
            ],
          },
        ],
      })

    const next = applyMarkdownToAppState(
      state,
      'space-1',
      'tab-1',
      null,
      'aisle-1',
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    )
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    )
    expect(body?.aisles.map((aisle) => getAisleMarkdown(aisle, next.noteAisleBodies))).toEqual([
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    ])
  })

  it('lets a linked aisle edit the same aisle body used by direct note duplicates', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
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
                  noteBodyId: 'body-target',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [
          { id: 'source-aisle-body', markdown: 'source text' },
          { id: 'shared-aisle-body', markdown: 'base text' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-source', null, 'linked-aisle', 'linked aisle edit')
    const sourceBody = next.noteBodies.find((body) => body.id === 'body-source')
    const targetBody = next.noteBodies.find((body) => body.id === 'body-target')

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'linked aisle edit',
    )
    expect(sourceBody?.aisles.find((aisle) => aisle.id === 'linked-aisle') ? getAisleMarkdown(sourceBody.aisles.find((aisle) => aisle.id === 'linked-aisle')!, next.noteAisleBodies) : '').toBe('linked aisle edit')
    expect(targetBody?.aisles[0] ? getAisleMarkdown(targetBody.aisles[0], next.noteAisleBodies) : '').toBe('linked aisle edit')
  })

  it('can commit by aisle body id when a linked aisle slot id is stale or mismatched', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
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
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [
          { id: 'source-aisle-body', markdown: 'source text' },
          { id: 'shared-aisle-body', markdown: 'base text' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })

    const next = applyMarkdownToAppState(
      state,
      'space-1',
      'tab-source',
      null,
      'source-aisle',
      'body-id edit',
      { aisleBodyId: 'shared-aisle-body' },
    )

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'body-id edit',
    )
    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'source-aisle-body')?.markdown).toBe(
      'source text',
    )
    const sourceAisle = next.noteBodies.find((body) => body.id === 'body-source')?.aisles[1]
    const targetAisle = next.noteBodies.find((body) => body.id === 'body-target')?.aisles[0]
    expect(sourceAisle ? getAisleMarkdown(sourceAisle, next.noteAisleBodies) : '').toBe('body-id edit')
    expect(targetAisle ? getAisleMarkdown(targetAisle, next.noteAisleBodies) : '').toBe('body-id edit')
  })

  it('keeps the remaining linked aisle writable after deleting a sibling linked aisle', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
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
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [
          { id: 'target-aisle-body-a', markdown: 'target a' },
          { id: 'target-aisle-body-b', markdown: 'target b' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'linked-aisle-a', aisleBodyId: 'target-aisle-body-a' },
              { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b' },
            ],
          },
          {
            id: 'body-target',
            aisles: [
              { id: 'target-aisle-a', aisleBodyId: 'target-aisle-body-a' },
              { id: 'target-aisle-b', aisleBodyId: 'target-aisle-body-b' },
            ],
          },
        ],
      })

    const afterDelete = syncNoteBodyAisleStructureInState(state, 'body-source', [
      { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b', markdown: 'stale target b' },
    ])
    const afterEdit = applyMarkdownToAppState(
      afterDelete,
      'space-1',
      'tab-source',
      null,
      'linked-aisle-b',
      'remaining linked edit',
      { aisleBodyId: 'target-aisle-body-b' },
    )

    expect(afterDelete.noteBodies.find((body) => body.id === 'body-source')?.aisles).toEqual([
      { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b' },
    ])
    expect(afterEdit.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'target-aisle-body-b')?.markdown).toBe(
      'remaining linked edit',
    )
    const editedSourceAisle = afterEdit.noteBodies.find((body) => body.id === 'body-source')?.aisles[0]
    const editedTargetAisle = afterEdit.noteBodies.find((body) => body.id === 'body-target')?.aisles[1]
    expect(editedSourceAisle ? getAisleMarkdown(editedSourceAisle, afterEdit.noteAisleBodies) : '').toBe(
      'remaining linked edit',
    )
    expect(editedTargetAisle ? getAisleMarkdown(editedTargetAisle, afterEdit.noteAisleBodies) : '').toBe(
      'remaining linked edit',
    )
  })

  it('preserves modern note body timestamps with frontmatter on aisle bodies', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-1',
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2026-05-15T12:30:00.000Z',
            aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
          },
        ],
        noteAisleBodies: [
          {
            id: 'aisle-body-1',
            markdown: 'body',
            frontmatter: {
              created: '2024-01-02',
              updatedAt: '2026-05-15T12:30:00.000Z',
            },
          },
        ],
      })

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).toBe('2026-05-15T12:30:00.000Z')
  })

  it('updates note body updatedAt on content edits while preserving createdAt', () => {
    const state = parseModernState({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-1',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-1',
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-03T00:00:00.000Z',
            aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
          },
        ],
        noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'before' }],
      })

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-1', null, 'aisle-1', 'after')
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).not.toBe('2024-01-03T00:00:00.000Z')
  })

  it('normalizes persisted note cursor locations', () => {
    const state = parseModernState({
        ui: {
          noteCursorLocations: {
            'domain::space::tab::__home__': {
              activeAisleId: 'aisle-1',
              aisles: {
                'aisle-1': { anchor: 2, head: 4, updatedAt: 20 },
                broken: { anchor: -1, head: 1, updatedAt: 30 },
              },
            },
          },
        },
      })

    expect(state.ui.noteCursorLocations['domain::space::tab::__home__']).toEqual({
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': { anchor: 2, head: 4, updatedAt: 20 },
      },
      updatedAt: 20,
    })
  })

  it('normalizes persisted heading collapse state', () => {
    const state = parseModernState({
        ui: {
          headingCollapseState: {
            'body-1': {
              'aisle-1': ['heading-a', 'heading-a', '', 4, 'heading-b'],
              '': ['ignored'],
              'aisle-2': [],
            },
            '': {
              'aisle-3': ['ignored'],
            },
            broken: null,
          },
        },
      })
    const missing = parseModernState({ ui: {} })

    expect(state.ui.headingCollapseState).toEqual({
      'body-1': {
        'aisle-1': ['heading-a', 'heading-b'],
      },
    })
    expect(missing.ui.headingCollapseState).toEqual({})
  })

  it('normalizes persisted aisle widths', () => {
    const state = parseModernState({
      ui: {
        aisleWidths: {
          'domain::space::tab::__home__': {
            'aisle-1': 240,
            'aisle-2': 720,
            broken: 'wide',
          },
        },
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(state.ui.aisleWidths).toEqual({
      'domain::space::tab::__home__': {
        'aisle-1': 240,
        'aisle-2': 720,
      },
    })
    expect(missing.ui.aisleWidths).toEqual({})
  })

  it('normalizes persisted custom theme palettes', () => {
    const valid = parseModernState({
      theme: 'custom',
      ui: {
        themePalettes: {
          custom1: {
            primary: '#AbC',
            text: '#123456',
          },
        },
      },
    })
    const invalid = parseModernState({
      theme: 'custom',
      ui: {
        themePalettes: {
          custom1: {
            primary: 'red',
          },
        },
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.theme).toBe('custom1')
    expect(valid.ui.selectedCustomTheme).toBe('custom1')
    expect(valid.ui).not.toHaveProperty('customThemePalette')
    expect(valid.ui.themePalettes?.custom1).toEqual({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#aabbcc',
      text: '#123456',
    })
    expect(invalid.ui.themePalettes?.custom1?.primary).toBe(DEFAULT_CUSTOM_THEME_PALETTE.primary)
    expect(missing.ui).not.toHaveProperty('customThemePalette')
    expect(missing.ui.themePalettes).toEqual({})
  })

  it('normalizes custom theme ids and selected custom theme memory', () => {
    const custom2 = parseModernState({
      theme: 'custom2',
      ui: { selectedCustomTheme: 'custom3' },
    })
    const invalidSelected = parseModernState({
      theme: 'custom3',
      ui: { selectedCustomTheme: 'custom4' },
    })

    expect(custom2.theme).toBe('custom2')
    expect(custom2.ui.selectedCustomTheme).toBe('custom3')
    expect(invalidSelected.theme).toBe('custom3')
    expect(invalidSelected.ui.selectedCustomTheme).toBe('custom1')
  })

  it('normalizes persisted per-theme palettes', () => {
    const state = parseModernState({
      theme: 'dawn',
      ui: {
        themePalettes: {
          custom1: {
            primary: '#AbC',
          },
          dawn: {
            primary: '#123456',
            domainRail: '#a95429',
          },
          light: {
            primary: 'not-a-color',
          },
          unknown: {
            primary: '#ffffff',
          },
        },
      },
    })

    expect(state.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(state.ui.themePalettes?.dawn?.domainRail).toBe('#a95429')
    expect(state.ui.themePalettes?.light?.primary).toBe(DEFAULT_CUSTOM_THEME_PALETTE.primary)
    expect(state.ui.themePalettes?.custom1?.primary).toBe('#aabbcc')
    expect(Object.keys(state.ui.themePalettes ?? {}).sort()).toEqual(['custom1', 'dawn', 'light'])
  })

  it('keeps persisted per-theme palette overrides as current settings', () => {
    const state = parseModernState({
      ui: {
        themePalettes: {
          dawn: {
            ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
            canvas: '#776238',
          },
          light: {
            ...BUILT_IN_THEME_PALETTE_SEEDS.light,
            canvas: '#f5f7fb',
          },
        },
      },
    })

    expect(state.ui.themePalettes?.dawn?.canvas).toBe('#776238')
    expect(state.ui.themePalettes?.light?.canvas).toBe('#f5f7fb')
  })

  it('normalizes persisted settings section memory', () => {
    const valid = parseModernState({ ui: { settingsSection: 'visuals' } })
    const data = parseModernState({ ui: { settingsSection: 'data', dataSettingsSection: 'storage' } })
    const invalidData = parseModernState({ ui: { settingsSection: 'data', dataSettingsSection: 'sync' } })
    const misc = parseModernState({ ui: { settingsSection: 'misc' } })
    const theming = parseModernState({ ui: { settingsSection: 'theming' } })
    const nestedVisuals = parseModernState({ ui: { settingsSection: 'visuals', visualsSettingsSection: 'otherVisuals' } })
    const invalidNestedVisuals = parseModernState({ ui: { settingsSection: 'visuals', visualsSettingsSection: 'colors' } })
    const tips = parseModernState({ ui: { settingsSection: 'tips' } })
    const toolbar = parseModernState({ ui: { settingsSection: 'toolbar' } })
    const invalid = parseModernState({ ui: { settingsSection: 'unknown' } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.settingsSection).toBe('visuals')
    expect(data.ui.settingsSection).toBe('data')
    expect(data.ui.dataSettingsSection).toBe('storage')
    expect(invalidData.ui.dataSettingsSection).toBe('transfer')
    expect(misc.ui.settingsSection).toBe('misc')
    expect(theming.ui.settingsSection).toBe('hotkeys')
    expect(theming.ui.visualsSettingsSection).toBe('theming')
    expect(nestedVisuals.ui.settingsSection).toBe('visuals')
    expect(nestedVisuals.ui.visualsSettingsSection).toBe('otherVisuals')
    expect(invalidNestedVisuals.ui.visualsSettingsSection).toBe('theming')
    expect(tips.ui.settingsSection).toBe('tips')
    expect(toolbar.ui.settingsSection).toBe('toolbar')
    expect(invalid.ui.settingsSection).toBe('hotkeys')
    expect(missing.ui.settingsSection).toBe('hotkeys')
  })

  it('normalizes toolbar button scale settings', () => {
    const valid = parseModernState({ ui: { toolbarButtonScale: 1.25 } })
    const tooLarge = parseModernState({ ui: { toolbarButtonScale: 8 } })
    const tooSmall = parseModernState({ ui: { toolbarButtonScale: 0.1 } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.toolbarButtonScale).toBe(1.25)
    expect(tooLarge.ui.toolbarButtonScale).toBe(1.6)
    expect(tooSmall.ui.toolbarButtonScale).toBe(0.8)
    expect(missing.ui.toolbarButtonScale).toBe(1)
  })

  it('normalizes always-visible navigation hierarchy settings', () => {
    const valid = parseModernState({ ui: { alwaysShowSpaces: true, alwaysShowDomains: true } })
    const invalid = parseModernState({ ui: { alwaysShowSpaces: false, alwaysShowDomains: true } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.alwaysShowSpaces).toBe(true)
    expect(valid.ui.alwaysShowDomains).toBe(true)
    expect(invalid.ui.alwaysShowSpaces).toBe(false)
    expect(invalid.ui.alwaysShowDomains).toBe(false)
    expect(missing.ui.alwaysShowSpaces).toBe(false)
    expect(missing.ui.alwaysShowDomains).toBe(false)
  })

  it('normalizes persisted tip settings', () => {
    const valid = parseModernState({
      ui: {
        seenTipIds: [
          'task-undo',
          'bad-tip',
          'task-undo',
          'tab-create-after-rename',
          'delete-active-aisle-shortcut',
          'trash-delete-confirmation-setting',
          'aisle-width-reset',
        ],
        disabledTipIds: [
          'tab-create-after-rename',
          'delete-active-aisle-shortcut',
          'trash-delete-confirmation-setting',
          'aisle-width-reset',
          'unknown',
        ],
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.seenTipIds).toEqual([
      'task-undo',
      'delete-active-aisle-shortcut',
      'trash-delete-confirmation-setting',
      'aisle-width-reset',
    ])
    expect(valid.ui.disabledTipIds).toEqual([
      'delete-active-aisle-shortcut',
      'trash-delete-confirmation-setting',
      'aisle-width-reset',
    ])
    expect(missing.ui.seenTipIds).toEqual([])
    expect(missing.ui.disabledTipIds).toEqual([])
  })

  it('normalizes persisted find option settings', () => {
    const enabled = parseModernState({
      ui: {
        findCaseSensitive: true,
        findWholeWord: true,
        findRegex: true,
        findReplaceMode: 'replace',
        findReplaceScope: 'space',
      },
    })
    const invalid = parseModernState({
      ui: {
        findCaseSensitive: 'yes',
        findWholeWord: 1,
        findRegex: null,
        findReplaceMode: 'both',
        findReplaceScope: 'everywhere',
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.findCaseSensitive).toBe(true)
    expect(enabled.ui.findWholeWord).toBe(true)
    expect(enabled.ui.findRegex).toBe(true)
    expect(enabled.ui.findReplaceMode).toBe('replace')
    expect(enabled.ui.findReplaceScope).toBe('space')
    expect(invalid.ui.findCaseSensitive).toBe(false)
    expect(invalid.ui.findWholeWord).toBe(false)
    expect(invalid.ui.findRegex).toBe(false)
    expect(invalid.ui.findReplaceMode).toBe('find')
    expect(invalid.ui.findReplaceScope).toBe('note')
    expect(missing.ui.findCaseSensitive).toBe(false)
    expect(missing.ui.findWholeWord).toBe(false)
    expect(missing.ui.findRegex).toBe(false)
    expect(missing.ui.findReplaceMode).toBe('find')
    expect(missing.ui.findReplaceScope).toBe('note')
  })

  it('normalizes remove-note-references-on-trash setting', () => {
    const enabled = parseModernState({ ui: { removeNoteReferencesOnTrash: true } })
    const disabled = parseModernState({ ui: { removeNoteReferencesOnTrash: false } })
    const invalid = parseModernState({ ui: { removeNoteReferencesOnTrash: 'no' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.removeNoteReferencesOnTrash).toBe(true)
    expect(disabled.ui.removeNoteReferencesOnTrash).toBe(false)
    expect(invalid.ui.removeNoteReferencesOnTrash).toBe(true)
    expect(missing.ui.removeNoteReferencesOnTrash).toBe(true)
  })

  it('normalizes @ menu copy confirmation setting', () => {
    const enabled = parseModernState({ ui: { noteMentionCopyRequiresConfirmation: true } })
    const disabled = parseModernState({ ui: { noteMentionCopyRequiresConfirmation: false } })
    const invalid = parseModernState({ ui: { noteMentionCopyRequiresConfirmation: 'no' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.noteMentionCopyRequiresConfirmation).toBe(true)
    expect(disabled.ui.noteMentionCopyRequiresConfirmation).toBe(false)
    expect(invalid.ui.noteMentionCopyRequiresConfirmation).toBe(true)
    expect(missing.ui.noteMentionCopyRequiresConfirmation).toBe(true)
  })

  it('normalizes delete active aisle shortcut setting', () => {
    const enabled = parseModernState({ ui: { deleteActiveAisleShortcutEnabled: true } })
    const disabled = parseModernState({ ui: { deleteActiveAisleShortcutEnabled: false } })
    const invalid = parseModernState({ ui: { deleteActiveAisleShortcutEnabled: 'yes' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.deleteActiveAisleShortcutEnabled).toBe(true)
    expect(disabled.ui.deleteActiveAisleShortcutEnabled).toBe(false)
    expect(invalid.ui.deleteActiveAisleShortcutEnabled).toBe(false)
    expect(missing.ui.deleteActiveAisleShortcutEnabled).toBe(false)
  })

  it('normalizes tab rename Enter behavior setting', () => {
    const createAnother = parseModernState({ ui: { tabRenameEnterBehavior: 'creates-another-tab' } })
    const goesToNote = parseModernState({ ui: { tabRenameEnterBehavior: 'goes-to-note' } })
    const invalid = parseModernState({ ui: { tabRenameEnterBehavior: 'keep-editing' } })
    const missing = parseModernState({ ui: {} })

    expect(createAnother.ui.tabRenameEnterBehavior).toBe('creates-another-tab')
    expect(goesToNote.ui.tabRenameEnterBehavior).toBe('goes-to-note')
    expect(invalid.ui.tabRenameEnterBehavior).toBe('goes-to-note')
    expect(missing.ui.tabRenameEnterBehavior).toBe('goes-to-note')
  })

  it('normalizes synced toolbar layouts while leaving active toolbar selection local', () => {
    const state = parseModernState({
      ui: {
        activeToolbarLayoutId: 'should-not-sync',
        toolbarLayouts: [
          {
            id: 'default',
            name: 'bad default',
            items: [{ id: 'copy', type: 'tool', toolId: 'copy' }],
          },
          {
            id: 'desktop',
            name: '  desktop  ',
            items: [
              { id: 'one', type: 'tool', toolId: 'bold' },
              { id: 'two', type: 'tool', toolId: 'bold' },
              { id: 'gap', type: 'spacer' },
              { id: 'three', type: 'tool', toolId: 'italic' },
            ],
          },
        ],
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(state.ui.toolbarLayouts).toEqual([
      {
        id: 'desktop',
        name: 'desktop',
        items: [
          { id: 'one', type: 'tool', toolId: 'bold' },
          { id: 'gap', type: 'spacer' },
          { id: 'three', type: 'tool', toolId: 'italic' },
        ],
      },
    ])
    expect('activeToolbarLayoutId' in state.ui).toBe(false)
    expect(missing.ui.toolbarLayouts).toEqual([])
  })

  it('normalizes toolbar customizer name visibility', () => {
    const enabled = parseModernState({ ui: { toolbarEditorShowNames: true } })
    const disabled = parseModernState({ ui: { toolbarEditorShowNames: false } })
    const invalid = parseModernState({ ui: { toolbarEditorShowNames: 'yes' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.toolbarEditorShowNames).toBe(true)
    expect(disabled.ui.toolbarEditorShowNames).toBe(false)
    expect(invalid.ui.toolbarEditorShowNames).toBe(false)
    expect(missing.ui.toolbarEditorShowNames).toBe(false)
  })

  it('normalizes persisted table control target modes', () => {
    const valid = parseModernState({
      ui: {
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
      },
    })
    const invalid = parseModernState({
      ui: {
        tableAddTargetMode: 'middle',
        tableDeleteTargetMode: 'edge',
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.tableAddTargetMode).toBe('active-cell')
    expect(valid.ui.tableDeleteTargetMode).toBe('active-cell')
    expect(invalid.ui.tableAddTargetMode).toBe('bottom-right')
    expect(invalid.ui.tableDeleteTargetMode).toBe('bottom-right')
    expect(missing.ui.tableAddTargetMode).toBe('bottom-right')
    expect(missing.ui.tableDeleteTargetMode).toBe('bottom-right')
  })

  it('normalizes persisted table of contents scope', () => {
    const focused = parseModernState({ ui: { tableOfContentsScope: 'focused-aisle' } })
    const all = parseModernState({ ui: { tableOfContentsScope: 'all-aisles' } })
    const invalid = parseModernState({ ui: { tableOfContentsScope: 'visible' } })
    const missing = parseModernState({ ui: {} })

    expect(focused.ui.tableOfContentsScope).toBe('focused-aisle')
    expect(all.ui.tableOfContentsScope).toBe('all-aisles')
    expect(invalid.ui.tableOfContentsScope).toBe('all-aisles')
    expect(missing.ui.tableOfContentsScope).toBe('all-aisles')
  })

  it('ignores persisted normal-note new aisle placement', () => {
    const parsed = parseModernState({ ui: { newAislePlacement: 'right-of-focus' } })
    const missing = parseModernState({ ui: {} })

    expect(parsed.ui).not.toHaveProperty('newAislePlacement')
    expect(missing.ui).not.toHaveProperty('newAislePlacement')
  })

  it('normalizes persisted note copy mode memory', () => {
    const linked = parseModernState({ ui: { lastNoteCopyMode: 'linked' } })
    const independent = parseModernState({ ui: { lastNoteCopyMode: 'independent' } })
    const invalid = parseModernState({ ui: { lastNoteCopyMode: 'plain' } })
    const missing = parseModernState({ ui: {} })

    expect(linked.ui.lastNoteCopyMode).toBe('linked')
    expect(independent.ui.lastNoteCopyMode).toBe('independent')
    expect(invalid.ui.lastNoteCopyMode).toBe('independent')
    expect(missing.ui.lastNoteCopyMode).toBe('independent')
  })

  it('normalizes persisted de-coupled item data retention memory', () => {
    const keep = parseModernState({ ui: { decoupledItemsKeepData: true } })
    const clear = parseModernState({ ui: { decoupledItemsKeepData: false } })
    const invalid = parseModernState({ ui: { decoupledItemsKeepData: 'yes' } })
    const missing = parseModernState({ ui: {} })

    expect(keep.ui.decoupledItemsKeepData).toBe(true)
    expect(clear.ui.decoupledItemsKeepData).toBe(false)
    expect(invalid.ui.decoupledItemsKeepData).toBe(true)
    expect(missing.ui.decoupledItemsKeepData).toBe(true)
  })

  it('normalizes persisted trash delete confirmation setting', () => {
    const enabled = parseModernState({ ui: { trashDeleteForRealRequiresConfirmation: true } })
    const disabled = parseModernState({ ui: { trashDeleteForRealRequiresConfirmation: false } })
    const invalid = parseModernState({ ui: { trashDeleteForRealRequiresConfirmation: 'no' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.trashDeleteForRealRequiresConfirmation).toBe(true)
    expect(disabled.ui.trashDeleteForRealRequiresConfirmation).toBe(false)
    expect(invalid.ui.trashDeleteForRealRequiresConfirmation).toBe(true)
    expect(missing.ui.trashDeleteForRealRequiresConfirmation).toBe(true)
  })

  it('normalizes persisted note filter settings', () => {
    const parsed = parseModernState({
      ui: {
        noteFilter: {
          active: true,
          kind: 'frontmatter',
          tags: { selectedKeys: [' Tag ', 'tag'], sortMode: 'occurrences' },
          synced: { selectedKeys: ['synced-note:body-1'] },
          frontmatter: { selectedKeys: ['fm-property:Status', 'fm-property:Status'] },
          media: { selectedKeys: ['media:image:tabs-asset:///assets/photo.png', 'media:image:tabs-asset:///assets/photo.png'] },
        },
      },
    })
    const invalid = parseModernState({
      ui: {
        noteFilter: {
          active: 'yes',
          kind: 'bad',
          tags: { selectedKeys: ['tag'], sortMode: 'count' },
          synced: { selectedKeys: [1] },
          frontmatter: null,
          media: { selectedKeys: [1] },
        },
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(parsed.ui.noteFilter).toEqual({
      active: true,
      kind: 'frontmatter',
      tags: { selectedKeys: ['Tag', 'tag'], sortMode: 'occurrences' },
      synced: { selectedKeys: ['synced-note:body-1'] },
      frontmatter: { selectedKeys: ['fm-property:Status'] },
      media: { selectedKeys: ['media:image:tabs-asset:///assets/photo.png'] },
    })
    expect(invalid.ui.noteFilter).toEqual({
      active: false,
      kind: 'tags',
      tags: { selectedKeys: ['tag'], sortMode: 'az' },
      synced: { selectedKeys: [] },
      frontmatter: { selectedKeys: [] },
      media: { selectedKeys: [] },
    })
    expect(missing.ui.noteFilter).toEqual(DEFAULT_UI_SETTINGS.noteFilter)
  })
})

describe('app state trash auto purge', () => {
  it('does not schedule a purge when no space has trash', () => {
    const state = appStateWithSpaces([space('space-1', 7, workspace())])

    expect(getNextAutoPurgeTimeForAppState(state, Date.UTC(2026, 4, 20))).toBeNull()
  })

  it('preserves state identity when auto-purge and aisle-width pruning have no work', () => {
    expect(applyAutoPurgeToAppState(DEFAULT_STATE, Date.UTC(2026, 4, 20))).toBe(DEFAULT_STATE)
  })

  it('uses the nearest expiration across all spaces', () => {
    const now = Date.UTC(2026, 4, 20)
    const state = appStateWithSpaces([
      space('short', 3, workspace([deletedTab('short-parent', now - 2 * AUTO_PURGE_DAY_MS)])),
      space('long', 10, workspace([deletedTab('long-parent', now - 8 * AUTO_PURGE_DAY_MS)])),
    ])

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + AUTO_PURGE_DAY_MS)
  })

  it('returns now when any space has expired trash', () => {
    const now = Date.UTC(2026, 4, 20)
    const state = appStateWithSpaces([
      space('space-1', 7, workspace([deletedTab('expired-parent', now - 7 * AUTO_PURGE_DAY_MS)])),
      space('space-2', 30, workspace([deletedTab('fresh-parent', now - 7 * AUTO_PURGE_DAY_MS)])),
    ])

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now)
  })

  it('purges expired trash using each space retention window', () => {
    const now = Date.UTC(2026, 4, 20)
    const shortExpiredParent = deletedTab('short-expired-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const shortFreshSubTab = deletedSubTab('short-fresh-sub', now - AUTO_PURGE_DAY_MS)
    const longFreshParent = deletedTab('long-fresh-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const state = appStateWithSpaces([
      space('short', 2, workspace([shortExpiredParent], [shortFreshSubTab])),
      space('long', 10, workspace([longFreshParent])),
    ])

    const next = applyAutoPurgeToAppState(state, now)

    expect(next.spaces.find((candidate) => candidate.id === 'short')?.data.deletedTabs).toEqual([])
    expect(next.spaces.find((candidate) => candidate.id === 'short')?.data.deletedSubTabs).toEqual([shortFreshSubTab])
    expect(next.spaces.find((candidate) => candidate.id === 'long')?.data.deletedTabs).toEqual([longFreshParent])
    expect(next.domains[0].spaces.find((candidate) => candidate.id === 'short')?.data.deletedTabs).toEqual([])
  })

  it('uses deleted workspace entries when scheduling purge', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry('deleted-space', now - 2 * AUTO_PURGE_DAY_MS, space('deleted-space', 3, workspace())),
      ],
      deletedDomains: [
        deletedDomainEntry('deleted-domain', now - 4 * AUTO_PURGE_DAY_MS, [
          space('deleted-domain-space', 10, workspace()),
        ]),
      ],
    }

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + AUTO_PURGE_DAY_MS)
  })

  it('purges expired deleted workspace entries using their retention windows', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry('expired-space', now - 8 * AUTO_PURGE_DAY_MS, space('expired-space', 7, workspace())),
        deletedSpaceEntry('fresh-space', now - 6 * AUTO_PURGE_DAY_MS, space('fresh-space', 7, workspace())),
      ],
      deletedDomains: [
        deletedDomainEntry('expired-domain', now - 4 * AUTO_PURGE_DAY_MS, [
          space('expired-domain-space', 3, workspace()),
        ]),
        deletedDomainEntry('retained-domain', now - 8 * AUTO_PURGE_DAY_MS, [
          space('retained-domain-space', 10, workspace()),
        ]),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now)
    expect(next.deletedSpaces?.map((entry) => entry.id)).toEqual(['fresh-space'])
    expect(next.deletedDomains?.map((entry) => entry.id)).toEqual(['retained-domain'])
  })

  it('keeps deleted domains until nested deleted spaces reach their own retention', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedDomains: [
        deletedDomainEntry(
          'deleted-domain',
          now - 10 * AUTO_PURGE_DAY_MS,
          [space('deleted-domain-space', 3, workspace())],
          [
            deletedSpaceEntry(
              'nested-fresh-space',
              now - AUTO_PURGE_DAY_MS,
              space('nested-fresh-space', 30, workspace()),
            ),
          ],
        ),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + 29 * AUTO_PURGE_DAY_MS)
    expect(next.deletedDomains?.map((entry) => entry.id)).toEqual(['deleted-domain'])
  })

  it('purges nested trash inside retained deleted workspace entries', () => {
    const now = Date.UTC(2026, 4, 20)
    const expiredParent = deletedTab('expired-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const freshParent = deletedTab('fresh-parent', now - AUTO_PURGE_DAY_MS)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry(
          'deleted-space',
          now - AUTO_PURGE_DAY_MS,
          space('deleted-space', 2, workspace([expiredParent, freshParent])),
        ),
      ],
      deletedDomains: [
        deletedDomainEntry(
          'deleted-domain',
          now - AUTO_PURGE_DAY_MS,
          [space('deleted-domain-space', 2, workspace([expiredParent, freshParent]))],
          [
            deletedSpaceEntry(
              'nested-expired-space',
              now - 3 * AUTO_PURGE_DAY_MS,
              space('nested-expired-space', 2, workspace()),
            ),
            deletedSpaceEntry(
              'nested-fresh-space',
              now - AUTO_PURGE_DAY_MS,
              space('nested-fresh-space', 2, workspace([expiredParent])),
            ),
          ],
        ),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(next.deletedSpaces?.[0]?.space.data.deletedTabs).toEqual([freshParent])
    expect(next.deletedDomains?.[0]?.domain.spaces[0]?.data.deletedTabs).toEqual([freshParent])
    expect(next.deletedDomains?.[0]?.deletedSpaces.map((entry) => entry.id)).toEqual(['nested-fresh-space'])
    expect(next.deletedDomains?.[0]?.deletedSpaces[0]?.space.data.deletedTabs).toEqual([])
  })
})
