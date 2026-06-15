import { isNoteBodyLinked as resolveNoteBodyLinkedStatus } from '../notes/link-status'
import { getLocationInfo } from '../notes/note-locations'
import { getAisleBodyTags } from '../tags/tags.js'
import type {
  AppState,
  FrontmatterComputedFieldMap,
  FrontmatterComputedValue,
  FrontmatterData,
  FrontmatterFieldOriginMap,
  FrontmatterFieldType,
  FrontmatterMeta,
  FrontmatterRowDraft,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NoteAisleBody,
  NoteBody,
  NoteLocation,
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

function getFirstAisleBodyId(state: AppState, noteBodyId: string): string {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  const firstAisle = noteBody?.aisles[0]
  if (!firstAisle) return ''
  return firstAisle.aisleBodyId
}

function getAisleBody(state: AppState, aisleBodyId: string): NoteAisleBody | null {
  return (state.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
}

function getNoteBody(state: AppState, noteBodyId: string): NoteBody | null {
  return state.noteBodies.find((body) => body.id === noteBodyId) ?? null
}

function buildFrontmatterMeta(frontmatter: FrontmatterData | null, saveOptions: FrontmatterSaveOptions | undefined): FrontmatterMeta | undefined {
  if (!saveOptions) return undefined
  const templateId = saveOptions.templateId?.trim() || null
  const templateFieldOrigins = normalizeTemplateFieldOrigins(saveOptions.templateFieldOrigins)
  const templateRemovedFieldIds = normalizeTemplateRemovedFieldIds(saveOptions.templateRemovedFieldIds)
  const computedFields = normalizeComputedFields(saveOptions.computedFields)
  if (frontmatter && templateId) {
    return {
      templateId,
      templateDerived: saveOptions.templateDerived,
      templateFieldOrigins: saveOptions.templateDerived ? templateFieldOrigins ?? {} : undefined,
      templateRemovedFieldIds: saveOptions.templateDerived ? templateRemovedFieldIds : undefined,
      computedFields,
    }
  }
  if (!frontmatter) {
    return {
      templateId: '',
      templateDerived: undefined,
      templateFieldOrigins: undefined,
      templateRemovedFieldIds: undefined,
      computedFields: undefined,
    }
  }
  return {
    templateId: undefined,
    templateDerived: undefined,
    templateFieldOrigins: undefined,
    templateRemovedFieldIds: undefined,
    computedFields,
  }
}

function getTargetFrontmatter(state: AppState, _noteBodyId: string, aisleBodyId: string): FrontmatterData | null {
  const aisleBody = getAisleBody(state, aisleBodyId)
  return aisleBody?.frontmatter ?? null
}

function getTargetFrontmatterMeta(state: AppState, _noteBodyId: string, aisleBodyId: string): FrontmatterMeta | undefined {
  return getAisleBody(state, aisleBodyId)?.frontmatterMeta
}

function ensureAisleBodyForNote(state: AppState, noteBodyId: string, aisleBodyId: string): AppState {
  if (!aisleBodyId || (state.noteAisleBodies ?? []).some((body) => body.id === aisleBodyId)) return state
  const noteBody = getNoteBody(state, noteBodyId)
  const aisle = noteBody?.aisles.find((candidate) => (candidate.aisleBodyId || candidate.id) === aisleBodyId) ?? noteBody?.aisles[0]
  if (!noteBody || !aisle) return state
  return {
    ...state,
    noteAisleBodies: [
      ...(state.noteAisleBodies ?? []),
      {
        id: aisleBodyId,
        createdAt: noteBody.createdAt,
        updatedAt: noteBody.updatedAt,
        markdown: '',
        frontmatter: null,
        frontmatterStatus: 'none',
      },
    ],
  }
}

export function updateAisleFrontmatter(
  state: AppState,
  aisleBodyId: string,
  frontmatter: FrontmatterData | null,
  saveOptions?: FrontmatterSaveOptions,
): AppState {
  let changed = false
  const templateId = saveOptions?.templateId?.trim() || null
  const noteAisleBodies = (state.noteAisleBodies ?? []).map((body) => {
    if (body.id !== aisleBodyId) return body
    changed = true
    const nextBody = {
      ...body,
      frontmatter,
      frontmatterStatus: frontmatter ? 'valid' as const : 'none' as const,
      frontmatterParseError: undefined,
      frontmatterRaw: undefined,
    }
    if (!saveOptions) return nextBody
    return {
      ...nextBody,
      frontmatterMeta: buildFrontmatterMeta(frontmatter, saveOptions),
    }
  })
  if (!changed) return state
  if (!templateId || !frontmatter) {
    return {
      ...state,
      noteAisleBodies,
      frontmatter: {
        ...state.frontmatter,
        lastAppliedTemplateId: '',
      },
    }
  }
  return {
    ...state,
    noteAisleBodies,
    frontmatter: {
      ...state.frontmatter,
      lastAppliedTemplateId: templateId,
    },
  }
}

export function updateNoteBodyFrontmatter(
  state: AppState,
  noteBodyId: string,
  frontmatter: FrontmatterData | null,
  saveOptions?: FrontmatterSaveOptions,
): AppState {
  const aisleBodyId = getFirstAisleBodyId(state, noteBodyId)
  if (!aisleBodyId) return state
  const ensuredState = ensureAisleBodyForNote(state, noteBodyId, aisleBodyId)
  return updateAisleFrontmatter(ensuredState, aisleBodyId, frontmatter, saveOptions)
}

export function buildFrontmatterContext(
  state: AppState,
  location: NoteLocation,
  now = new Date(),
  noteBodyIdOverride?: string,
  aisleBodyIdOverride?: string,
) {
  const info = getLocationInfo(state, location)
  const noteBodyId = noteBodyIdOverride ?? info.noteBodyId
  const noteBody = noteBodyId ? state.noteBodies.find((body) => body.id === noteBodyId) : null
  const aisleBodyId = aisleBodyIdOverride || noteBody?.aisles[0]?.aisleBodyId || ''
  const aisleBody = aisleBodyId ? getAisleBody(state, aisleBodyId) : null
  const fallbackTimestamp = now.toISOString()
  const folderPath = info.folderPath
  const folderName = folderPath.split('/').filter(Boolean).at(-1) ?? ''
  return {
    now,
    noteBodyId,
    noteCreatedAt: noteBody?.createdAt ?? fallbackTimestamp,
    noteUpdatedAt: noteBody?.updatedAt ?? noteBody?.createdAt ?? fallbackTimestamp,
    noteTitle: info.title,
    folderName,
    folderPath,
    isLinked: isNoteBodyLinked(state, noteBodyId),
    tags: getAisleBodyTags(aisleBody),
  }
}

export function isNoteBodyLinked(state: AppState, noteBodyId: string): boolean {
  return resolveNoteBodyLinkedStatus(state, noteBodyId)
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

function getTemplateFieldOriginKeys(meta: FrontmatterMeta | null | undefined, templateId: string) {
  const origins = meta?.templateFieldOrigins ?? {}
  const keysByFieldId = new Map<string, string>()
  for (const [key, origin] of Object.entries(origins)) {
    if (origin.templateId === templateId && origin.fieldId) keysByFieldId.set(origin.fieldId, key)
  }
  return keysByFieldId
}

function buildTemplateSourceFrontmatter(
  existing: FrontmatterData | null,
  template: FrontmatterTemplate,
  meta: FrontmatterMeta | null | undefined,
): FrontmatterData | null {
  if (!existing) return null
  const source = { ...existing }
  const originKeys = getTemplateFieldOriginKeys(meta, template.id)
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

export function buildFrontmatterRowsForAisle(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate | null | undefined,
  options: { includeExisting?: boolean; derived?: boolean } = {},
): FrontmatterRowDraft[] {
  const includeExisting = options.includeExisting ?? true
  const meta = getTargetFrontmatterMeta(state, noteBodyId, aisleBodyId)
  const existing = includeExisting ? resolveFrontmatterReferencesForState(state, getTargetFrontmatter(state, noteBodyId, aisleBodyId)) : null
  const context = buildFrontmatterContext(state, location, new Date(), noteBodyId, aisleBodyId)
  const rows: FrontmatterRowDraft[] = []
  const templateKeys = new Set<string>()
  const derived = Boolean(template && (options.derived ?? meta?.templateDerived))
  const templateFieldByKey = new Map<string, FrontmatterTemplateField>()
  const consumedExistingKeys = new Set<string>()

  for (const field of template?.fields ?? []) {
    const key = field.key.trim()
    if (key && !templateFieldByKey.has(key)) templateFieldByKey.set(key, field)
  }

  if (template && derived) {
    const templateSource = buildTemplateSourceFrontmatter(existing, template, meta)
    const originKeys = getTemplateFieldOriginKeys(meta, template.id)
    const removedFieldIds = new Set(meta?.templateRemovedFieldIds ?? [])
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
    const origin = meta?.templateFieldOrigins?.[key]
    if (template && derived && origin?.templateId === template.id) return
    rows.push(buildManualRow(
      key,
      value,
      index,
      derived ? templateFieldByKey.get(key) : undefined,
      meta?.computedFields?.[key],
    ))
  })

  return rows
}

export function buildFrontmatterRowsForNote(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate | null | undefined,
  options: { includeExisting?: boolean; derived?: boolean } = {},
): FrontmatterRowDraft[] {
  const aisleBodyId = getFirstAisleBodyId(state, noteBodyId)
  return aisleBodyId
    ? buildFrontmatterRowsForAisle(state, noteBodyId, aisleBodyId, location, template, options)
    : []
}

function getTemplateById(state: AppState, templateId: string | null | undefined) {
  if (!templateId) return null
  return state.frontmatter.templates.find((template) => template.id === templateId) ?? null
}

function hasFrontmatterData(frontmatter: FrontmatterData | null | undefined) {
  return Boolean(frontmatter && Object.keys(frontmatter).length > 0)
}

export function buildFrontmatterModalDraftForAisle(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
): { rows: FrontmatterRowDraft[]; selectedTemplateId: string; templateDerived: boolean; isTemplateSuggestionDraft: boolean } {
  const meta = getTargetFrontmatterMeta(state, noteBodyId, aisleBodyId)
  const existingFrontmatter = hasFrontmatterData(getTargetFrontmatter(state, noteBodyId, aisleBodyId))
  const explicitlyNoTemplate = meta?.templateId === ''
  const noteTemplate = existingFrontmatter ? getTemplateById(state, meta?.templateId) : null
  const blankTemplate = existingFrontmatter || explicitlyNoTemplate ? null : getTemplateById(state, state.frontmatter.lastAppliedTemplateId)
  const selectedTemplate = noteTemplate ?? blankTemplate
  const isTemplateSuggestionDraft = Boolean(!existingFrontmatter && !explicitlyNoTemplate && blankTemplate)
  const templateDerived = existingFrontmatter
    ? Boolean(noteTemplate && meta?.templateDerived)
    : Boolean(blankTemplate)

  return {
    rows: buildFrontmatterRowsForAisle(state, noteBodyId, aisleBodyId, location, selectedTemplate, {
      includeExisting: existingFrontmatter,
      derived: templateDerived,
    }),
    selectedTemplateId: selectedTemplate?.id ?? '',
    templateDerived,
    isTemplateSuggestionDraft,
  }
}

export function buildFrontmatterModalDraftForNote(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
): { rows: FrontmatterRowDraft[]; selectedTemplateId: string; templateDerived: boolean; isTemplateSuggestionDraft: boolean } {
  const aisleBodyId = getFirstAisleBodyId(state, noteBodyId)
  return aisleBodyId
    ? buildFrontmatterModalDraftForAisle(state, noteBodyId, aisleBodyId, location)
    : { rows: [], selectedTemplateId: '', templateDerived: false, isTemplateSuggestionDraft: false }
}

export function buildFrontmatterDataFromRows(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  rows: FrontmatterRowDraft[],
  options: { selectedTemplateId?: string; templateDerived?: boolean; aisleBodyId?: string } = {},
): {
  ok: true
  frontmatter: FrontmatterData | null
  templateFieldOrigins: FrontmatterFieldOriginMap
  templateRemovedFieldIds: string[]
  computedFields: FrontmatterComputedFieldMap
  warnings: string[]
} | { ok: false; message: string } {
  const context = buildFrontmatterContext(state, location, new Date(), noteBodyId, options.aisleBodyId)
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
    if (!key) return { ok: false, message: 'Frontmatter rows need a key.' }
    if (seenKeys.has(key)) return { ok: false, message: `Frontmatter key "${key}" is duplicated.` }
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

export function applyTemplateToAisleBody(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate,
  now = new Date(),
): AppState {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  if (!noteBody) return state
  const aisleBody = getAisleBody(state, aisleBodyId)
  if (!aisleBody) return state
  const nextFrontmatter = applyFrontmatterTemplate(
    aisleBody.frontmatter ?? null,
    template,
    buildFrontmatterContext(state, location, now, noteBodyId, aisleBodyId),
  )
  const templateFieldOrigins: FrontmatterFieldOriginMap = {}
  const computedFields: FrontmatterComputedFieldMap = {}
  for (const field of template.fields) {
    const key = field.key.trim()
    if (!key) continue
    templateFieldOrigins[key] = { templateId: template.id, fieldId: field.id }
    if (field.computed !== 'none') computedFields[key] = field.computed
  }
  return updateAisleFrontmatter(state, aisleBodyId, nextFrontmatter, {
    templateId: template.id,
    templateDerived: true,
    templateFieldOrigins,
    templateRemovedFieldIds: [],
    computedFields,
  })
}

export function applyTemplateToNoteBody(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate,
  now = new Date(),
): AppState {
  const aisleBodyId = getFirstAisleBodyId(state, noteBodyId)
  if (!aisleBodyId) return state
  const ensuredState = ensureAisleBodyForNote(state, noteBodyId, aisleBodyId)
  const noteBody = getNoteBody(ensuredState, noteBodyId)
  const nextFrontmatter = applyFrontmatterTemplate(
    getTargetFrontmatter(ensuredState, noteBodyId, aisleBodyId),
    template,
    buildFrontmatterContext(ensuredState, location, now, noteBodyId, aisleBodyId),
  )
  const templateFieldOrigins: FrontmatterFieldOriginMap = {}
  const computedFields: FrontmatterComputedFieldMap = {}
  for (const field of template.fields) {
    const key = field.key.trim()
    if (!key) continue
    templateFieldOrigins[key] = { templateId: template.id, fieldId: field.id }
    if (field.computed !== 'none') computedFields[key] = field.computed
  }
  return noteBody
    ? updateNoteBodyFrontmatter(ensuredState, noteBodyId, nextFrontmatter, {
        templateId: template.id,
        templateDerived: true,
        templateFieldOrigins,
        templateRemovedFieldIds: [],
        computedFields,
      })
    : state
}
