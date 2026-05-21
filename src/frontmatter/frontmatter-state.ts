import { getAisleBodyId } from '../notes/note-markdown'
import { getLocationInfo, listNoteLocationsForBody, listSearchableNoteLocations } from '../notes/note-locations'
import type {
  AppState,
  FrontmatterComputedFieldMap,
  FrontmatterComputedValue,
  FrontmatterData,
  FrontmatterFieldOriginMap,
  FrontmatterFieldType,
  FrontmatterRowDraft,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NoteLocation,
  StageManagerSelectionSnapshot,
} from '../types/app'
import {
  applyFrontmatterTemplate,
  coerceFrontmatterFieldValue,
  coerceFrontmatterString,
  formatFrontmatterFieldValue,
  isFrontmatterComputedValueCompatibleWithFieldType,
  isFrontmatterReferenceComputedValue,
  resolveFrontmatterTemplateFieldValue,
} from './frontmatter'

export function updateNoteBodyFrontmatter(
  state: AppState,
  noteBodyId: string,
  frontmatter: FrontmatterData | null,
  saveOptions?: FrontmatterSaveOptions,
): AppState {
  let changed = false
  const templateId = saveOptions?.templateId?.trim() || null
  const templateFieldOrigins = normalizeTemplateFieldOrigins(saveOptions?.templateFieldOrigins)
  const templateRemovedFieldIds = normalizeTemplateRemovedFieldIds(saveOptions?.templateRemovedFieldIds)
  const computedFields = normalizeComputedFields(saveOptions?.computedFields)
  const noteBodies = state.noteBodies.map((body) => {
    if (body.id !== noteBodyId) return body
    changed = true
    const nextBody = {
      ...body,
      frontmatter,
    }
    if (!saveOptions) return nextBody
    if (frontmatter && templateId) {
      return {
        ...nextBody,
        frontmatterTemplateId: templateId,
        frontmatterTemplateDerived: saveOptions.templateDerived,
        frontmatterTemplateFieldOrigins: saveOptions.templateDerived ? templateFieldOrigins ?? {} : undefined,
        frontmatterTemplateRemovedFieldIds: saveOptions.templateDerived ? templateRemovedFieldIds : undefined,
        frontmatterComputedFields: computedFields,
        frontmatterTemplateDetachedKeys: undefined,
      }
    }
    if (!frontmatter) {
      return {
        ...nextBody,
        frontmatterTemplateId: '',
        frontmatterTemplateDerived: undefined,
        frontmatterTemplateFieldOrigins: undefined,
        frontmatterTemplateRemovedFieldIds: undefined,
        frontmatterComputedFields: undefined,
        frontmatterTemplateDetachedKeys: undefined,
      }
    }
    return {
      ...nextBody,
      frontmatterTemplateId: undefined,
      frontmatterTemplateDerived: undefined,
      frontmatterTemplateFieldOrigins: undefined,
      frontmatterTemplateRemovedFieldIds: undefined,
      frontmatterComputedFields: computedFields,
      frontmatterTemplateDetachedKeys: undefined,
    }
  })
  if (!changed) return state
  if (!templateId || !frontmatter) {
    return {
      ...state,
      noteBodies,
      frontmatter: {
        ...state.frontmatter,
        lastAppliedTemplateId: '',
      },
    }
  }
  return {
    ...state,
    noteBodies,
    frontmatter: {
      ...state.frontmatter,
      lastAppliedTemplateId: templateId,
    },
  }
}

export function buildFrontmatterContext(
  state: AppState,
  location: NoteLocation,
  now = new Date(),
  noteBodyIdOverride?: string,
) {
  const info = getLocationInfo(state, location)
  const noteBodyId = noteBodyIdOverride ?? info.noteBodyId
  const noteBody = noteBodyId ? state.noteBodies.find((body) => body.id === noteBodyId) : null
  const fallbackTimestamp = now.toISOString()
  return {
    now,
    noteBodyId,
    noteCreatedAt: noteBody?.createdAt ?? fallbackTimestamp,
    noteUpdatedAt: noteBody?.updatedAt ?? noteBody?.createdAt ?? fallbackTimestamp,
    noteTitle: info.title,
    isLinked: isNoteBodyLinked(state, noteBodyId),
    tabId: location.tabId,
    subTabId: location.subTabId,
    spaceId: location.spaceId,
    spaceName: info.space?.name ?? '',
    domainId: location.domainId,
    domainName: info.domain?.name ?? '',
  }
}

export function isNoteBodyLinked(state: AppState, noteBodyId: string): boolean {
  if (!noteBodyId) return false
  if (listNoteLocationsForBody(state, noteBodyId).length > 1) return true

  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId) ?? null
  if (!noteBody) return false

  const linkedAisleBodyIds = new Set(noteBody.aisles.map(getAisleBodyId).filter(Boolean))
  if (linkedAisleBodyIds.size === 0) return false

  const locatedNoteBodyIds = new Set(listSearchableNoteLocations(state).map((entry) => entry.noteBodyId))
  return state.noteBodies.some((body) => {
    if (body.id === noteBodyId || !locatedNoteBodyIds.has(body.id)) return false
    return body.aisles.some((aisle) => linkedAisleBodyIds.has(getAisleBodyId(aisle)))
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function inferFrontmatterFieldType(value: unknown): FrontmatterFieldType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) && /[tT]\d{2}:\d{2}/.test(value)) {
    return 'datetime'
  }
  return 'text'
}

function formatFrontmatterRowValue(field: FrontmatterTemplateField, value: unknown): string {
  if (isFrontmatterReferenceComputedValue(field.computed) && isRecord(value)) {
    return coerceFrontmatterString(value.title ?? value.name ?? value.id)
  }
  return formatFrontmatterFieldValue(field.type, value)
}

function normalizeTemplateFieldOrigins(origins: FrontmatterFieldOriginMap | undefined): FrontmatterFieldOriginMap | undefined {
  if (!origins) return undefined
  const next: FrontmatterFieldOriginMap = {}
  Object.entries(origins).forEach(([key, origin]) => {
    const normalizedKey = key.trim()
    const templateId = origin.templateId.trim()
    const fieldId = origin.fieldId.trim()
    if (!normalizedKey || !templateId || !fieldId) return
    next[normalizedKey] = { templateId, fieldId }
  })
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeTemplateRemovedFieldIds(fieldIds: string[] | undefined): string[] | undefined {
  if (!fieldIds) return undefined
  const next = Array.from(new Set(fieldIds.map((fieldId) => fieldId.trim()).filter(Boolean)))
  return next.length > 0 ? next : undefined
}

function normalizeComputedFields(computedFields: FrontmatterComputedFieldMap | undefined): FrontmatterComputedFieldMap | undefined {
  if (!computedFields) return undefined
  const next: FrontmatterComputedFieldMap = {}
  Object.entries(computedFields).forEach(([key, computed]) => {
    const normalizedKey = key.trim()
    if (!normalizedKey || computed === 'none') return
    next[normalizedKey] = computed
  })
  return Object.keys(next).length > 0 ? next : undefined
}

function getTemplateFieldOriginKeys(noteBody: { frontmatterTemplateFieldOrigins?: FrontmatterFieldOriginMap } | null, templateId: string) {
  const origins = noteBody?.frontmatterTemplateFieldOrigins ?? {}
  const keysByFieldId = new Map<string, string>()
  for (const [key, origin] of Object.entries(origins)) {
    if (origin.templateId === templateId && origin.fieldId) keysByFieldId.set(origin.fieldId, key)
  }
  return keysByFieldId
}

function buildTemplateSourceFrontmatter(
  existing: FrontmatterData | null,
  template: FrontmatterTemplate,
  noteBody: { frontmatterTemplateFieldOrigins?: FrontmatterFieldOriginMap } | null,
): FrontmatterData | null {
  if (!existing) return null
  const source = { ...existing }
  const originKeys = getTemplateFieldOriginKeys(noteBody, template.id)
  for (const field of template.fields) {
    const key = field.key.trim()
    const originKey = originKeys.get(field.id)
    if (!key || !originKey || originKey === key || source[key] !== undefined) continue
    source[key] = existing[originKey]
  }
  return source
}

function buildTemplateRow(
  field: FrontmatterTemplateField,
  existing: FrontmatterData | null,
  context: ReturnType<typeof buildFrontmatterContext>,
): FrontmatterRowDraft | null {
  const key = field.key.trim()
  if (!key) return null
  const value = resolveFrontmatterTemplateFieldValue(field, existing, context)
  return {
    id: `template:${field.id}`,
    key,
    type: field.type,
    value: formatFrontmatterRowValue(field, value),
    computed: field.computed,
    computedEnabled: field.computed !== 'none',
    computedLocked: field.computed !== 'none',
    locked: field.computed !== 'none',
    templateFieldId: field.id,
    derived: true,
  }
}

function buildManualRow(
  key: string,
  value: unknown,
  index: number,
  field?: FrontmatterTemplateField,
  savedComputed?: FrontmatterComputedValue,
): FrontmatterRowDraft {
  const rowKey = key.trim()
  const type = field?.type ?? inferFrontmatterFieldType(value)
  const computed = savedComputed && isFrontmatterComputedValueCompatibleWithFieldType(savedComputed, type)
    ? savedComputed
    : 'none'
  const computedField: FrontmatterTemplateField = {
    id: field?.id ?? `computed:${index}:${rowKey}`,
    key: rowKey,
    type,
    defaultValue: '',
    computed,
  }
  return {
    id: `existing:${index}:${rowKey}`,
    key: rowKey,
    type,
    value: computed === 'none' ? formatFrontmatterFieldValue(type, value) : formatFrontmatterRowValue(computedField, value),
    computed,
    computedEnabled: computed !== 'none',
    computedLocked: computed !== 'none',
    locked: computed !== 'none',
    templateFieldId: undefined,
    derived: false,
  }
}

function isComputedEnabled(row: FrontmatterRowDraft) {
  return row.computedEnabled ?? row.computed !== 'none'
}

export function buildFrontmatterRowsForNote(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate | null | undefined,
  options: { includeExisting?: boolean; derived?: boolean } = {},
): FrontmatterRowDraft[] {
  const includeExisting = options.includeExisting ?? true
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId) ?? null
  const existing = includeExisting ? resolveFrontmatterReferencesForState(state, noteBody?.frontmatter ?? null) : null
  const context = buildFrontmatterContext(state, location, new Date(), noteBodyId)
  const rows: FrontmatterRowDraft[] = []
  const templateKeys = new Set<string>()
  const derived = Boolean(template && (options.derived ?? noteBody?.frontmatterTemplateDerived))
  const templateFieldByKey = new Map<string, FrontmatterTemplateField>()
  const consumedExistingKeys = new Set<string>()

  for (const field of template?.fields ?? []) {
    const key = field.key.trim()
    if (key && !templateFieldByKey.has(key)) templateFieldByKey.set(key, field)
  }

  if (template && derived) {
    const templateSource = buildTemplateSourceFrontmatter(existing, template, noteBody)
    const originKeys = getTemplateFieldOriginKeys(noteBody, template.id)
    const removedFieldIds = new Set(noteBody?.frontmatterTemplateRemovedFieldIds ?? [])
    for (const field of template.fields) {
      if (removedFieldIds.has(field.id)) continue
      const row = buildTemplateRow(field, templateSource, context)
      if (!row || templateKeys.has(row.key)) continue
      templateKeys.add(row.key)
      consumedExistingKeys.add(row.key)
      const originKey = originKeys.get(field.id)
      if (originKey) consumedExistingKeys.add(originKey)
      rows.push(row)
    }
  }

  if (!includeExisting || !existing) return rows
  Object.entries(existing).forEach(([key, value], index) => {
    if (!key.trim() || consumedExistingKeys.has(key)) return
    const origin = noteBody?.frontmatterTemplateFieldOrigins?.[key]
    if (template && derived && origin?.templateId === template.id) return
    rows.push(buildManualRow(
      key,
      value,
      index,
      derived ? templateFieldByKey.get(key) : undefined,
      noteBody?.frontmatterComputedFields?.[key],
    ))
  })

  return rows
}

function getTemplateById(state: AppState, templateId: string | null | undefined) {
  if (!templateId) return null
  return state.frontmatter.templates.find((template) => template.id === templateId) ?? null
}

function hasFrontmatterData(frontmatter: FrontmatterData | null | undefined) {
  return Boolean(frontmatter && Object.keys(frontmatter).length > 0)
}

export function buildFrontmatterModalDraftForNote(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
): { rows: FrontmatterRowDraft[]; selectedTemplateId: string; templateDerived: boolean; isTemplateSuggestionDraft: boolean } {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId) ?? null
  const existingFrontmatter = hasFrontmatterData(noteBody?.frontmatter)
  const explicitlyNoTemplate = noteBody?.frontmatterTemplateId === ''
  const noteTemplate = existingFrontmatter ? getTemplateById(state, noteBody?.frontmatterTemplateId) : null
  const blankTemplate = existingFrontmatter || explicitlyNoTemplate ? null : getTemplateById(state, state.frontmatter.lastAppliedTemplateId)
  const selectedTemplate = noteTemplate ?? blankTemplate
  const isTemplateSuggestionDraft = Boolean(!existingFrontmatter && !explicitlyNoTemplate && blankTemplate)
  const templateDerived = existingFrontmatter
    ? Boolean(noteTemplate && noteBody?.frontmatterTemplateDerived)
    : Boolean(blankTemplate)

  return {
    rows: buildFrontmatterRowsForNote(state, noteBodyId, location, selectedTemplate, {
      includeExisting: existingFrontmatter,
      derived: templateDerived,
    }),
    selectedTemplateId: selectedTemplate?.id ?? '',
    templateDerived,
    isTemplateSuggestionDraft,
  }
}

export function buildFrontmatterDataFromRows(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  rows: FrontmatterRowDraft[],
  options: { selectedTemplateId?: string; templateDerived?: boolean } = {},
): {
  ok: true
  frontmatter: FrontmatterData | null
  templateFieldOrigins: FrontmatterFieldOriginMap
  templateRemovedFieldIds: string[]
  computedFields: FrontmatterComputedFieldMap
  warnings: string[]
} | { ok: false; message: string } {
  const context = buildFrontmatterContext(state, location, new Date(), noteBodyId)
  const seenKeys = new Set<string>()
  const templateFieldOrigins: FrontmatterFieldOriginMap = {}
  const computedFields: FrontmatterComputedFieldMap = {}
  const derivedFieldIds = new Set<string>()
  const frontmatter: FrontmatterData = {}
  const warnings: string[] = []
  const selectedTemplateId = options.selectedTemplateId?.trim() || ''
  const templateDerived = Boolean(selectedTemplateId && options.templateDerived)
  const selectedTemplate = templateDerived ? getTemplateById(state, selectedTemplateId) : null

  for (const row of rows) {
    const key = row.key.trim()
    if (!key && !row.value.trim()) continue
    if (!key) return { ok: false, message: 'frontmatter rows need a key.' }
    if (seenKeys.has(key)) return { ok: false, message: `frontmatter key "${key}" is duplicated.` }
    seenKeys.add(key)

    const computedEnabled = isComputedEnabled(row)
    const computedValue = computedEnabled && isFrontmatterComputedValueCompatibleWithFieldType(row.computed, row.type)
      ? row.computed
      : 'none'
    if (computedEnabled && computedValue === 'none') {
      warnings.push(`computed field must have a computed value, ${key} reverted to normal field`)
    }

    if (computedValue !== 'none') {
      const field: FrontmatterTemplateField = {
        id: row.templateFieldId ?? row.id,
        key,
        type: row.type,
        defaultValue: '',
        computed: computedValue,
      }
      frontmatter[key] = resolveFrontmatterTemplateFieldValue(field, null, context)
      computedFields[key] = computedValue
    } else {
      frontmatter[key] = coerceFrontmatterFieldValue(row.type, row.value)
    }
    if (templateDerived && row.derived && row.templateFieldId) {
      derivedFieldIds.add(row.templateFieldId)
      templateFieldOrigins[key] = {
        templateId: selectedTemplateId,
        fieldId: row.templateFieldId,
      }
    }
  }
  const templateRemovedFieldIds = templateDerived && selectedTemplate
    ? selectedTemplate.fields
        .filter((field) => field.key.trim() && !derivedFieldIds.has(field.id))
        .map((field) => field.id)
    : []

  return {
    ok: true,
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
    templateFieldOrigins,
    templateRemovedFieldIds,
    computedFields,
    warnings,
  }
}

export function resolveFrontmatterReferencesForState(
  state: AppState,
  frontmatter: FrontmatterData | null,
): FrontmatterData | null {
  if (!frontmatter) return null
  let changed = false
  const next: FrontmatterData = {}
  const domains = state.domains.map((domain) =>
    domain.id === state.activeDomainId ? { ...domain, activeSpaceId: state.activeSpaceId, spaces: state.spaces } : domain,
  )
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!isRecord(value) || typeof value.id !== 'string') {
      next[key] = value
      continue
    }

    const domain = domains.find((candidate) => candidate.id === value.id)
    if (domain && typeof value.name === 'string') {
      const resolved = { ...value, name: domain.name }
      changed ||= resolved.name !== value.name
      next[key] = resolved
      continue
    }

    const space = domains.flatMap((domainCandidate) => domainCandidate.spaces).find((candidate) => candidate.id === value.id)
    if (space && typeof value.name === 'string') {
      const resolved = { ...value, name: space.name }
      changed ||= resolved.name !== value.name
      next[key] = resolved
      continue
    }

    if (typeof value.title === 'string') {
      const locationTitle = domains
        .flatMap((domainCandidate) => domainCandidate.spaces)
        .flatMap((spaceCandidate) => spaceCandidate.data.tabs)
        .flatMap((tab) => [
          { noteBodyId: tab.noteBodyId, title: tab.title },
          ...tab.subTabs.map((subTab) => ({ noteBodyId: subTab.noteBodyId, title: subTab.title })),
        ])
        .find((entry) => entry.noteBodyId === value.id)?.title ?? value.title
      const resolved = { ...value, title: locationTitle }
      changed ||= resolved.title !== value.title
      next[key] = resolved
      continue
    }

    next[key] = value
  }
  return changed ? next : frontmatter
}

export function applyTemplateToNoteBody(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate,
  now = new Date(),
): AppState {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  if (!noteBody) return state
  const nextFrontmatter = applyFrontmatterTemplate(
    noteBody.frontmatter,
    template,
    buildFrontmatterContext(state, location, now),
  )
  const templateFieldOrigins: FrontmatterFieldOriginMap = {}
  const computedFields: FrontmatterComputedFieldMap = {}
  for (const field of template.fields) {
    const key = field.key.trim()
    if (!key) continue
    templateFieldOrigins[key] = { templateId: template.id, fieldId: field.id }
    if (field.computed !== 'none') computedFields[key] = field.computed
  }
  return updateNoteBodyFrontmatter(state, noteBodyId, nextFrontmatter, {
    templateId: template.id,
    templateDerived: true,
    templateFieldOrigins,
    templateRemovedFieldIds: [],
    computedFields,
  })
}

export function buildSelectedStageManagerNoteTargets(
  state: AppState,
  activeSpaceId: string,
  snapshot: StageManagerSelectionSnapshot,
): NoteLocation[] {
  const targets: NoteLocation[] = []
  for (const tab of snapshot.fullParents) {
    targets.push({
      domainId: state.activeDomainId,
      spaceId: activeSpaceId,
      tabId: tab.id,
      subTabId: null,
    })
    for (const subTab of tab.subTabs) {
      targets.push({
        domainId: state.activeDomainId,
        spaceId: activeSpaceId,
        tabId: tab.id,
        subTabId: subTab.id,
      })
    }
  }
  for (const { parentTab, subTab } of snapshot.looseSubTabs) {
    targets.push({
      domainId: state.activeDomainId,
      spaceId: activeSpaceId,
      tabId: parentTab.id,
      subTabId: subTab.id,
    })
  }
  return targets
}

export function applyTemplateToStageManagerSelection(
  state: AppState,
  activeSpaceId: string,
  snapshot: StageManagerSelectionSnapshot,
  template: FrontmatterTemplate,
  now = new Date(),
): AppState {
  let nextState = state
  const seenBodyIds = new Set<string>()
  for (const location of buildSelectedStageManagerNoteTargets(state, activeSpaceId, snapshot)) {
    const noteBodyId = getLocationInfo(nextState, location).noteBodyId
    if (!noteBodyId || seenBodyIds.has(noteBodyId)) continue
    seenBodyIds.add(noteBodyId)
    nextState = applyTemplateToNoteBody(nextState, noteBodyId, location, template, now)
  }
  return nextState
}
