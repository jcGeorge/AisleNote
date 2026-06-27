import { describe, expect, it } from 'vitest'
import type { AppState, FrontmatterSaveOptions, FrontmatterTemplate } from '../types/app'
import {
  AISLENOTE_FRONTMATTER_CLIPBOARD_MIME,
  buildFrontmatterClipboardPayload,
  buildFrontmatterClipboardPasteForAisle,
  parseFrontmatterClipboardPayload,
  readFrontmatterClipboardPayloadFromNavigator,
  readFrontmatterClipboardPayloadFromDataTransfer,
  rememberFrontmatterClipboardPayload,
  serializeFrontmatterClipboardPayload,
} from './frontmatter-clipboard'
import { stringifyFrontmatterYaml } from './frontmatter'

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
    { id: 'title', key: 'title', type: 'text', defaultValue: '', computed: 'noteTitle' },
  ],
}

const saveOptions: FrontmatterSaveOptions = {
  templateId: template.id,
  templateDerived: true,
  templateFieldOrigins: {
    status: { templateId: template.id, fieldId: 'status' },
    title: { templateId: template.id, fieldId: 'title' },
  },
  computedFields: {
    title: 'noteTitle',
  },
}

function createState(templates: FrontmatterTemplate[] = [template]): AppState {
  return {
    theme: 'dark',
    vault: {
      activeNoteId: 'note-target',
      items: [
        { type: 'note', id: 'note-source', title: 'Source', noteBodyId: 'body-source' },
        { type: 'note', id: 'note-target', title: 'Target', noteBodyId: 'body-target' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      {
        id: 'body-source',
        aisles: [{ id: 'source-aisle', aisleBodyId: 'source-body' }],
      },
      {
        id: 'body-target',
        aisles: [{ id: 'target-aisle', aisleBodyId: 'target-body' }],
      },
    ],
    noteAisleBodies: [
      { id: 'source-body', markdown: 'source', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'target-body', markdown: 'target', tags: [], frontmatter: null, frontmatterStatus: 'none' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates, settingsTemplateId: '', lastAppliedTemplateId: '' },
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

describe('frontmatter clipboard', () => {
  it('serializes and parses frontmatter with template linkage metadata', () => {
    const payload = buildFrontmatterClipboardPayload(
      { status: 'ready', title: { id: 'body-source', title: 'Source' } },
      saveOptions,
    )

    expect(parseFrontmatterClipboardPayload(serializeFrontmatterClipboardPayload(payload))).toEqual(payload)
  })

  it('reads async clipboard custom MIME payloads', async () => {
    const payload = buildFrontmatterClipboardPayload({ status: 'ready' }, saveOptions)
    const serialized = serializeFrontmatterClipboardPayload(payload)

    await expect(
      readFrontmatterClipboardPayloadFromNavigator({
        read: async () => [
          {
            types: [AISLENOTE_FRONTMATTER_CLIPBOARD_MIME],
            getType: async () => new Blob([serialized], { type: AISLENOTE_FRONTMATTER_CLIPBOARD_MIME }),
          },
        ],
      } as unknown as Clipboard),
    ).resolves.toEqual(payload)
  })

  it('recovers remembered payloads from YAML text fallback data', () => {
    const payload = buildFrontmatterClipboardPayload({ status: 'ready' }, saveOptions)
    const yaml = stringifyFrontmatterYaml(payload.frontmatter)
    rememberFrontmatterClipboardPayload(payload, yaml)

    expect(
      readFrontmatterClipboardPayloadFromDataTransfer({
        getData: (type: string) => (type === 'text/plain' ? yaml : ''),
      }),
    ).toEqual(payload)
  })

  it('can skip generic YAML fallback while still accepting remembered same-app text fallback data', () => {
    const payload = buildFrontmatterClipboardPayload({ status: 'ready' }, saveOptions)
    const yaml = stringifyFrontmatterYaml(payload.frontmatter)

    expect(
      readFrontmatterClipboardPayloadFromDataTransfer(
        {
          getData: (type: string) => (type === 'text/plain' ? 'status: external' : ''),
        },
        { allowYamlFallback: false },
      ),
    ).toBeNull()

    rememberFrontmatterClipboardPayload(payload, yaml)
    expect(
      readFrontmatterClipboardPayloadFromDataTransfer(
        {
          getData: (type: string) => (type === 'text/plain' ? yaml : ''),
        },
        { allowYamlFallback: false },
      ),
    ).toEqual(payload)
  })

  it('rebuilds pasted derived rows against the target aisle context', () => {
    const payload = buildFrontmatterClipboardPayload(
      { status: 'ready', title: { id: 'body-source', title: 'Source' } },
      saveOptions,
    )

    const result = buildFrontmatterClipboardPasteForAisle(
      createState(),
      'body-target',
      'target-body',
      { noteId: 'note-target' },
      payload,
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.warnings).toEqual([])
    expect(result.frontmatter).toEqual({ status: 'ready', title: { id: 'body-target', title: 'Target' } })
    expect(result.saveOptions).toMatchObject({
      templateId: template.id,
      templateDerived: true,
      templateFieldOrigins: {
        status: { templateId: template.id, fieldId: 'status' },
        title: { templateId: template.id, fieldId: 'title' },
      },
      computedFields: {
        title: 'noteTitle',
      },
    })
  })

  it('converts pasted rows to manual rows when the referenced template is missing', () => {
    const payload = buildFrontmatterClipboardPayload(
      { status: 'ready', title: { id: 'body-source', title: 'Source' } },
      saveOptions,
    )

    const result = buildFrontmatterClipboardPasteForAisle(
      createState([]),
      'body-target',
      'target-body',
      { noteId: 'note-target' },
      payload,
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.warnings).toEqual([
      'Referenced frontmatter template is unavailable; pasted rows were converted to manual frontmatter.',
    ])
    expect(result.frontmatter).toEqual({ status: 'ready', title: { id: 'body-target', title: 'Target' } })
    expect(result.saveOptions).toMatchObject({
      templateId: null,
      templateDerived: false,
      templateFieldOrigins: {},
      computedFields: {
        title: 'noteTitle',
      },
    })
  })
})
