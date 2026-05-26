import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteLocation, Space } from '../types/app'
import { getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import {
  COPY_AS_CLIPBOARD_MIME,
  applyCopyAsDuplicatePayloadToState,
  buildCopyAsClipboardData,
  getCopyAsAisleIdForNoteContext,
  parseCopyAsPayload,
  readCopyAsPayloadFromDataTransfer,
  serializeCopyAsPayload,
  writeCopyAsClipboardData,
  type CopyAsClipboardPayload,
} from './copy-as-clipboard'

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

function createCopyAsState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-target',
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
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      {
        id: 'body-source',
        aisles: [
          { id: 'aisle-source-1', aisleBodyId: 'aisle-source-1' },
          { id: 'aisle-source-2', aisleBodyId: 'aisle-source-2' },
        ],
      },
      { id: 'body-target', aisles: [{ id: 'aisle-target-1', aisleBodyId: 'aisle-target-1' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-source-1', markdown: 'source one', frontmatterStatus: 'none' },
      { id: 'aisle-source-2', markdown: 'source two', frontmatterStatus: 'none' },
      { id: 'aisle-target-1', markdown: 'target text', frontmatterStatus: 'none' },
    ],
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

describe('copy-as clipboard helpers', () => {
  it('serializes and parses structured payloads', () => {
    const payload: CopyAsClipboardPayload = {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    }

    expect(parseCopyAsPayload(serializeCopyAsPayload(payload))).toEqual(payload)
    expect(parseCopyAsPayload('{"version":1,"scope":"aisle","action":"duplicate","source":{}}')).toBeNull()
  })

  it('builds markdown fallback, note links, and aisle previews', () => {
    const state = createCopyAsState()

    expect(buildCopyAsClipboardData(state, sourceLocation, 'note', 'copy')).toMatchObject({
      ok: true,
      text: 'source one\n\nsource two',
    })
    expect(buildCopyAsClipboardData(state, sourceLocation, 'note', 'link')).toMatchObject({
      ok: true,
      text: expect.stringMatching(/^\[\[Source--[0-9a-f]{6}\]\]$/),
    })
    expect(buildCopyAsClipboardData(state, sourceLocation, 'aisle', 'link', 'aisle-source-2')).toMatchObject({
      ok: true,
      text: expect.stringMatching(/^\[\[Source--[0-9a-f]{6}#aisle 2--[0-9a-f]{6}\|aisle 2\]\]$/),
    })
    expect(buildCopyAsClipboardData(state, sourceLocation, 'aisle', 'preview', 'aisle-source-2')).toMatchObject({
      ok: true,
      text: expect.stringMatching(/^!\[\[Source--[0-9a-f]{6}#aisle 2--[0-9a-f]{6}\]\]$/),
    })
    expect(buildCopyAsClipboardData(state, sourceLocation, 'note', 'preview')).toEqual({
      ok: false,
      message: 'copy a specific aisle as preview for notes with multiple aisles.',
    })
  })

  it('writes private clipboard payloads and falls back to plain text', async () => {
    const payload: CopyAsClipboardPayload = { version: 1, scope: 'note', action: 'link', source: sourceLocation }
    const write = vi.fn(async () => undefined)
    class FakeClipboardItem {
      items: Record<string, Blob>

      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    }

    await expect(
      writeCopyAsClipboardData(
        { payload, text: 'plain' },
        { clipboard: { write }, ClipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem },
      ),
    ).resolves.toEqual({ ok: true, privatePayloadWritten: true })
    expect(write).toHaveBeenCalledWith([expect.any(FakeClipboardItem)])

    const writeText = vi.fn(async () => undefined)
    await expect(
      writeCopyAsClipboardData(
        { payload, text: 'plain' },
        {
          clipboard: { write: vi.fn(async () => { throw new Error('no custom') }), writeText },
          ClipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem,
        },
      ),
    ).resolves.toEqual({ ok: true, privatePayloadWritten: false })
    expect(writeText).toHaveBeenCalledWith('plain')
  })

  it('reads private payloads from paste data', () => {
    const payload: CopyAsClipboardPayload = { version: 1, scope: 'note', action: 'preview', source: sourceLocation }
    const dataTransfer = {
      getData: (type: string) => (type === COPY_AS_CLIPBOARD_MIME ? serializeCopyAsPayload(payload) : ''),
    } as DataTransfer

    expect(readCopyAsPayloadFromDataTransfer(dataTransfer)).toEqual(payload)
  })

  it('uses the focused aisle only when the copied note is active', () => {
    const state = createCopyAsState()

    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, sourceLocation, 'aisle-source-2')).toBe('aisle-source-2')
    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, targetLocation, 'aisle-source-2')).toBe('aisle-source-1')
    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, sourceLocation, 'missing')).toBe('aisle-source-1')
  })

  it('applies note and aisle duplicate payloads to destination notes', () => {
    const state = createCopyAsState()
    const noteResult = applyCopyAsDuplicatePayloadToState(state, targetLocation, {
      version: 1,
      scope: 'note',
      action: 'duplicate',
      source: sourceLocation,
    })
    expect(noteResult.status).toBe('applied')
    const duplicatedBodyId = getLocationInfo(noteResult.state, targetLocation).noteBodyId
    const duplicatedBody = noteResult.state.noteBodies.find((body) => body.id === duplicatedBodyId)
    expect(duplicatedBody?.aisles.map((aisle) => getAisleMarkdown(aisle, noteResult.state.noteAisleBodies))).toEqual([
      'source one',
      'source two',
    ])

    const aisleResult = applyCopyAsDuplicatePayloadToState(state, targetLocation, {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })
    expect(aisleResult.status).toBe('applied')
    const targetBody = aisleResult.state.noteBodies.find((body) => body.id === 'body-target')
    expect(targetBody?.aisles.map((aisle) => getAisleMarkdown(aisle, aisleResult.state.noteAisleBodies))).toEqual([
      'target text',
      'source two',
    ])
  })

  it('blocks aisle duplicate pastes when the destination is full', () => {
    const result = applyCopyAsDuplicatePayloadToState(createCopyAsState(), targetLocation, {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    }, 1)

    expect(result).toMatchObject({
      status: 'max-aisles',
      message: 'maximum aisle count reached.',
    })
  })
})
