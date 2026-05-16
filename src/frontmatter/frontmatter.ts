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
]

export function isFrontmatterComputedValueCompatibleWithFieldType(
  computed: FrontmatterComputedValue,
  type: FrontmatterFieldType,
) {
  if (computed === 'none') return true
  if (computed === 'createdAt' || computed === 'updatedAt') return type === 'date' || type === 'datetime'
  if (computed === 'noteTitle' || computed === 'spaceName' || computed === 'domainName') return type === 'text'
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

export function extractMarkdownFrontmatter(markdown: string): MarkdownFrontmatterExtraction {
  if (!FRONTMATTER_OPEN_RE.test(markdown)) {
    return { frontmatter: null, markdown }
  }

  const openMatch = markdown.match(FRONTMATTER_OPEN_RE)
  const bodyStart = openMatch?.[0].length ?? 0
  const remainder = markdown.slice(bodyStart)
  const closeMatch = remainder.match(FRONTMATTER_CLOSE_RE)
  if (!closeMatch || closeMatch.index == null) {
    return { frontmatter: null, markdown }
  }

  const rawYaml = remainder.slice(0, closeMatch.index)
  const closeStart = closeMatch.index
  const closeEnd = closeStart + closeMatch[0].length
  const parsed = parseFrontmatterYaml(rawYaml)
  if (!parsed.ok) {
    return { frontmatter: null, markdown }
  }

  return {
    frontmatter: parsed.data,
    markdown: remainder.slice(closeEnd).replace(/^\r?\n/, ''),
  }
}

export function prependMarkdownFrontmatter(markdown: string, frontmatter: FrontmatterData | null): string {
  const yaml = stringifyFrontmatterYaml(frontmatter)
  if (!yaml) return markdown
  return `---\n${yaml}\n---\n${markdown}`
}

export function coerceFrontmatterString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return stringifyYaml(value).trim()
  return String(value)
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
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
    const date = value instanceof Date ? value : new Date(coerceFrontmatterString(value))
    return Number.isNaN(date.getTime()) ? coerceFrontmatterString(value) : formatDateOnly(date)
  }
  if (type === 'datetime') {
    const date = value instanceof Date ? value : new Date(coerceFrontmatterString(value))
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
