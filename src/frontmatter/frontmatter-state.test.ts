import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from './frontmatter'
import {
  buildFrontmatterDataFromRows,
  buildFrontmatterModalDraftForNote,
  buildFrontmatterRowsForNote,
  resolveFrontmatterReferencesForState,
  updateNoteBodyFrontmatter,
} from './frontmatter-state'
import type { AppState, FrontmatterRowDraft, FrontmatterTemplate, NoteLocation, Space } from '../types/app'

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
          homeContent: '',
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
        frontmatter: { status: 'ready', extra: 'keep' },
        frontmatterTemplateId: template.id,
        frontmatterTemplateDerived: true,
        frontmatterTemplateFieldOrigins: {
          status: { templateId: template.id, fieldId: 'status' },
          created: { templateId: template.id, fieldId: 'created' },
          space: { templateId: template.id, fieldId: 'space' },
        },
        aisles: [{ id: 'aisle-1', markdown: 'body' }],
      },
    ],
    hotkeys: {
      shortcuts: {
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
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
    frontmatter: {
      ...DEFAULT_FRONTMATTER_SETTINGS,
      settingsTemplateId: otherTemplate.id,
      lastAppliedTemplateId: template.id,
      templates: [template, otherTemplate],
    },
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tabButtonScale: 1,
      noteFontScale: 1,
      noteCursorLocations: {},
    },
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
      noteBodies: state.noteBodies.map((body) =>
        body.id === 'body-1'
          ? {
              ...body,
              frontmatterTemplateId: undefined,
              frontmatterTemplateDerived: undefined,
              frontmatterTemplateFieldOrigins: undefined,
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
      noteBodies: state.noteBodies.map((body) =>
        body.id === 'body-1'
          ? {
              ...body,
              frontmatter: null,
              frontmatterTemplateId: undefined,
              frontmatterTemplateDerived: undefined,
              frontmatterTemplateFieldOrigins: undefined,
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
      noteBodies: state.noteBodies.map((body) =>
        body.id === 'body-1'
          ? {
              ...body,
              frontmatter: null,
              frontmatterTemplateId: '',
              frontmatterTemplateDerived: undefined,
              frontmatterTemplateFieldOrigins: undefined,
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
      noteBodies: blankBodyState.noteBodies.map((body) =>
        body.id === 'body-1'
          ? {
              ...body,
              frontmatterTemplateId: undefined,
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
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(next.frontmatter.lastAppliedTemplateId).toBe(otherTemplate.id)
    expect(body).toMatchObject({
      frontmatterTemplateId: otherTemplate.id,
      frontmatterTemplateDerived: true,
      frontmatterTemplateFieldOrigins: {
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
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(next.frontmatter.lastAppliedTemplateId).toBe('')
    expect(body?.frontmatterTemplateId).toBeUndefined()
    expect(body?.frontmatterTemplateDerived).toBeUndefined()
    expect(body?.frontmatterTemplateFieldOrigins).toBeUndefined()
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
    const body = savedState.noteBodies.find((candidate) => candidate.id === 'body-1')
    const reopened = buildFrontmatterModalDraftForNote(savedState, 'body-1', location)

    expect(body?.frontmatter).toBeNull()
    expect(body?.frontmatterTemplateId).toBe('')
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

    expect(savedState.noteBodies.find((body) => body.id === 'body-1')?.frontmatterTemplateRemovedFieldIds).toEqual(['created'])
    expect(reopened.rows.map((row) => row.key)).toEqual(['status', 'space', 'extra'])
    expect(reopened.rows.some((row) => row.key === 'created')).toBe(false)
  })

  it('propagates new template fields to derived notes while keeping explicitly removed fields hidden', () => {
    const state = createFrontmatterState()
    const savedState = {
      ...state,
      noteBodies: state.noteBodies.map((body) =>
        body.id === 'body-1'
          ? {
              ...body,
              frontmatterTemplateRemovedFieldIds: ['created'],
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
    const body = savedState.noteBodies.find((candidate) => candidate.id === 'body-1')
    const reopened = buildFrontmatterModalDraftForNote(savedState, 'body-1', location)

    expect(result.frontmatter).toEqual({ updated: '2026-05-15T12:30:00.000Z' })
    expect(body?.frontmatterComputedFields).toEqual({ updated: 'updatedAt' })
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
