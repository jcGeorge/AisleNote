import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from './frontmatter'
import {
  buildFrontmatterDataFromRows,
  buildFrontmatterModalDraftForNote,
  buildFrontmatterRowsForNote,
  isNoteBodyLinked,
  resolveFrontmatterReferencesForState,
  updateNoteBodyFrontmatter,
} from './frontmatter-state'
import type {
  AppState,
  FrontmatterRowDraft,
  FrontmatterTemplate,
  NoteLocation,
  Space,
} from '../types/app'

const location: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-1',
  subTabId: null,
}

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
    { id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
    { id: 'space', key: 'space', type: 'text', defaultValue: '', computed: 'spaceName' },
  ],
}

const otherTemplate: FrontmatterTemplate = {
  id: 'template-2',
  name: 'other template',
  fields: [
    { id: 'owner', key: 'owner', type: 'text', defaultValue: 'me', computed: 'none' },
  ],
}

const getAisleBody = (state: AppState, aisleBodyId = 'aisle-body-1') =>
  state.noteAisleBodies?.find((body) => body.id === aisleBodyId)

function createFrontmatterState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Product',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Roadmap',
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
    theme: 'dawn',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Tabs', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      {
        id: 'body-1',
        createdAt: '2024-01-01T08:00:00.000Z',
        updatedAt: '2026-05-15T12:30:00.000Z',
        aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
      },
    ],
    noteAisleBodies: [{
      id: 'aisle-body-1',
      markdown: 'body',
      frontmatter: { status: 'ready', extra: 'keep' },
      frontmatterStatus: 'valid',
      frontmatterMeta: {
        templateId: template.id,
        templateDerived: true,
        templateFieldOrigins: {
          status: { templateId: template.id, fieldId: 'status' },
          created: { templateId: template.id, fieldId: 'created' },
          space: { templateId: template.id, fieldId: 'space' },
        },
      },
    }],
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
    frontmatter: {
      ...DEFAULT_FRONTMATTER_SETTINGS,
      settingsTemplateId: otherTemplate.id,
      lastAppliedTemplateId: template.id,
      templates: [template, otherTemplate],
    },
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

function withActiveTabs(state: AppState, tabs: Space['data']['tabs']): AppState {
  const space: Space = {
    ...state.spaces[0],
    data: {
      ...state.spaces[0].data,
      tabs,
    },
  }
  return {
    ...state,
    spaces: [space],
    domains: state.domains.map((domain) =>
      domain.id === state.activeDomainId ? { ...domain, activeSpaceId: space.id, spaces: [space] } : domain,
    ),
  }
}

describe('frontmatter row state', () => {
  it('opens with existing rows plus missing template rows', () => {
    const rows = buildFrontmatterRowsForNote(createFrontmatterState(), 'body-1', location, template, {
      includeExisting: true,
      derived: true,
    })

    expect(rows.map((row) => row.key)).toEqual(['status', 'created', 'space', 'extra'])
    expect(rows.find((row) => row.key === 'status')).toMatchObject({
      value: 'ready',
      derived: true,
    })
    expect(rows.find((row) => row.key === 'created')).toMatchObject({
      value: '2024-01-01',
      locked: true,
      derived: true,
    })
    expect(rows.find((row) => row.key === 'space')).toMatchObject({
      value: 'Product',
      locked: true,
      derived: true,
    })
    expect(rows.find((row) => row.key === 'extra')).toMatchObject({
      value: 'keep',
      derived: false,
    })
  })

  it('selecting a different template regenerates rows without existing extras', () => {
    const rows = buildFrontmatterRowsForNote(createFrontmatterState(), 'body-1', location, template, {
      includeExisting: false,
      derived: true,
    })

    expect(rows.map((row) => row.key)).toEqual(['status', 'created', 'space'])
    expect(rows.some((row) => row.key === 'extra')).toBe(false)
  })

  it('serializes rows and recomputes locked values from note data', () => {
    const rows: FrontmatterRowDraft[] = [
      {
        id: 'status',
        key: 'status',
        type: 'text',
        value: 'ready',
        computed: 'none',
        locked: false,
        templateFieldId: 'status',
        derived: true,
      },
      {
        id: 'created',
        key: 'created',
        type: 'date',
        value: '1999-01-01',
        computed: 'createdAt',
        locked: true,
        templateFieldId: 'created',
        derived: true,
      },
      {
        id: 'space',
        key: 'space',
        type: 'text',
        value: 'Stale',
        computed: 'spaceName',
        locked: true,
        templateFieldId: 'space',
        derived: true,
      },
    ]

    const result = buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, rows, {
      selectedTemplateId: template.id,
      templateDerived: true,
    })

    expect(result).toEqual({
      ok: true,
      frontmatter: {
        status: 'ready',
        created: '2024-01-01',
        space: { id: 'space-1', name: 'Product' },
      },
      templateFieldOrigins: {
        status: { templateId: template.id, fieldId: 'status' },
        created: { templateId: template.id, fieldId: 'created' },
        space: { templateId: template.id, fieldId: 'space' },
      },
      templateRemovedFieldIds: [],
      computedFields: {
        created: 'createdAt',
        space: 'spaceName',
      },
      warnings: [],
    })
  })

  it('computes tag frontmatter from the selected aisle markdown', () => {
    const state = createFrontmatterState()
    const aisleBody = getAisleBody(state)
    if (!aisleBody) throw new Error('missing aisle body')
    aisleBody.markdown = '#Alpha\n\nBody #beta'
    delete aisleBody.tags

    const rows: FrontmatterRowDraft[] = [
      {
        id: 'manual:tags',
        key: 'tags',
        type: 'list',
        value: 'stale',
        computed: 'tags',
        computedEnabled: true,
        computedLocked: false,
        locked: true,
      },
    ]

    expect(buildFrontmatterDataFromRows(state, 'body-1', location, rows, {
      aisleBodyId: 'aisle-body-1',
    })).toEqual({
      ok: true,
      frontmatter: {
        tags: ['Alpha', 'beta'],
      },
      templateFieldOrigins: {},
      templateRemovedFieldIds: [],
      computedFields: {
        tags: 'tags',
      },
      warnings: [],
    })
  })

  it('computes isLinked when the note body has multiple note locations', () => {
    const state = createFrontmatterState()
    const homeTab = state.spaces[0].data.tabs[0]
    const linkedTab = {
      ...homeTab,
      id: 'tab-linked',
      title: 'Linked Roadmap',
      activeSubTabId: null,
      subTabs: [],
    }
    const linkedState = withActiveTabs(state, [homeTab, linkedTab])
    const rows: FrontmatterRowDraft[] = [
      {
        id: 'linked',
        key: 'linked',
        type: 'boolean',
        value: 'false',
        computed: 'isLinked',
        locked: true,
      },
    ]

    expect(isNoteBodyLinked(linkedState, 'body-1')).toBe(true)
    expect(buildFrontmatterDataFromRows(linkedState, 'body-1', location, rows)).toMatchObject({
      ok: true,
      frontmatter: { linked: true },
      computedFields: { linked: 'isLinked' },
    })
  })

  it('computes isLinked when an aisle is shared with another located note body', () => {
    const state = createFrontmatterState()
    const homeTab = state.spaces[0].data.tabs[0]
    const otherTab = {
      ...homeTab,
      id: 'tab-other',
      title: 'Other',
      noteBodyId: 'body-2',
      activeSubTabId: null,
      subTabs: [],
    }
    const linkedState = withActiveTabs({
      ...state,
      noteBodies: [
        {
          ...state.noteBodies[0],
          aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }],
        },
        {
          id: 'body-2',
          aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }],
        },
      ],
      noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'body' }],
    }, [homeTab, otherTab])

    expect(isNoteBodyLinked(linkedState, 'body-1')).toBe(true)
  })

  it('does not treat same-note aisle sharing or unlocated stale aisle bodies as linked', () => {
    const state = createFrontmatterState()
    const unlinkedState: AppState = {
      ...state,
      noteBodies: [
        {
          ...state.noteBodies[0],
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-aisle-body' },
            { id: 'aisle-2', aisleBodyId: 'shared-aisle-body' },
          ],
        },
        {
          id: 'orphan-body',
          aisles: [{ id: 'orphan-aisle', aisleBodyId: 'shared-aisle-body' }],
        },
      ],
      noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'one' }],
    }

    expect(isNoteBodyLinked(unlinkedState, 'body-1')).toBe(false)
  })

  it('removes frontmatter when rows are empty', () => {
    expect(buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, [])).toEqual({
      ok: true,
      frontmatter: null,
      templateFieldOrigins: {},
      templateRemovedFieldIds: [],
      computedFields: {},
      warnings: [],
    })
  })

  it('serializes empty date and datetime rows as null values', () => {
    const rows: FrontmatterRowDraft[] = [
      { id: 'due', key: 'due', type: 'date', value: '', computed: 'none', locked: false },
      { id: 'starts', key: 'starts', type: 'datetime', value: '', computed: 'none', locked: false },
    ]

    expect(buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, rows)).toMatchObject({
      ok: true,
      frontmatter: {
        due: null,
        starts: null,
      },
    })
  })

  it('rejects duplicate row keys', () => {
    const rows: FrontmatterRowDraft[] = [
      { id: 'a', key: 'status', type: 'text', value: 'one', computed: 'none', locked: false },
      { id: 'b', key: 'status', type: 'text', value: 'two', computed: 'none', locked: false },
    ]

    expect(buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, rows)).toEqual({
      ok: false,
      message: 'frontmatter key "status" is duplicated.',
    })
  })

  it('refreshes stored reference display names from current state', () => {
    const state = createFrontmatterState()
    const frontmatter = {
      domain: { id: 'domain-1', name: 'Old domain' },
      space: { id: 'space-1', name: 'Old space' },
      note: { id: 'body-1', title: 'Old note' },
    }

    expect(resolveFrontmatterReferencesForState(state, frontmatter)).toEqual({
      domain: { id: 'domain-1', name: 'Tabs' },
      space: { id: 'space-1', name: 'Product' },
      note: { id: 'body-1', title: 'Roadmap' },
    })
  })

  it('does not update note timestamps when only frontmatter changes', () => {
    const state = createFrontmatterState()
    const next = updateNoteBodyFrontmatter(state, 'body-1', { status: 'done' })

    expect(next.noteBodies.find((body) => body.id === 'body-1')?.updatedAt).toBe('2026-05-15T12:30:00.000Z')
  })

  it('opens an existing note with its saved template even if settings is viewing another template', () => {
    const draft = buildFrontmatterModalDraftForNote(createFrontmatterState(), 'body-1', location)

    expect(draft.selectedTemplateId).toBe(template.id)
    expect(draft.templateDerived).toBe(true)
    expect(draft.isTemplateSuggestionDraft).toBe(false)
    expect(draft.rows.map((row) => row.key)).toEqual(['status', 'created', 'space', 'extra'])
  })

  it('opens existing frontmatter without template metadata as no template', () => {
    const state = createFrontmatterState()
    const noTemplateState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies?.map((body) =>
        body.id === 'aisle-body-1'
          ? {
              ...body,
              frontmatterMeta: undefined,
            }
          : body,
      ),
    }

    const draft = buildFrontmatterModalDraftForNote(noTemplateState, 'body-1', location)

    expect(draft.selectedTemplateId).toBe('')
    expect(draft.templateDerived).toBe(false)
    expect(draft.isTemplateSuggestionDraft).toBe(false)
    expect(draft.rows.map((row) => row.key)).toEqual(['status', 'extra'])
  })

  it('opens a blank note with the last applied template as an unsaved draft', () => {
    const state = createFrontmatterState()
    const blankState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies?.map((body) =>
        body.id === 'aisle-body-1'
          ? {
              ...body,
              frontmatter: null,
              frontmatterStatus: 'none' as const,
              frontmatterMeta: undefined,
            }
          : body,
      ),
    }

    const draft = buildFrontmatterModalDraftForNote(blankState, 'body-1', location)

    expect(draft.selectedTemplateId).toBe(template.id)
    expect(draft.templateDerived).toBe(true)
    expect(draft.isTemplateSuggestionDraft).toBe(true)
    expect(draft.rows.map((row) => row.key)).toEqual(['status', 'created', 'space'])
  })

  it('does not mark explicit no-template or invalid last-applied blank notes as template suggestions', () => {
    const state = createFrontmatterState()
    const blankBodyState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies?.map((body) =>
        body.id === 'aisle-body-1'
          ? {
              ...body,
              frontmatter: null,
              frontmatterStatus: 'none' as const,
              frontmatterMeta: {
                templateId: '',
                templateDerived: undefined,
                templateFieldOrigins: undefined,
              },
            }
          : body,
      ),
    }
    const invalidLastAppliedState = {
      ...blankBodyState,
      frontmatter: {
        ...blankBodyState.frontmatter,
        lastAppliedTemplateId: 'missing-template',
      },
      noteAisleBodies: blankBodyState.noteAisleBodies?.map((body) =>
        body.id === 'aisle-body-1'
          ? {
              ...body,
              frontmatterMeta: undefined,
            }
          : body,
      ),
    }
    const missingLastAppliedState = {
      ...invalidLastAppliedState,
      frontmatter: {
        ...invalidLastAppliedState.frontmatter,
        lastAppliedTemplateId: '',
      },
    }

    expect(buildFrontmatterModalDraftForNote(blankBodyState, 'body-1', location)).toMatchObject({
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })
    expect(buildFrontmatterModalDraftForNote(invalidLastAppliedState, 'body-1', location)).toMatchObject({
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })
    expect(buildFrontmatterModalDraftForNote(missingLastAppliedState, 'body-1', location)).toMatchObject({
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })
  })

  it('saving with a template stores note ownership and updates last applied template', () => {
    const rows = buildFrontmatterRowsForNote(createFrontmatterState(), 'body-1', location, otherTemplate, {
      includeExisting: false,
      derived: true,
    })
    const result = buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, rows, {
      selectedTemplateId: otherTemplate.id,
      templateDerived: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const next = updateNoteBodyFrontmatter(createFrontmatterState(), 'body-1', result.frontmatter, {
      templateId: otherTemplate.id,
      templateDerived: true,
      templateFieldOrigins: result.templateFieldOrigins,
      templateRemovedFieldIds: result.templateRemovedFieldIds,
      computedFields: result.computedFields,
    })
    const aisleBody = getAisleBody(next)

    expect(next.frontmatter.lastAppliedTemplateId).toBe(otherTemplate.id)
    expect(aisleBody?.frontmatterMeta).toMatchObject({
      templateId: otherTemplate.id,
      templateDerived: true,
      templateFieldOrigins: {
        owner: { templateId: otherTemplate.id, fieldId: 'owner' },
      },
    })
  })

  it('saving with no template clears note ownership and makes no template the last applied choice', () => {
    const state = createFrontmatterState()
    const next = updateNoteBodyFrontmatter(state, 'body-1', { status: 'manual' }, {
      templateId: null,
      templateDerived: false,
      templateFieldOrigins: {},
    })
    const aisleBody = getAisleBody(next)

    expect(next.frontmatter.lastAppliedTemplateId).toBe('')
    expect(aisleBody?.frontmatterMeta?.templateId).toBeUndefined()
    expect(aisleBody?.frontmatterMeta?.templateDerived).toBeUndefined()
    expect(aisleBody?.frontmatterMeta?.templateFieldOrigins).toBeUndefined()
  })

  it('saving an empty row set marks the note as no template instead of using last applied on reopen', () => {
    const state = createFrontmatterState()
    const result = buildFrontmatterDataFromRows(state, 'body-1', location, [], {
      selectedTemplateId: template.id,
      templateDerived: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const savedState = updateNoteBodyFrontmatter(state, 'body-1', result.frontmatter, {
      templateId: template.id,
      templateDerived: true,
      templateFieldOrigins: result.templateFieldOrigins,
      templateRemovedFieldIds: result.templateRemovedFieldIds,
      computedFields: result.computedFields,
    })
    const aisleBody = getAisleBody(savedState)
    const reopened = buildFrontmatterModalDraftForNote(savedState, 'body-1', location)

    expect(aisleBody?.frontmatter).toBeNull()
    expect(aisleBody?.frontmatterMeta?.templateId).toBe('')
    expect(savedState.frontmatter.lastAppliedTemplateId).toBe('')
    expect(reopened.selectedTemplateId).toBe('')
    expect(reopened.rows).toEqual([])
  })

  it('derived notes drop deleted template fields but disjoint notes preserve rows', () => {
    const state = createFrontmatterState()
    const reducedTemplate = {
      ...template,
      fields: template.fields.filter((field) => field.id !== 'status'),
    }

    const derivedRows = buildFrontmatterRowsForNote(state, 'body-1', location, reducedTemplate, {
      includeExisting: true,
      derived: true,
    })
    const manualRows = buildFrontmatterRowsForNote(state, 'body-1', location, reducedTemplate, {
      includeExisting: true,
      derived: false,
    })

    expect(derivedRows.some((row) => row.key === 'status')).toBe(false)
    expect(manualRows.some((row) => row.key === 'status')).toBe(true)
  })

  it('does not re-add derived rows removed by the user after save', () => {
    const state = createFrontmatterState()
    const keptRows = buildFrontmatterRowsForNote(state, 'body-1', location, template, {
      includeExisting: true,
      derived: true,
    }).filter((row) => row.key !== 'created')
    const result = buildFrontmatterDataFromRows(state, 'body-1', location, keptRows, {
      selectedTemplateId: template.id,
      templateDerived: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const savedState = updateNoteBodyFrontmatter(state, 'body-1', result.frontmatter, {
      templateId: template.id,
      templateDerived: true,
      templateFieldOrigins: result.templateFieldOrigins,
      templateRemovedFieldIds: result.templateRemovedFieldIds,
      computedFields: result.computedFields,
    })
    const reopened = buildFrontmatterModalDraftForNote(savedState, 'body-1', location)

    expect(getAisleBody(savedState)?.frontmatterMeta?.templateRemovedFieldIds).toEqual(['created'])
    expect(reopened.rows.map((row) => row.key)).toEqual(['status', 'space', 'extra'])
    expect(reopened.rows.some((row) => row.key === 'created')).toBe(false)
  })

  it('propagates new template fields to derived notes while keeping explicitly removed fields hidden', () => {
    const state = createFrontmatterState()
    const savedState = {
      ...state,
      noteAisleBodies: state.noteAisleBodies?.map((body) =>
        body.id === 'aisle-body-1'
          ? {
              ...body,
              frontmatterMeta: {
                ...(body.frontmatterMeta ?? {}),
                templateRemovedFieldIds: ['created'],
              },
            }
          : body,
      ),
    }
    const expandedTemplate: FrontmatterTemplate = {
      ...template,
      fields: [
        ...template.fields,
        { id: 'priority', key: 'priority', type: 'text', defaultValue: 'high', computed: 'none' },
      ],
    }

    const rows = buildFrontmatterRowsForNote(savedState, 'body-1', location, expandedTemplate, {
      includeExisting: true,
      derived: true,
    })

    expect(rows.map((row) => row.key)).toEqual(['status', 'space', 'priority', 'extra'])
    expect(rows.find((row) => row.key === 'priority')).toMatchObject({
      value: 'high',
      derived: true,
    })
    expect(rows.some((row) => row.key === 'created')).toBe(false)
  })

  it('saves manual computed fields without a template and reopens them as immutable computed rows', () => {
    const state = createFrontmatterState()
    const rows: FrontmatterRowDraft[] = [
      {
        id: 'manual:updated',
        key: 'updated',
        type: 'datetime',
        value: '',
        computed: 'updatedAt',
        computedEnabled: true,
        computedLocked: false,
        locked: true,
      },
    ]
    const result = buildFrontmatterDataFromRows(state, 'body-1', location, rows)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const savedState = updateNoteBodyFrontmatter(state, 'body-1', result.frontmatter, {
      templateId: null,
      templateDerived: false,
      templateFieldOrigins: {},
      computedFields: result.computedFields,
    })
    const aisleBody = getAisleBody(savedState)
    const reopened = buildFrontmatterModalDraftForNote(savedState, 'body-1', location)

    expect(result.frontmatter).toEqual({ updated: '2026-05-15T12:30:00.000Z' })
    expect(aisleBody?.frontmatterMeta?.computedFields).toEqual({ updated: 'updatedAt' })
    expect(reopened.selectedTemplateId).toBe('')
    expect(reopened.rows).toHaveLength(1)
    expect(reopened.rows[0]).toMatchObject({
      key: 'updated',
      computed: 'updatedAt',
      computedEnabled: true,
      computedLocked: true,
      locked: true,
    })
  })

  it('reverts computed rows without a computed value to normal fields during save', () => {
    const rows: FrontmatterRowDraft[] = [
      {
        id: 'manual:status',
        key: 'status',
        type: 'text',
        value: 'ready',
        computed: 'none',
        computedEnabled: true,
        computedLocked: false,
        locked: true,
      },
    ]

    expect(buildFrontmatterDataFromRows(createFrontmatterState(), 'body-1', location, rows)).toEqual({
      ok: true,
      frontmatter: { status: 'ready' },
      templateFieldOrigins: {},
      templateRemovedFieldIds: [],
      computedFields: {},
      warnings: ['computed field must have a computed value, status reverted to normal field'],
    })
  })

})
