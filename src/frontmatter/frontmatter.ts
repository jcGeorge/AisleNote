import { parseDocument, stringify as stringifyYaml } from 'yaml'
import type {
  FrontmatterApplyMode,
  FrontmatterComputedValue,
  FrontmatterData,
  FrontmatterFieldType,
  FrontmatterSettings,
  FrontmatterTemplate,
  FrontmatterTemplateField,
} from '../types/app'

export type FrontmatterTemplateContext = {
  now: Date
  noteTitle: string
  spaceName: string
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

export const DEFAULT_FRONTMATTER_SETTINGS: FrontmatterSettings = {
  activeTemplateId: DEFAULT_TEMPLATE_ID,
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

function coerceString(value: unknown): string {
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
  const normalized = coerceString(value).trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => coerceString(entry).trim()).filter(Boolean)
  }
  return coerceString(value)
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

function getComputedValue(computed: FrontmatterComputedValue, context: FrontmatterTemplateContext): unknown {
  if (computed === 'createdAt') return formatDateOnly(context.now)
  if (computed === 'updatedAt') return context.now.toISOString()
  if (computed === 'noteTitle') return context.noteTitle
  if (computed === 'spaceName') return context.spaceName
  if (computed === 'domainName') return context.domainName
  return undefined
}

function coerceFieldValue(type: FrontmatterFieldType, value: unknown): unknown {
  if (type === 'text') return coerceString(value)
  if (type === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(coerceString(value))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'boolean') return parseBoolean(value)
  if (type === 'date') {
    const date = value instanceof Date ? value : new Date(coerceString(value))
    return Number.isNaN(date.getTime()) ? coerceString(value) : formatDateOnly(date)
  }
  if (type === 'datetime') {
    const date = value instanceof Date ? value : new Date(coerceString(value))
    return Number.isNaN(date.getTime()) ? coerceString(value) : date.toISOString()
  }
  if (type === 'list') return parseList(value)
  return value
}

function resolveFieldValue(
  field: FrontmatterTemplateField,
  existing: FrontmatterData,
  context: FrontmatterTemplateContext,
): unknown {
  const currentValue = existing[field.key]
  if (field.computed === 'createdAt' && isCompatibleValue(field.type, currentValue)) {
    return coerceFieldValue(field.type, currentValue)
  }

  const computedValue = getComputedValue(field.computed, context)
  if (computedValue !== undefined) return coerceFieldValue(field.type, computedValue)
  if (isCompatibleValue(field.type, currentValue)) return coerceFieldValue(field.type, currentValue)
  return coerceFieldValue(field.type, field.defaultValue)
}

export function applyFrontmatterTemplate(
  existing: FrontmatterData | null,
  template: FrontmatterTemplate,
  context: FrontmatterTemplateContext,
  mode: FrontmatterApplyMode = 'merge',
): FrontmatterData {
  const source = existing ?? {}
  const next: FrontmatterData = mode === 'replace' ? {} : { ...source }

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
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : stableId('fm-field', key, index),
    key,
    type,
    defaultValue: typeof raw.defaultValue === 'string' ? raw.defaultValue : coerceString(raw.defaultValue),
    computed,
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
  const activeTemplateId =
    typeof raw.activeTemplateId === 'string' && normalizedTemplates.some((template) => template.id === raw.activeTemplateId)
      ? raw.activeTemplateId
      : normalizedTemplates[0].id
  return {
    templates: normalizedTemplates,
    activeTemplateId,
  }
}
