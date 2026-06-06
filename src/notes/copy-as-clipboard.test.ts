import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteLocation, Space } from '../types/app'
import { getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import { syncNoteAisleBodyMarkdownInState } from './aisle-body-state'
import {
  COPY_AS_CLIPBOARD_MIME,
  applyCopyAsStructuralPayloadToState,
  buildCopyAsClipboardData,
  getCopyAsAisleIdForNoteContext,
  getCopyAsPasteSuccessMessage,
  getCopyAsSuccessMessage,
  isCopyAsClipboardTextMarker,
  parseCopyAsPayload,
  parseCopyAsTextMarker,
  readCopyAsPayloadFromClipboard,
  readCopyAsPayloadFromDataTransfer,
  serializeCopyAsPayload,
  serializeCopyAsTextMarker,
  writeCopyAsClipboardData,
  type CopyAsClipboardPayload,
} from './copy-as-clipboard'
import { materializeStructuralAisleCopiesForInsertion } from './note-copy-service'

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
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
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

describe('copy-as clipboard helpers', () => {
  it('uses centralized user-facing copy and paste wording', () => {
    expect(getCopyAsSuccessMessage('note', 'copy')).toBe('Independent note copy copied.')
    expect(getCopyAsSuccessMessage('note', 'duplicate')).toBe('Synced note copy copied.')
    expect(getCopyAsSuccessMessage('aisle', 'link')).toBe('Aisle link copied.')
    expect(getCopyAsSuccessMessage('aisle', 'preview')).toBe('Aisle preview copied.')
    expect(getCopyAsPasteSuccessMessage('note', 'copy')).toBe('Independent note copy created.')
    expect(getCopyAsPasteSuccessMessage('note', 'duplicate')).toBe('Synced note copy created.')
    expect(getCopyAsPasteSuccessMessage('aisle', 'link')).toBe('Aisle link pasted.')
    expect(getCopyAsPasteSuccessMessage('aisle', 'preview')).toBe('Aisle preview pasted.')
  })

  it('serializes and parses structured payloads', () => {
    const payload: CopyAsClipboardPayload = {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    }

    const marker = serializeCopyAsTextMarker(payload)
    expect(parseCopyAsPayload(serializeCopyAsPayload(payload))).toEqual(payload)
    expect(parseCopyAsTextMarker(marker)).toEqual(payload)
    expect(isCopyAsClipboardTextMarker(marker)).toBe(true)
    expect(parseCopyAsPayload('{"version":1,"scope":"aisle","action":"duplicate","source":{}}')).toBeNull()
    expect(parseCopyAsTextMarker('{{tabs-copy-as:not-json}}')).toBeNull()
  })

  it('builds opaque clipboard markers without constructing reference syntax', () => {
    const state = createCopyAsState()

    const noteCopy = buildCopyAsClipboardData(state, sourceLocation, 'note', 'copy')
    expect(noteCopy).toMatchObject({ ok: true, privatePayloadRequired: false })
    if (!noteCopy.ok) throw new Error('expected copy-as marker data')
    expect(parseCopyAsTextMarker(noteCopy.text)).toEqual(noteCopy.payload)

    expect(buildCopyAsClipboardData(state, sourceLocation, 'note', 'link')).toMatchObject({ ok: true })
    expect(buildCopyAsClipboardData(state, sourceLocation, 'note', 'preview')).toEqual({
      ok: false,
      message: 'Copy a specific aisle as preview for notes with multiple aisles.',
    })
  })

  it('builds aisle payloads for single-aisle notes', () => {
    const state = createCopyAsState()
    state.noteBodies = state.noteBodies.map((body) =>
      body.id === 'body-source'
        ? { ...body, aisles: [{ id: 'aisle-source-1', aisleBodyId: 'aisle-source-1' }] }
        : body,
    )

    const aisleCopy = buildCopyAsClipboardData(state, sourceLocation, 'aisle', 'duplicate', 'aisle-source-1')

    expect(aisleCopy).toMatchObject({
      ok: true,
      payload: {
        scope: 'aisle',
        action: 'duplicate',
        aisleId: 'aisle-source-1',
      },
    })
  })

  it('writes private clipboard payloads and falls back to plain text', async () => {
    const payload: CopyAsClipboardPayload = { version: 1, scope: 'note', action: 'link', source: sourceLocation }
    class FakeClipboardItem {
      items: Record<string, Blob>

      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    }
    const writtenItems: FakeClipboardItem[][] = []
    const write = vi.fn(async (items: ClipboardItem[]) => {
      writtenItems.push(items as unknown as FakeClipboardItem[])
    })

    await expect(
      writeCopyAsClipboardData(
        { payload, text: 'plain' },
        { clipboard: { write }, ClipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem },
      ),
    ).resolves.toEqual({ ok: true, privatePayloadWritten: true })
    expect(write).toHaveBeenCalledWith([expect.any(FakeClipboardItem)])
    const item = writtenItems[0]?.[0]
    expect(item).toBeDefined()
    expect(item.items['text/plain']).toBeDefined()
    await expect(item!.items['text/plain']!.text()).resolves.toBe(serializeCopyAsTextMarker(payload))

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
    expect(writeText).toHaveBeenCalledWith(serializeCopyAsTextMarker(payload))
  })

  it('reads private payloads and text markers from paste data', async () => {
    const payload: CopyAsClipboardPayload = { version: 1, scope: 'note', action: 'preview', source: sourceLocation }
    const dataTransfer = {
      getData: (type: string) => (type === COPY_AS_CLIPBOARD_MIME ? serializeCopyAsPayload(payload) : ''),
    } as DataTransfer

    expect(readCopyAsPayloadFromDataTransfer(dataTransfer)).toEqual(payload)

    const textDataTransfer = {
      getData: (type: string) => (type === 'text/plain' ? serializeCopyAsTextMarker(payload) : ''),
    } as DataTransfer
    expect(readCopyAsPayloadFromDataTransfer(textDataTransfer)).toEqual(payload)

    await expect(
      readCopyAsPayloadFromClipboard({
        clipboard: {
          readText: async () => serializeCopyAsTextMarker(payload),
        },
      }),
    ).resolves.toEqual(payload)
  })

  it('uses the focused aisle only when the copied note is active', () => {
    const state = createCopyAsState()

    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, sourceLocation, 'aisle-source-2')).toBe('aisle-source-2')
    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, targetLocation, 'aisle-source-2')).toBe('aisle-source-1')
    expect(getCopyAsAisleIdForNoteContext(state, sourceLocation, sourceLocation, 'missing')).toBe('aisle-source-1')
  })

  it('applies independent copy payloads structurally and preserves markdown', () => {
    const state = createCopyAsState()
    const richMarkdown = [
      '[[ref--c9965d#aisle 2--e13b89]]',
      '',
      '![[ref--c9965d#aisle 2--e13b89]]',
      '',
      '![image.png](tabs-asset:///assets/asset-dcdbc207744070fe.png)',
      '',
      '| a | b |',
      '| --- | --- |',
      '| c | d |',
      '',
      '~~struck out~~',
      '',
      '* [ ] Task goes here',
      '> now quote',
      '1. Numbered list mayhaps?',
    ].join('\n')
    state.noteAisleBodies = (state.noteAisleBodies ?? []).map((body) =>
      body.id === 'aisle-source-1' ? { ...body, markdown: richMarkdown } : body,
    )

    const noteResult = applyCopyAsStructuralPayloadToState(state, targetLocation, {
      version: 1,
      scope: 'note',
      action: 'copy',
      source: sourceLocation,
    })
    expect(noteResult.status).toBe('applied')
    const copiedBodyId = getLocationInfo(noteResult.state, targetLocation).noteBodyId
    expect(copiedBodyId).not.toBe('body-source')
    const copiedBody = noteResult.state.noteBodies.find((body) => body.id === copiedBodyId)
    expect(copiedBody?.aisles.map((aisle) => getAisleMarkdown(aisle, noteResult.state.noteAisleBodies))).toEqual([
      richMarkdown,
      'source two',
    ])

    const aisleResult = applyCopyAsStructuralPayloadToState(state, targetLocation, {
      version: 1,
      scope: 'aisle',
      action: 'copy',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })
    expect(aisleResult.status).toBe('applied')
    const targetBody = aisleResult.state.noteBodies.find((body) => body.id === 'body-target')
    expect(targetBody?.aisles.map((aisle) => getAisleMarkdown(aisle, aisleResult.state.noteAisleBodies))).toEqual([
      'target text',
      'source two',
    ])
    expect(targetBody?.aisles[1]?.aisleBodyId).not.toBe('aisle-source-2')
  })

  it('applies linked duplicate payloads structurally', () => {
    const state = createCopyAsState()
    const noteResult = applyCopyAsStructuralPayloadToState(state, targetLocation, {
      version: 1,
      scope: 'note',
      action: 'duplicate',
      source: sourceLocation,
    })
    expect(noteResult.status).toBe('applied')
    expect(getLocationInfo(noteResult.state, targetLocation).noteBodyId).toBe('body-source')

    const aisleResult = applyCopyAsStructuralPayloadToState(state, targetLocation, {
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
    expect(targetBody?.aisles[1]?.aisleBodyId).toBe('aisle-source-2')
  })

  it('keeps synced single-aisle copies linked after the source note gains another aisle', () => {
    const state = createCopyAsState()
    state.noteBodies = state.noteBodies.map((body) =>
      body.id === 'body-source'
        ? { ...body, aisles: [{ id: 'aisle-source-1', aisleBodyId: 'aisle-source-1' }] }
        : body,
    )

    const result = applyCopyAsStructuralPayloadToState(state, targetLocation, {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-1',
    })
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected linked aisle copy')

    const expandedState: AppState = {
      ...result.state,
      noteBodies: result.state.noteBodies.map((body) =>
        body.id === 'body-source'
          ? {
              ...body,
              aisles: [...body.aisles, { id: 'aisle-source-new', aisleBodyId: 'aisle-source-new' }],
            }
          : body,
      ),
      noteAisleBodies: [
        ...(result.state.noteAisleBodies ?? []),
        { id: 'aisle-source-new', markdown: 'new source aisle', frontmatterStatus: 'none' },
      ],
    }
    const edited = syncNoteAisleBodyMarkdownInState(expandedState, 'aisle-source-1', 'edited shared source')
    const targetBody = edited.noteBodies.find((body) => body.id === 'body-target')

    expect(targetBody?.aisles.map((aisle) => getAisleMarkdown(aisle, edited.noteAisleBodies))).toEqual([
      'target text',
      'edited shared source',
    ])
    expect(
      edited.noteBodies
        .find((body) => body.id === 'body-source')
        ?.aisles.map((aisle) => getAisleMarkdown(aisle, edited.noteAisleBodies)),
    ).toEqual(['edited shared source', 'new source aisle'])
  })

  it('materializes structural copy-as aisles for explicit insertion placement', () => {
    const state = createCopyAsState()

    const independent = materializeStructuralAisleCopiesForInsertion(state, {
      scope: 'aisle',
      action: 'copy',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    })
    expect(independent.status).toBe('applied')
    if (independent.status !== 'applied') throw new Error('expected independent aisle copies')
    expect(independent.aisles).toHaveLength(1)
    expect(independent.aisles[0]?.markdown).toBe('source two')
    expect(independent.aisles[0]?.aisleBodyId).not.toBe('aisle-source-2')
    expect(independent.aisleBodies).toHaveLength(1)

    const linked = materializeStructuralAisleCopiesForInsertion(state, {
      scope: 'note',
      action: 'duplicate',
      source: sourceLocation,
    })
    expect(linked.status).toBe('applied')
    if (linked.status !== 'applied') throw new Error('expected linked aisle copies')
    expect(linked.aisles.map((aisle) => aisle.markdown)).toEqual(['source one', 'source two'])
    expect(linked.aisles.map((aisle) => aisle.aisleBodyId)).toEqual(['aisle-source-1', 'aisle-source-2'])
    expect(linked.aisleBodies).toHaveLength(0)
  })

  it('blocks aisle duplicate pastes when the destination is full', () => {
    const result = applyCopyAsStructuralPayloadToState(createCopyAsState(), targetLocation, {
      version: 1,
      scope: 'aisle',
      action: 'duplicate',
      source: sourceLocation,
      aisleId: 'aisle-source-2',
    }, 1)

    expect(result).toMatchObject({
      status: 'max-aisles',
      message: 'Maximum aisle count reached.',
    })
  })
})
