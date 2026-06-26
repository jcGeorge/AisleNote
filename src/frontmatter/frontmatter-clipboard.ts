import type {
  AppState,
  FrontmatterComputedValue,
  FrontmatterComputedFieldMap,
  FrontmatterData,
  FrontmatterFieldOriginMap,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  NoteLocation,
} from '../types/app'
import {
  getFrontmatterComputedValues,
  parseFrontmatterYaml,
  stringifyFrontmatterYaml,
} from './frontmatter'
import {
  buildFrontmatterDataFromRows,
  buildFrontmatterMeta,
  buildFrontmatterRowsForAisle,
} from './frontmatter-state'

export const AISLENOTE_FRONTMATTER_CLIPBOARD_MIME = 'application/x-aislenote-frontmatter'

export type FrontmatterClipboardPayload = {
  version: 1
  frontmatter: FrontmatterData | null
  saveOptions: FrontmatterSaveOptions
}

export type FrontmatterClipboardPasteResult =
  | {
      status: 'ok'
      frontmatter: FrontmatterData | null
      saveOptions: FrontmatterSaveOptions
      warnings: string[]
    }
  | {
      status: 'blocked'
      message: string
    }

type FrontmatterClipboardReadOptions = {
  allowYamlFallback?: boolean
}

type FrontmatterClipboardBuildContext = {
  selectedTemplate: FrontmatterTemplate | null
  saveOptions: FrontmatterSaveOptions
  selectedTemplateId: string
  templateDerived: boolean
  warnings: string[]
}

type DataTransferReadLike = Pick<DataTransfer, 'getData'> | null | undefined

let rememberedClipboard: { payload: FrontmatterClipboardPayload; yaml: string } | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((entry) => cloneJsonLike(entry)) as T
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneJsonLike(entry)]),
    ) as T
  }
  return value
}

function normalizeFrontmatterData(value: unknown): FrontmatterData | null {
  return isRecord(value) ? cloneJsonLike(value) : null
}

function normalizeTemplateFieldOrigins(value: unknown): FrontmatterFieldOriginMap {
  if (!isRecord(value)) return {}
  const origins: FrontmatterFieldOriginMap = {}
  Object.entries(value).forEach(([key, origin]) => {
    if (!isRecord(origin) || typeof origin.templateId !== 'string' || typeof origin.fieldId !== 'string') return
    const normalizedKey = key.trim()
    const templateId = origin.templateId.trim()
    const fieldId = origin.fieldId.trim()
    if (!normalizedKey || !templateId || !fieldId) return
    origins[normalizedKey] = { templateId, fieldId }
  })
  return origins
}

function normalizeComputedFields(value: unknown): FrontmatterComputedFieldMap | undefined {
  if (!isRecord(value)) return undefined
  const validComputedValues = new Set<FrontmatterComputedValue>(getFrontmatterComputedValues())
  const computedFields: FrontmatterComputedFieldMap = {}
  Object.entries(value).forEach(([key, computed]) => {
    const normalizedKey = key.trim()
    if (!normalizedKey || typeof computed !== 'string') return
    const computedValue = computed as FrontmatterComputedValue
    if (!validComputedValues.has(computedValue)) return
    computedFields[normalizedKey] = computedValue
  })
  return Object.keys(computedFields).length > 0 ? computedFields : undefined
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
  return list.length > 0 ? list : undefined
}

function normalizeFrontmatterSaveOptions(value: unknown): FrontmatterSaveOptions | null {
  if (!isRecord(value)) return null
  return {
    templateId: typeof value.templateId === 'string' ? value.templateId : null,
    templateDerived: Boolean(value.templateDerived),
    templateFieldOrigins: normalizeTemplateFieldOrigins(value.templateFieldOrigins),
    templateRemovedFieldIds: normalizeStringList(value.templateRemovedFieldIds),
    computedFields: normalizeComputedFields(value.computedFields),
  }
}

function normalizeSaveOptionsForFrontmatter(
  frontmatter: FrontmatterData | null,
  saveOptions: FrontmatterSaveOptions,
): FrontmatterSaveOptions {
  if (!frontmatter) {
    return {
      templateId: null,
      templateDerived: false,
      templateFieldOrigins: {},
      templateRemovedFieldIds: undefined,
      computedFields: undefined,
    }
  }
  return {
    templateId: saveOptions.templateId?.trim() || null,
    templateDerived: Boolean(saveOptions.templateId && saveOptions.templateDerived),
    templateFieldOrigins: cloneJsonLike(saveOptions.templateFieldOrigins ?? {}),
    templateRemovedFieldIds: saveOptions.templateRemovedFieldIds ? [...saveOptions.templateRemovedFieldIds] : undefined,
    computedFields: saveOptions.computedFields ? cloneJsonLike(saveOptions.computedFields) : undefined,
  }
}

function buildManualSaveOptions(computedFields?: FrontmatterComputedFieldMap): FrontmatterSaveOptions {
  return {
    templateId: null,
    templateDerived: false,
    templateFieldOrigins: {},
    computedFields,
  }
}

function getTemplateById(state: AppState, templateId: string): FrontmatterTemplate | null {
  return state.frontmatter.templates.find((template) => template.id === templateId) ?? null
}

function buildTargetContextFromClipboardPayload(
  state: AppState,
  payload: FrontmatterClipboardPayload,
): FrontmatterClipboardBuildContext {
  const templateId = payload.saveOptions.templateId?.trim() ?? ''
  const template = templateId ? getTemplateById(state, templateId) : null
  const missingTemplate = Boolean(templateId && !template)
  const selectedTemplate = missingTemplate ? null : template
  const saveOptions = missingTemplate
    ? buildManualSaveOptions(payload.saveOptions.computedFields)
    : payload.saveOptions
  return {
    selectedTemplate,
    saveOptions,
    selectedTemplateId: selectedTemplate?.id ?? '',
    templateDerived: Boolean(selectedTemplate && saveOptions.templateDerived),
    warnings: missingTemplate
      ? ['Referenced frontmatter template is unavailable; pasted rows were converted to manual frontmatter.']
      : [],
  }
}

function withTargetFrontmatter(
  state: AppState,
  aisleBodyId: string,
  frontmatter: FrontmatterData | null,
  saveOptions: FrontmatterSaveOptions,
): AppState {
  const frontmatterMeta = buildFrontmatterMeta(frontmatter, saveOptions)
  return {
    ...state,
    noteAisleBodies: (state.noteAisleBodies ?? []).map((body) =>
      body.id === aisleBodyId
        ? {
            ...body,
            frontmatter: cloneJsonLike(frontmatter),
            frontmatterStatus: frontmatter ? 'valid' as const : 'none' as const,
            frontmatterParseError: undefined,
            frontmatterRaw: frontmatter ? stringifyFrontmatterYaml(frontmatter) : undefined,
            frontmatterMeta,
          }
        : body,
    ),
  }
}

export function buildFrontmatterClipboardPayload(
  frontmatter: FrontmatterData | null,
  saveOptions: FrontmatterSaveOptions,
): FrontmatterClipboardPayload {
  return {
    version: 1,
    frontmatter: cloneJsonLike(frontmatter),
    saveOptions: normalizeSaveOptionsForFrontmatter(frontmatter, saveOptions),
  }
}

export function serializeFrontmatterClipboardPayload(payload: FrontmatterClipboardPayload): string {
  return JSON.stringify(payload)
}

export function parseFrontmatterClipboardPayload(value: string): FrontmatterClipboardPayload | null {
  try {
    const parsed = JSON.parse(value) as FrontmatterClipboardPayload
    if (parsed?.version !== 1) return null
    const saveOptions = normalizeFrontmatterSaveOptions(parsed.saveOptions)
    if (!saveOptions) return null
    if (parsed.frontmatter !== null && !isRecord(parsed.frontmatter)) return null
    const frontmatter = normalizeFrontmatterData(parsed.frontmatter)
    return buildFrontmatterClipboardPayload(frontmatter, saveOptions)
  } catch {
    return null
  }
}

export function buildFrontmatterClipboardPayloadFromYaml(yaml: string): FrontmatterClipboardPayload | null {
  if (!yaml.trim()) return null
  const parsed = parseFrontmatterYaml(yaml)
  if (!parsed.ok) return null
  return buildFrontmatterClipboardPayload(parsed.data, buildManualSaveOptions())
}

export function rememberFrontmatterClipboardPayload(
  payload: FrontmatterClipboardPayload,
  yaml = stringifyFrontmatterYaml(payload.frontmatter),
) {
  rememberedClipboard = { payload, yaml }
}

export function readRememberedFrontmatterClipboardPayload(yaml: string): FrontmatterClipboardPayload | null {
  return rememberedClipboard && rememberedClipboard.yaml === yaml ? rememberedClipboard.payload : null
}

export function readFrontmatterClipboardPayloadFromDataTransfer(
  dataTransfer: DataTransferReadLike,
  options: FrontmatterClipboardReadOptions = {},
): FrontmatterClipboardPayload | null {
  if (!dataTransfer) return null
  try {
    const structured = dataTransfer.getData(AISLENOTE_FRONTMATTER_CLIPBOARD_MIME)
    const payload = structured ? parseFrontmatterClipboardPayload(structured) : null
    if (payload) return payload
  } catch {
    // Fall through to text fallback.
  }

  try {
    const text = dataTransfer.getData('text/plain')
    return readRememberedFrontmatterClipboardPayload(text)
      ?? (options.allowYamlFallback === false ? null : buildFrontmatterClipboardPayloadFromYaml(text))
  } catch {
    return null
  }
}

export async function readFrontmatterClipboardPayloadFromNavigator(
  clipboard: Clipboard | null | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : null,
  options: FrontmatterClipboardReadOptions = {},
): Promise<FrontmatterClipboardPayload | null> {
  if (!clipboard) return null

  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        if (!item.types.includes(AISLENOTE_FRONTMATTER_CLIPBOARD_MIME)) continue
        const blob = await item.getType(AISLENOTE_FRONTMATTER_CLIPBOARD_MIME)
        const payload = parseFrontmatterClipboardPayload(await blob.text())
        if (payload) return payload
      }
    } catch {
      // Fall through to text fallback.
    }
  }

  if (typeof clipboard.readText === 'function') {
    try {
      const text = await clipboard.readText()
      return readRememberedFrontmatterClipboardPayload(text)
        ?? (options.allowYamlFallback === false ? null : buildFrontmatterClipboardPayloadFromYaml(text))
    } catch {
      return null
    }
  }

  return null
}

export async function writeFrontmatterClipboardPayload(
  payload: FrontmatterClipboardPayload,
  clipboard: Clipboard | null | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : null,
): Promise<boolean> {
  const yaml = stringifyFrontmatterYaml(payload.frontmatter)
  rememberFrontmatterClipboardPayload(payload, yaml)
  if (!clipboard) return false

  if (typeof clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          [AISLENOTE_FRONTMATTER_CLIPBOARD_MIME]: new Blob([serializeFrontmatterClipboardPayload(payload)], {
            type: AISLENOTE_FRONTMATTER_CLIPBOARD_MIME,
          }),
          'text/plain': new Blob([yaml], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch {
      // Some platforms reject custom MIME types. Text plus memory fallback still covers same-app paste.
    }
  }

  if (typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(yaml)
      return true
    } catch {
      return false
    }
  }

  return false
}

export function buildFrontmatterClipboardPasteForAisle(
  state: AppState,
  noteBodyId: string,
  aisleBodyId: string,
  location: NoteLocation,
  payload: FrontmatterClipboardPayload,
): FrontmatterClipboardPasteResult {
  const { selectedTemplate, selectedTemplateId, templateDerived, saveOptions, warnings } =
    buildTargetContextFromClipboardPayload(state, payload)
  const targetState = withTargetFrontmatter(state, aisleBodyId, payload.frontmatter, saveOptions)
  const rows = payload.frontmatter
    ? buildFrontmatterRowsForAisle(targetState, noteBodyId, aisleBodyId, location, selectedTemplate, {
        includeExisting: true,
        derived: templateDerived,
      })
    : []
  const result = buildFrontmatterDataFromRows(targetState, noteBodyId, location, rows, {
    selectedTemplateId,
    templateDerived,
    aisleBodyId,
  })
  if (!result.ok) return { status: 'blocked', message: result.message }
  if (result.warnings.length > 0) return { status: 'blocked', message: result.warnings.join('\n') }

  return {
    status: 'ok',
    frontmatter: result.frontmatter,
    saveOptions: {
      templateId: selectedTemplateId || null,
      templateDerived,
      templateFieldOrigins: result.templateFieldOrigins,
      templateRemovedFieldIds: result.templateRemovedFieldIds,
      computedFields: result.computedFields,
    },
    warnings,
  }
}
