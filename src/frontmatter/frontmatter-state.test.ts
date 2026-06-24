import { describe, expect, it } from 'vitest'
import type { AppState, FrontmatterTemplate, NoteLocation } from '../types/app'
import {
  buildFrontmatterDataFromRows,
  buildFrontmatterModalDraftForAisle,
  disableInvalidComputedFrontmatterRows,
  normalizeFrontmatterDraftRows,
  resolveFrontmatterRowComputedForType,
  type FrontmatterRowDraft,
} from './frontmatter-state'

const location: NoteLocation = { noteId: 'note-1' }

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
    { id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
    { id: 'title', key: 'title', type: 'text', defaultValue: '', computed: 'noteTitle' },
    { id: 'folder', key: 'folder', type: 'text', defaultValue: '', computed: 'folderName' },
    { id: 'path', key: 'path', type: 'text', defaultValue: '', computed: 'folderPath' },
    { id: 'linked', key: 'linked', type: 'boolean', defaultValue: 'false', computed: 'isLinked' },
    { id: 'tags', key: 'tags', type: 'list', defaultValue: '', computed: 'tags' },
  ],
}

function createState(): AppState {
  return {
    theme: 'cheese',
    notebook: {
      activeNoteId: 'note-1',
      items: [
        {
          type: 'folder',
          id: 'folder-1',
          title: 'Projects',
          children: [
            {
              type: 'note',
              id: 'note-1',
              title: 'Roadmap',
              noteBodyId: 'body-1',
            },
            {
              type: 'note',
              id: 'note-copy',
              title: 'Roadmap copy',
              noteBodyId: 'body-1',
            },
          ],
        },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    scratchpad: undefined,
    messages: [],
    toastHistory: [],
    noteBodies: [
      {
        id: 'body-1',
        createdAt: '2024-01-02T08:00:00.000Z',
        updatedAt: '2026-05-15T12:30:00.000Z',
        aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
      },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-1',
        createdAt: '2024-01-02T08:00:00.000Z',
        updatedAt: '2026-05-15T12:30:00.000Z',
        markdown: '#alpha',
        tags: ['alpha'],
        frontmatter: {
          status: 'ready',
          created: '2024-01-02',
          extra: 'kept',
        },
        frontmatterStatus: 'valid',
        frontmatterMeta: {
          templateId: template.id,
          templateDerived: true,
          templateFieldOrigins: {
            status: { templateId: template.id, fieldId: 'status' },
            created: { templateId: template.id, fieldId: 'created' },
          },
          computedFields: { created: 'createdAt' },
        },
      },
    ],
    hotkeys: {
      shortcuts: {},
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'operationsMenu',
        },
        menuOperations: [],
      },
    },
    frontmatter: {
      templates: [template],
      settingsTemplateId: template.id,
      lastAppliedTemplateId: template.id,
    },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      findCaseSensitive: false,
      findWholeWord: false,
      findRegex: false,
      findReplaceMode: 'find',
      findReplaceScope: 'note',
      removeNoteReferencesOnTrash: false,
      noteMentionCopyRequiresConfirmation: true,
      scratchpadNewAisleSide: 'right',
      decoupledItemsKeepData: true,
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      tableOfContentsScope: 'all-aisles',
      noteFontScale: 1,
      toolbarButtonScale: 1.2,
      settingsSection: 'data',
      dataSettingsSection: 'storage',
      visualsSettingsSection: 'theming',
      selectedCustomTheme: 'custom1',
      themePalettes: {},
      noteCursorLocations: {},
      headingCollapseState: {},
      aisleWidths: {},
      toolbarLayouts: [],
      toolbarEditorShowNames: false,
      seenTipIds: [],
      disabledTipIds: [],
    },
  } as AppState
}

describe('frontmatter structured row state', () => {
  it('opens existing derived frontmatter with template rows and manual extras', () => {
    const draft = buildFrontmatterModalDraftForAisle(createState(), 'body-1', 'aisle-body-1', location)

    expect(draft.selectedTemplateId).toBe(template.id)
    expect(draft.templateDerived).toBe(true)
    expect(draft.isTemplateSuggestionDraft).toBe(false)
    expect(draft.rows.map((row) => row.key)).toEqual(['status', 'created', 'title', 'folder', 'path', 'linked', 'tags', 'extra'])
    expect(draft.rows.find((row) => row.key === 'status')).toMatchObject({
      value: 'ready',
      derived: true,
      locked: true,
    })
    expect(draft.rows.find((row) => row.key === 'extra')).toMatchObject({
      value: 'kept',
      derived: false,
    })
  })

  it('opens blank frontmatter as an unsaved last-applied template suggestion', () => {
    const state = createState()
    const blankState: AppState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies.map((body) => ({
        ...body,
        frontmatter: null,
        frontmatterStatus: 'none',
        frontmatterMeta: undefined,
      })),
    }

    const draft = buildFrontmatterModalDraftForAisle(blankState, 'body-1', 'aisle-body-1', location)

    expect(draft.selectedTemplateId).toBe(template.id)
    expect(draft.templateDerived).toBe(true)
    expect(draft.isTemplateSuggestionDraft).toBe(true)
    expect(draft.rows.map((row) => row.key)).toEqual(['status', 'created', 'title', 'folder', 'path', 'linked', 'tags'])
  })

  it('rejects duplicate row keys', () => {
    const rows: FrontmatterRowDraft[] = [
      { id: 'a', key: 'status', type: 'text', value: 'one', computed: 'none' },
      { id: 'b', key: 'status', type: 'text', value: 'two', computed: 'none' },
    ]

    expect(buildFrontmatterDataFromRows(createState(), 'body-1', location, rows, { aisleBodyId: 'aisle-body-1' })).toEqual({
      ok: false,
      message: 'Frontmatter key "status" is duplicated.',
    })
  })

  it('removes frontmatter when rows are empty', () => {
    expect(buildFrontmatterDataFromRows(createState(), 'body-1', location, [], { aisleBodyId: 'aisle-body-1' })).toEqual({
      ok: true,
      frontmatter: null,
      templateFieldOrigins: {},
      templateRemovedFieldIds: [],
      computedFields: {},
      warnings: [],
    })
  })

  it('records removed derived template fields', () => {
    const rows: FrontmatterRowDraft[] = [
      {
        id: 'template:status',
        key: 'status',
        type: 'text',
        value: 'ready',
        computed: 'none',
        templateFieldId: 'status',
        derived: true,
      },
    ]

    const result = buildFrontmatterDataFromRows(createState(), 'body-1', location, rows, {
      aisleBodyId: 'aisle-body-1',
      selectedTemplateId: template.id,
      templateDerived: true,
    })

    expect(result).toMatchObject({
      ok: true,
      templateRemovedFieldIds: ['created', 'title', 'folder', 'path', 'linked', 'tags'],
    })
  })

  it('resolves computed fields from note, folder, link, and tag context', () => {
    const rows: FrontmatterRowDraft[] = template.fields
      .filter((field) => field.computed !== 'none')
      .map((field) => ({
        id: `template:${field.id}`,
        key: field.key,
        type: field.type,
        value: '',
        computed: field.computed,
        computedEnabled: true,
        templateFieldId: field.id,
        derived: true,
      }))

    const result = buildFrontmatterDataFromRows(createState(), 'body-1', location, rows, {
      aisleBodyId: 'aisle-body-1',
      selectedTemplateId: template.id,
      templateDerived: true,
    })

    expect(result).toMatchObject({
      ok: true,
      frontmatter: {
        created: '2024-01-02',
        title: { id: 'body-1', title: 'Roadmap' },
        folder: 'Projects',
        path: 'Projects',
        linked: true,
        tags: ['alpha'],
      },
    })
  })

  it('keeps computed enabled on type changes when the next type has a computed source', () => {
    expect(resolveFrontmatterRowComputedForType({
      id: 'status',
      key: 'status',
      type: 'text',
      value: '',
      computed: 'none',
      computedEnabled: true,
    }, 'datetime')).toBe('createdAt')
    expect(resolveFrontmatterRowComputedForType({
      id: 'created',
      key: 'created',
      type: 'date',
      value: '',
      computed: 'createdAt',
      computedEnabled: true,
    }, 'datetime')).toBe('createdAt')
    expect(resolveFrontmatterRowComputedForType({
      id: 'tags',
      key: 'tags',
      type: 'list',
      value: '',
      computed: 'tags',
      computedEnabled: true,
    }, 'fixedList')).toBe('none')
  })

  it('turns incomplete computed rows back into normal rows before save', () => {
    const repair = disableInvalidComputedFrontmatterRows([
      {
        id: 'reviewed',
        key: 'reviewed',
        type: 'text',
        value: 'yes',
        computed: 'none',
        computedEnabled: true,
        locked: true,
      },
    ])

    expect(repair.warnings).toEqual(['computed field must have a computed value, reviewed reverted to normal field'])
    expect(repair.rows[0]).toMatchObject({
      computed: 'none',
      computedEnabled: false,
      computedLocked: false,
      locked: false,
    })
  })

  it('reopens manual computed rows without locking their key or type', () => {
    const state = createState()
    const manualComputedState: AppState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies.map((body) => ({
        ...body,
        frontmatter: { reviewed: '2024-01-02' },
        frontmatterMeta: {
          computedFields: { reviewed: 'createdAt' },
        },
      })),
    }

    const draft = buildFrontmatterModalDraftForAisle(manualComputedState, 'body-1', 'aisle-body-1', location)

    expect(draft.rows[0]).toMatchObject({
      key: 'reviewed',
      type: 'date',
      computed: 'createdAt',
      computedEnabled: true,
      computedLocked: false,
      locked: false,
      derived: false,
    })
  })

  it('opens fixed list template rows with allowed options and saves selected arrays', () => {
    const fixedTemplate: FrontmatterTemplate = {
      id: 'fixed-template',
      name: 'fixed',
      fields: [
        {
          id: 'status',
          key: 'status',
          type: 'fixedList',
          defaultValue: 'draft',
          computed: 'none',
          options: ['draft', 'published'],
        },
      ],
    }
    const state = createState()
    const fixedState: AppState = {
      ...state,
      frontmatter: {
        templates: [fixedTemplate],
        settingsTemplateId: fixedTemplate.id,
        lastAppliedTemplateId: fixedTemplate.id,
      },
      noteAisleBodies: state.noteAisleBodies.map((body) => ({
        ...body,
        frontmatter: { status: 'published' },
        frontmatterMeta: {
          templateId: fixedTemplate.id,
          templateDerived: true,
          templateFieldOrigins: {
            status: { templateId: fixedTemplate.id, fieldId: 'status' },
          },
        },
      })),
    }

    const draft = buildFrontmatterModalDraftForAisle(fixedState, 'body-1', 'aisle-body-1', location)
    const row = draft.rows[0]
    if (!row) throw new Error('expected fixed list row')

    expect(row).toMatchObject({
      key: 'status',
      type: 'fixedList',
      value: 'published',
      fixedListOptions: ['draft', 'published'],
      derived: true,
      locked: true,
    })

    const arrayState: AppState = {
      ...fixedState,
      noteAisleBodies: fixedState.noteAisleBodies.map((body) => ({
        ...body,
        frontmatter: { status: ['draft', 'published'] },
      })),
    }
    expect(buildFrontmatterModalDraftForAisle(arrayState, 'body-1', 'aisle-body-1', location).rows[0]).toMatchObject({
      key: 'status',
      type: 'fixedList',
      value: 'draft, published',
      fixedListOptions: ['draft', 'published'],
    })

    const result = buildFrontmatterDataFromRows(fixedState, 'body-1', location, [
      { ...row, value: 'draft, published' } as FrontmatterRowDraft,
    ], {
      aisleBodyId: 'aisle-body-1',
      selectedTemplateId: fixedTemplate.id,
      templateDerived: true,
    })

    expect(result).toMatchObject({
      ok: true,
      frontmatter: { status: ['draft', 'published'] },
    })

    const emptyResult = buildFrontmatterDataFromRows(fixedState, 'body-1', location, [
      { ...row, value: '' } as FrontmatterRowDraft,
    ], {
      aisleBodyId: 'aisle-body-1',
      selectedTemplateId: fixedTemplate.id,
      templateDerived: true,
    })

    expect(emptyResult).toMatchObject({
      ok: true,
      frontmatter: { status: [] },
    })
  })

  it('switches to no template when the last derived row is removed', () => {
    const draft = {
      rows: [
        {
          id: 'template:status',
          key: 'status',
          type: 'text',
          value: 'ready',
          computed: 'none',
          templateFieldId: 'status',
          derived: true,
        },
        { id: 'manual:extra', key: 'extra', type: 'text', value: 'kept', computed: 'none', derived: false },
      ],
      selectedTemplateId: template.id,
      templateDerived: true,
      isTemplateSuggestionDraft: false,
    } satisfies ReturnType<typeof buildFrontmatterModalDraftForAisle>

    const next = normalizeFrontmatterDraftRows(draft, draft.rows.filter((row) => !row.derived))

    expect(next.selectedTemplateId).toBe('')
    expect(next.templateDerived).toBe(false)
    expect(next.rows).toEqual([
      {
        id: 'manual:extra',
        key: 'extra',
        type: 'text',
        value: 'kept',
        computed: 'none',
        computedEnabled: false,
        computedLocked: false,
        locked: false,
        templateFieldId: undefined,
        derived: false,
      },
    ])
  })
})
