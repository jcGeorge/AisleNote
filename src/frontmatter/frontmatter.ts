import { parseDocument, stringify as stringifyYaml } from 'yaml'
import type {
  FrontmatterComputedValue,
  FrontmatterData,
  FrontmatterFieldType,
  FrontmatterSettings,
  FrontmatterTemplate,
  FrontmatterTemplateField,
} from '../types/app'

export type FrontmatterTemplateContext = {
  now: Date
  noteBodyId: string
  noteCreatedAt: string
  noteUpdatedAt: string
  noteTitle: string
  isLinked: boolean
  tabId: string
  subTabId: string | null
  spaceId: string
  spaceName: string
  domainId: string
  domainName: string
}

export type ParseFrontmatterYamlResult =
  | { ok: true; data: FrontmatterData | null }
  | { ok: false; message: string }

export type MarkdownFrontmatterExtraction = {
  frontmatter: FrontmatterData | null
  markdown: string
}

export type MarkdownFrontmatterSplit = {
  status: 'none' | 'valid' | 'invalid'
  frontmatter: FrontmatterData | null
  markdown: string
  rawFrontmatter: string | null
  error?: string
}

const FRONTMATTER_OPEN_RE = /^---[ \t]*(?:\r?\n|$)/
const FRONTMATTER_CLOSE_RE = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/
const DEFAULT_TEMPLATE_ID = 'basic-frontmatter'

export const FRONTMATTER_FIELD_TYPES: FrontmatterFieldType[] = ['text', 'number', 'boolean', 'date', 'datetime', 'list']
export const FRONTMATTER_COMPUTED_VALUES: FrontmatterComputedValue[] = [
  'none',
  'createdAt',
  'updatedAt',
  'noteTitle',
  'spaceName',
  'domainName',
  'isLinked',
]

export function isFrontmatterComputedValueCompatibleWithFieldType(
  computed: FrontmatterComputedValue,
  type: FrontmatterFieldType,
) {
  if (computed === 'none') return true
  if (computed === 'createdAt' || computed === 'updatedAt') return type === 'date' || type === 'datetime'
  if (computed === 'noteTitle' || computed === 'spaceName' || computed === 'domainName') return type === 'text'
  if (computed === 'isLinked') return type === 'boolean'
  return false
}

export function getFrontmatterComputedValuesForFieldType(type: FrontmatterFieldType) {
  return FRONTMATTER_COMPUTED_VALUES.filter((computed) =>
    isFrontmatterComputedValueCompatibleWithFieldType(computed, type),
  )
}

export const DEFAULT_FRONTMATTER_SETTINGS: FrontmatterSettings = {
  settingsTemplateId: '',
  lastAppliedTemplateId: '',
  templates: [
    {
      id: DEFAULT_TEMPLATE_ID,
      name: 'basic',
      fields: [
        {
          id: 'fm-field-tags',
          key: 'tags',
          type: 'list',
          defaultValue: '',
          computed: 'none',
        },
        {
          id: 'fm-field-status',
          key: 'status',
          type: 'text',
          defaultValue: '',
          computed: 'none',
        },
        {
          id: 'fm-field-created',
          key: 'created',
          type: 'date',
          defaultValue: '',
          computed: 'createdAt',
        },
        {
          id: 'fm-field-updated',
          key: 'updated',
          type: 'datetime',
          defaultValue: '',
          computed: 'updatedAt',
        },
      ],
    },
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableId(prefix: string, seed: string, index: number): string {
  const slug = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'item'}-${index + 1}`
}

export function parseFrontmatterYaml(rawYaml: string): ParseFrontmatterYamlResult {
  const trimmed = rawYaml.trim()
  if (!trimmed) return { ok: true, data: null }

  const document = parseDocument(trimmed, { prettyErrors: false })
  if (document.errors.length > 0) {
    return { ok: false, message: document.errors[0]?.message || 'frontmatter YAML is invalid.' }
  }

  const parsed = document.toJS() as unknown
  if (parsed == null) return { ok: true, data: null }
  if (!isRecord(parsed)) {
    return { ok: false, message: 'frontmatter must be a YAML mapping.' }
  }
  return { ok: true, data: parsed }
}

export function stringifyFrontmatterYaml(frontmatter: FrontmatterData | null): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return ''
  return stringifyYaml(frontmatter, {
    collectionStyle: 'block',
    lineWidth: 0,
  }).trimEnd()
}

export function splitMarkdownFrontmatter(markdown: string): MarkdownFrontmatterSplit {
  if (!FRONTMATTER_OPEN_RE.test(markdown)) {
    return {
      status: 'none',
      frontmatter: null,
      markdown,
      rawFrontmatter: null,
    }
  }

  const openMatch = markdown.match(FRONTMATTER_OPEN_RE)
  const bodyStart = openMatch?.[0].length ?? 0
  const remainder = markdown.slice(bodyStart)
  const closeMatch = remainder.match(FRONTMATTER_CLOSE_RE)
  if (!closeMatch || closeMatch.index == null) {
    return {
      status: 'invalid',
      frontmatter: null,
      markdown,
      rawFrontmatter: remainder,
      error: 'frontmatter YAML block is missing a closing delimiter.',
    }
  }

  const rawYaml = remainder.slice(0, closeMatch.index)
  const closeStart = closeMatch.index
  const closeEnd = closeStart + closeMatch[0].length
  const parsed = parseFrontmatterYaml(rawYaml)
  if (!parsed.ok) {
    return {
      status: 'invalid',
      frontmatter: null,
      markdown,
      rawFrontmatter: rawYaml,
      error: parsed.message,
    }
  }

  return {
    status: 'valid',
    frontmatter: parsed.data,
    markdown: remainder.slice(closeEnd).replace(/^\r?\n/, ''),
    rawFrontmatter: rawYaml,
  }
}

export function extractMarkdownFrontmatter(markdown: string): MarkdownFrontmatterExtraction {
  const split = splitMarkdownFrontmatter(markdown)
  return {
    frontmatter: split.status === 'valid' ? split.frontmatter : null,
    markdown: split.markdown,
  }
}

export function composeMarkdownFrontmatter(markdown: string, frontmatter: FrontmatterData | null): string {
  const yaml = stringifyFrontmatterYaml(frontmatter)
  if (!yaml) return markdown
  return `---\n${yaml}\n---\n${markdown}`
}

export const prependMarkdownFrontmatter = composeMarkdownFrontmatter

export function coerceFrontmatterString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return stringifyYaml(value).trim()
  return String(value)
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/
const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(DATE_ONLY_RE)
  if (!match) return null
  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10)
  const day = Number.parseInt(match[3] ?? '', 10)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function formatLocalDate(value: Date): string {
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`
}

function formatLocalDateTime(value: Date): string {
  return `${formatLocalDate(value)}T${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}`
}

function dateAtLocalDefaultTime(dateValue: string): Date | null {
  const parts = parseDateOnlyParts(dateValue)
  if (!parts) return null
  return new Date(parts.year, parts.month - 1, parts.day, 15, 0, 0, 0)
}

function isValidTime(hour: string, minute: string): boolean {
  const parsedHour = Number.parseInt(hour, 10)
  const parsedMinute = Number.parseInt(minute, 10)
  return parsedHour >= 0 && parsedHour <= 23 && parsedMinute >= 0 && parsedMinute <= 59
}

export function getFrontmatterDatePickerValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatLocalDate(value)
  }
  const rawValue = coerceFrontmatterString(value).trim()
  if (!rawValue) return ''
  const dateOnly = parseDateOnlyParts(rawValue)
  if (dateOnly) return rawValue
  const prefix = rawValue.match(DATE_PREFIX_RE)?.[1] ?? ''
  return prefix && parseDateOnlyParts(prefix) ? prefix : ''
}

export function getFrontmatterDatetimePickerValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatLocalDateTime(value)
  }
  const rawValue = coerceFrontmatterString(value).trim()
  if (!rawValue) return ''
  const dateOnly = parseDateOnlyParts(rawValue)
  if (dateOnly) return `${rawValue}T15:00`

  const localMatch = rawValue.match(LOCAL_DATETIME_RE)
  if (localMatch) {
    const [, dateValue, hour = '', minute = ''] = localMatch
    if (dateValue && parseDateOnlyParts(dateValue) && isValidTime(hour, minute)) {
      return `${dateValue}T${hour}:${minute}`
    }
  }

  if (!DATE_PREFIX_RE.test(rawValue)) return ''
  const date = new Date(rawValue)
  return Number.isNaN(date.getTime()) ? '' : formatLocalDateTime(date)
}

export function getFrontmatterDefaultDatetimePickerValue(value: unknown, now = new Date()): string {
  const dateValue = getFrontmatterDatePickerValue(value) || formatLocalDate(now)
  return `${dateValue}T15:00`
}

export function getFrontmatterDraftValueForType(
  type: FrontmatterFieldType,
  value: unknown,
): string {
  if (type === 'date') return getFrontmatterDatePickerValue(value)
  if (type === 'datetime') {
    const datetimeValue = getFrontmatterDatetimePickerValue(value)
    return datetimeValue || (getFrontmatterDatePickerValue(value) ? getFrontmatterDefaultDatetimePickerValue(value) : '')
  }
  return coerceFrontmatterString(value)
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const normalized = coerceFrontmatterString(value).trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => coerceFrontmatterString(entry).trim()).filter(Boolean)
  }
  return coerceFrontmatterString(value)
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isCompatibleValue(type: FrontmatterFieldType, value: unknown): boolean {
  if (value == null || value === '') return false
  if (type === 'text' || type === 'date' || type === 'datetime') return typeof value === 'string' || value instanceof Date
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'list') return Array.isArray(value)
  return false
}

export function isFrontmatterReferenceComputedValue(computed: FrontmatterComputedValue) {
  return computed === 'noteTitle' || computed === 'spaceName' || computed === 'domainName'
}

function getComputedValue(computed: FrontmatterComputedValue, context: FrontmatterTemplateContext): unknown {
  if (computed === 'createdAt') return context.noteCreatedAt
  if (computed === 'updatedAt') return context.noteUpdatedAt
  if (computed === 'noteTitle') return { id: context.noteBodyId, title: context.noteTitle }
  if (computed === 'spaceName') return { id: context.spaceId, name: context.spaceName }
  if (computed === 'domainName') return { id: context.domainId, name: context.domainName }
  if (computed === 'isLinked') return context.isLinked
  return undefined
}

export function coerceFrontmatterFieldValue(type: FrontmatterFieldType, value: unknown): unknown {
  if (type === 'text') return coerceFrontmatterString(value)
  if (type === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(coerceFrontmatterString(value))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'boolean') return parseBoolean(value)
  if (type === 'date') {
    if (value == null) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? coerceFrontmatterString(value) : formatLocalDate(value)
    const rawValue = coerceFrontmatterString(value).trim()
    if (!rawValue) return null
    const pickerValue = getFrontmatterDatePickerValue(rawValue)
    return pickerValue || coerceFrontmatterString(value)
  }
  if (type === 'datetime') {
    if (value == null) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? coerceFrontmatterString(value) : value.toISOString()
    const rawValue = coerceFrontmatterString(value).trim()
    if (!rawValue) return null
    const dateOnlyDefault = dateAtLocalDefaultTime(rawValue)
    if (dateOnlyDefault) return dateOnlyDefault.toISOString()
    const localMatch = rawValue.match(LOCAL_DATETIME_RE)
    const localValue = localMatch ? getFrontmatterDatetimePickerValue(rawValue) : ''
    const date = localValue ? new Date(localValue) : new Date(rawValue)
    return Number.isNaN(date.getTime()) ? coerceFrontmatterString(value) : date.toISOString()
  }
  if (type === 'list') return parseList(value)
  return value
}

export function formatFrontmatterFieldValue(type: FrontmatterFieldType, value: unknown): string {
  if (type === 'boolean') return parseBoolean(value) ? 'true' : 'false'
  return coerceFrontmatterString(value)
}

function resolveFieldValue(
  field: FrontmatterTemplateField,
  existing: FrontmatterData,
  context: FrontmatterTemplateContext,
): unknown {
  const currentValue = existing[field.key]
  const computedValue = getComputedValue(field.computed, context)
  if (computedValue !== undefined) {
    return isFrontmatterReferenceComputedValue(field.computed) ? computedValue : coerceFrontmatterFieldValue(field.type, computedValue)
  }
  if (isCompatibleValue(field.type, currentValue)) return coerceFrontmatterFieldValue(field.type, currentValue)
  return coerceFrontmatterFieldValue(field.type, field.defaultValue)
}

export function resolveFrontmatterTemplateFieldValue(
  field: FrontmatterTemplateField,
  existing: FrontmatterData | null,
  context: FrontmatterTemplateContext,
): unknown {
  return resolveFieldValue(field, existing ?? {}, context)
}

export function applyFrontmatterTemplate(
  existing: FrontmatterData | null,
  template: FrontmatterTemplate,
  context: FrontmatterTemplateContext,
): FrontmatterData {
  const source = existing ?? {}
  const next: FrontmatterData = {}

  for (const field of template.fields) {
    const key = field.key.trim()
    if (!key) continue
    next[key] = resolveFieldValue(field, source, context)
  }

  return next
}

function normalizeField(raw: unknown, index: number): FrontmatterTemplateField | null {
  if (!isRecord(raw)) return null
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  if (!key) return null
  const type = FRONTMATTER_FIELD_TYPES.includes(raw.type as FrontmatterFieldType)
    ? (raw.type as FrontmatterFieldType)
    : 'text'
  const computed = FRONTMATTER_COMPUTED_VALUES.includes(raw.computed as FrontmatterComputedValue)
    ? (raw.computed as FrontmatterComputedValue)
    : 'none'
  const normalizedComputed = isFrontmatterComputedValueCompatibleWithFieldType(computed, type) ? computed : 'none'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : stableId('fm-field', key, index),
    key,
    type,
    defaultValue: typeof raw.defaultValue === 'string' ? raw.defaultValue : coerceFrontmatterString(raw.defaultValue),
    computed: normalizedComputed,
  }
}

function normalizeTemplate(raw: unknown, index: number): FrontmatterTemplate | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `template ${index + 1}`
  const fields = Array.isArray(raw.fields) ? raw.fields.map(normalizeField).filter((field): field is FrontmatterTemplateField => Boolean(field)) : []
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : stableId('fm-template', name, index),
    name,
    fields,
  }
}

export function normalizeFrontmatterData(raw: unknown): FrontmatterData | null {
  if (!isRecord(raw)) return null
  return { ...raw }
}

export function normalizeFrontmatterSettings(raw: unknown): FrontmatterSettings {
  if (!isRecord(raw)) return DEFAULT_FRONTMATTER_SETTINGS
  const templates = Array.isArray(raw.templates)
    ? raw.templates.map(normalizeTemplate).filter((template): template is FrontmatterTemplate => Boolean(template))
    : []
  const normalizedTemplates = templates.length > 0 ? templates : DEFAULT_FRONTMATTER_SETTINGS.templates
  const normalizeTemplateId = (value: unknown) =>
    typeof value === 'string' && normalizedTemplates.some((template) => template.id === value) ? value : ''
  const settingsTemplateId = normalizeTemplateId(raw.settingsTemplateId ?? raw.activeTemplateId)
  const lastAppliedTemplateId = normalizeTemplateId(raw.lastAppliedTemplateId)
  return {
    templates: normalizedTemplates,
    settingsTemplateId,
    lastAppliedTemplateId,
  }
}
