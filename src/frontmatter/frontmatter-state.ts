import { getAisleBodyTags } from '../tags/tags.js'
import type {
  AppState,
  FrontmatterComputedFieldMap,
  FrontmatterComputedValue,
  FrontmatterData,
  FrontmatterFieldOriginMap,
  FrontmatterFieldType,
  FrontmatterMeta,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NoteAisleBody,
  NoteBody,
  NoteLocation,
} from '../types/app'
import { listVaultNotes } from '../state/vault'
import { isNoteBodyLinked } from '../notes/link-status'
import { getLocationInfo } from '../notes/note-locations'
import {
  coerceFrontmatterFieldValue,
  coerceFrontmatterString,
  formatFrontmatterFieldValue,
  getFrontmatterComputedValuesForFieldType,
  isFrontmatterComputedValueCompatibleWithFieldType,
  isFrontmatterReferenceComputedValue,
  normalizeFrontmatterFixedListOptions,
  resolveFrontmatterFixedListValues,
  resolveFrontmatterTemplateFieldValue,
} from './frontmatter'

export type FrontmatterRowDraft = {
  id: string
  key: string
  type: FrontmatterFieldType
  value: string
  computed: FrontmatterComputedValue
  computedEnabled?: boolean
  computedLocked?: boolean
  locked?: boolean
  templateFieldId?: string
  derived?: boolean
  fixedListOptions?: string[]
}

export type FrontmatterModalDraft = {
  rows: FrontmatterRowDraft[]
  selectedTemplateId: string
  templateDerived: boolean
  isTemplateSuggestionDraft: boolean
}

export type FrontmatterRowsBuildOptions = {
  includeExisting?: boolean
  derived?: boolean
}

export type BuildFrontmatterDataResult =
  | {
      ok: true
      frontmatter: FrontmatterData | null
      templateFieldOrigins: FrontmatterFieldOriginMap
      templateRemovedFieldIds: string[]
      computedFields: FrontmatterComputedFieldMap
      warnings: string[]
    }
  | { ok: false; message: string }

export type FrontmatterDropPosition = 'before' | 'after'
export type FrontmatterRowDropPosition = FrontmatterDropPosition

export function reorderFrontmatterItemsByTargetIndex<T extends { id: string }>(
  items: T[],
  sourceItemId: string,
  targetIndex: number,
): T[] {
  if (!sourceItemId) return items

  const sourceIndex = items.findIndex((item) => item.id === sourceItemId)
  if (sourceIndex < 0) return items

  const boundedTargetIndex = Math.min(Math.max(Math.floor(targetIndex), 0), items.length)
  if (boundedTargetIndex === sourceIndex || boundedTargetIndex === sourceIndex + 1) return items

  const next = [...items]
  const [sourceItem] = next.splice(sourceIndex, 1)
  if (!sourceItem) return items

  const adjustedTargetIndex = sourceIndex < boundedTargetIndex ? boundedTargetIndex - 1 : boundedTargetIndex
  next.splice(adjustedTargetIndex, 0, sourceItem)

  return next.every((item, index) => item.id === items[index]?.id) ? items : next
}

export function reorderFrontmatterTemplateFieldsByTargetIndex(
  templates: FrontmatterTemplate[],
  templateId: string,
  sourceFieldId: string,
  targetIndex: number,
): FrontmatterTemplate[] {
  if (!templateId || !sourceFieldId) return templates

  let changed = false
  const nextTemplates = templates.map((template) => {
    if (template.id !== templateId) return template
    const nextFields = reorderFrontmatterItemsByTargetIndex(template.fields, sourceFieldId, targetIndex)
    if (nextFields === template.fields) return template
    changed = true
    return { ...template, fields: nextFields }
  })

  return changed ? nextTemplates : templates
}

export function reorderFrontmatterRowsByInsertion(
  rows: FrontmatterRowDraft[],
  sourceRowId: string,
  targetRowId: string,
  position: FrontmatterRowDropPosition,
): FrontmatterRowDraft[] {
  if (!sourceRowId || !targetRowId || sourceRowId === targetRowId) return rows

  const targetIndex = rows.findIndex((row) => row.id === targetRowId)
  if (targetIndex < 0) return rows

  return reorderFrontmatterItemsByTargetIndex(rows, sourceRowId, position === 'before' ? targetIndex : targetIndex + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getAisleBody(state: AppState, aisleBodyId: string): NoteAisleBody | null {
  return (state.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
}

function getNoteBody(state: AppState, noteBodyId: string): NoteBody | null {
  return state.noteBodies.find((body) => body.id === noteBodyId) ?? null
}

function getFirstAisleBodyId(state: AppState, noteBodyId: string): string {
  return getNoteBody(state, noteBodyId)?.aisles[0]?.aisleBodyId ?? ''
}

function getTemplateById(state: AppState, templateId: string | null | undefined): FrontmatterTemplate | null {
  if (!templateId) return null
  return state.frontmatter.templates.find((template) => template.id === templateId) ?? null
}

function getTargetFrontmatter(state: AppState, _noteBodyId: string, aisleBodyId: string): FrontmatterData | null {
  return getAisleBody(state, aisleBodyId)?.frontmatter ?? null
}

function getTargetFrontmatterMeta(state: AppState, _noteBodyId: string, aisleBodyId: string): FrontmatterMeta | undefined {
  return getAisleBody(state, aisleBodyId)?.frontmatterMeta
}

function hasFrontmatterData(frontmatter: FrontmatterData | null | undefined): boolean {
  return Boolean(frontmatter && Object.keys(frontmatter).length > 0)
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
  if (field.type === 'fixedList') {
    return resolveFrontmatterFixedListValues(field.options, value, field.defaultValue).join(', ')
  }
  return formatFrontmatterFieldValue(field.type, value)
}

function getFieldFixedListOptions(field: FrontmatterTemplateField | undefined): string[] | undefined {
  if (field?.type !== 'fixedList') return undefined
  return normalizeFrontmatterFixedListOptions(field.options)
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

function getTemplateFieldOriginKeys(meta: FrontmatterMeta | null | undefined, templateId: string): Map<string, string> {
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
    locked: true,
    templateFieldId: field.id,
    derived: true,
    fixedListOptions: getFieldFixedListOptions(field),
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
  const fixedListOptions = getFieldFixedListOptions(field)
  const computedField: FrontmatterTemplateField = {
    id: field?.id ?? `computed:${index}:${rowKey}`,
    key: rowKey,
    type,
    defaultValue: '',
    computed,
    ...(field?.type === 'fixedList' ? { options: fixedListOptions ?? [] } : {}),
  }
  const fieldValue = type === 'fixedList'
    ? resolveFrontmatterFixedListValues(fixedListOptions, value, field?.defaultValue)
    : value
  return {
    id: `existing:${index}:${rowKey}`,
    key: rowKey,
    type,
    value: computed === 'none' ? formatFrontmatterFieldValue(type, fieldValue) : formatFrontmatterRowValue(computedField, value),
    computed,
    computedEnabled: computed !== 'none',
    computedLocked: false,
    locked: false,
    templateFieldId: undefined,
    derived: false,
    fixedListOptions,
  }
}

function isComputedEnabled(row: FrontmatterRowDraft): boolean {
  return row.computedEnabled ?? row.computed !== 'none'
}

function getInvalidComputedRowWarning(key: string): string {
  return `computed field must have a computed value, ${key} reverted to normal field`
}

export function getDefaultFrontmatterComputedValueForType(type: FrontmatterFieldType): FrontmatterComputedValue {
  return getFrontmatterComputedValuesForFieldType(type).find((computed) => computed !== 'none') ?? 'none'
}

export function resolveFrontmatterRowComputedForType(
  row: FrontmatterRowDraft,
  nextType: FrontmatterFieldType,
): FrontmatterComputedValue {
  if (!isComputedEnabled(row)) return 'none'
  if (row.computed !== 'none' && isFrontmatterComputedValueCompatibleWithFieldType(row.computed, nextType)) {
    return row.computed
  }
  return getDefaultFrontmatterComputedValueForType(nextType)
}

export function disableInvalidComputedFrontmatterRows(rows: FrontmatterRowDraft[]): {
  rows: FrontmatterRowDraft[]
  warnings: string[]
} {
  const warnings: string[] = []
  let changed = false
  const nextRows = rows.map((row) => {
    const key = row.key.trim()
    const computedEnabled = isComputedEnabled(row)
    const computedValue = computedEnabled && isFrontmatterComputedValueCompatibleWithFieldType(row.computed, row.type)
      ? row.computed
      : 'none'
    if (!computedEnabled || computedValue !== 'none') return row
    changed = true
    warnings.push(getInvalidComputedRowWarning(key || 'field'))
    return {
      ...row,
      computed: 'none' as const,
      computedEnabled: false,
      computedLocked: false,
      locked: false,
    }
  })
  return {
    rows: changed ? nextRows : rows,
    warnings,
  }
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
  const noteBody = noteBodyId ? getNoteBody(state, noteBodyId) : null
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

export function resolveFrontmatterReferencesForState(
  state: AppState,
  frontmatter: FrontmatterData | null,
): FrontmatterData | null {
  if (!frontmatter) return null
  let changed = false
  const next: FrontmatterData = {}
  const noteTitlesByBodyId = new Map(listVaultNotes(state.vault.items).map(({ note }) => [note.noteBodyId, note.title]))

  for (const [key, value] of Object.entries(frontmatter)) {
    if (!isRecord(value) || typeof value.id !== 'string') {
      next[key] = value
      continue
    }

    if (typeof value.title === 'string') {
      const title = noteTitlesByBodyId.get(value.id) ?? value.title
      const resolved = { ...value, title }
      changed ||= resolved.title !== value.title
      next[key] = resolved
      continue
    }

    next[key] = value
  }

  return changed ? next : frontmatter
}

export function buildFrontmatterRowsForAisle(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate | null | undefined,
  options: FrontmatterRowsBuildOptions = {},
): FrontmatterRowDraft[] {
  const includeExisting = options.includeExisting ?? true
  const meta = getTargetFrontmatterMeta(state, noteBodyId, aisleBodyId)
  const existing = includeExisting
    ? resolveFrontmatterReferencesForState(state, getTargetFrontmatter(state, noteBodyId, aisleBodyId))
    : null
  const context = buildFrontmatterContext(state, location, new Date(), noteBodyId, aisleBodyId)
  const templateKeys = new Set<string>()
  const derived = Boolean(template && (options.derived ?? meta?.templateDerived))
  const templateFieldByKey = new Map<string, FrontmatterTemplateField>()
  const consumedExistingKeys = new Set<string>()
  const derivedEntries: Array<{ fieldId: string; row: FrontmatterRowDraft }> = []
  const derivedRowByExistingKey = new Map<string, FrontmatterRowDraft>()

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
      derivedEntries.push({ fieldId: field.id, row })
      if (existing && Object.prototype.hasOwnProperty.call(existing, row.key)) {
        derivedRowByExistingKey.set(row.key, row)
      }
      if (existing && originKey && Object.prototype.hasOwnProperty.call(existing, originKey)) {
        derivedRowByExistingKey.set(originKey, row)
      }
    }
  }

  if (!includeExisting || !existing) return derivedEntries.map((entry) => entry.row)

  const rows: FrontmatterRowDraft[] = []
  const emittedDerivedFieldIds = new Set<string>()

  Object.entries(existing).forEach(([key, value], index) => {
    if (!key.trim()) return
    const derivedRow = derivedRowByExistingKey.get(key)
    if (derivedRow?.templateFieldId) {
      if (!emittedDerivedFieldIds.has(derivedRow.templateFieldId)) {
        rows.push(derivedRow)
        emittedDerivedFieldIds.add(derivedRow.templateFieldId)
      }
      return
    }
    if (consumedExistingKeys.has(key)) return
    rows.push(buildManualRow(
      key,
      value,
      index,
      derived ? templateFieldByKey.get(key) : undefined,
      meta?.computedFields?.[key],
    ))
  })

  const findTemplateRowIndex = (fieldId: string) =>
    rows.findIndex((row) => row.derived && row.templateFieldId === fieldId)

  derivedEntries.forEach((entry, entryIndex) => {
    if (emittedDerivedFieldIds.has(entry.fieldId)) return
    let insertIndex = -1
    for (let previousIndex = entryIndex - 1; previousIndex >= 0; previousIndex -= 1) {
      const previousRowIndex = findTemplateRowIndex(derivedEntries[previousIndex].fieldId)
      if (previousRowIndex >= 0) {
        insertIndex = previousRowIndex + 1
        break
      }
    }
    if (insertIndex < 0) {
      for (let nextIndex = entryIndex + 1; nextIndex < derivedEntries.length; nextIndex += 1) {
        const nextRowIndex = findTemplateRowIndex(derivedEntries[nextIndex].fieldId)
        if (nextRowIndex >= 0) {
          insertIndex = nextRowIndex
          break
        }
      }
    }
    rows.splice(insertIndex < 0 ? rows.length : insertIndex, 0, entry.row)
    emittedDerivedFieldIds.add(entry.fieldId)
  })

  return rows
}

export function buildFrontmatterModalDraftForAisle(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
): FrontmatterModalDraft {
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
): FrontmatterModalDraft {
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
): BuildFrontmatterDataResult {
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
      warnings.push(getInvalidComputedRowWarning(key))
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
      frontmatter[key] = row.type === 'fixedList'
        ? resolveFrontmatterFixedListValues(row.fixedListOptions, row.value)
        : coerceFrontmatterFieldValue(row.type, row.value)
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

export function buildFrontmatterMeta(
  frontmatter: FrontmatterData | null,
  options: FrontmatterSaveOptions | undefined,
): FrontmatterMeta | undefined {
  if (!options) return undefined
  const templateId = options.templateId?.trim() || null
  const templateFieldOrigins = normalizeTemplateFieldOrigins(options.templateFieldOrigins)
  const templateRemovedFieldIds = normalizeTemplateRemovedFieldIds(options.templateRemovedFieldIds)
  const computedFields = normalizeComputedFields(options.computedFields)
  if (frontmatter && templateId) {
    return {
      templateId,
      templateDerived: options.templateDerived,
      templateFieldOrigins: options.templateDerived ? templateFieldOrigins ?? {} : undefined,
      templateRemovedFieldIds: options.templateDerived ? templateRemovedFieldIds : undefined,
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

export function makeFrontmatterRowsManual(rows: FrontmatterRowDraft[]): FrontmatterRowDraft[] {
  return rows.map((row) => ({
    ...row,
    computedEnabled: row.computedEnabled ?? row.computed !== 'none',
    computedLocked: false,
    locked: false,
    type: row.type === 'fixedList' ? 'text' : row.type,
    templateFieldId: undefined,
    derived: false,
    fixedListOptions: undefined,
  }))
}

export function normalizeFrontmatterDraftRows<T extends FrontmatterModalDraft>(
  draft: T,
  rows: FrontmatterRowDraft[],
): T {
  if (!draft.selectedTemplateId || rows.some((row) => row.derived)) {
    return { ...draft, rows }
  }
  return {
    ...draft,
    selectedTemplateId: '',
    templateDerived: false,
    isTemplateSuggestionDraft: false,
    rows: makeFrontmatterRowsManual(rows),
  }
}
