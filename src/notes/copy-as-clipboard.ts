import type { AppState, NoteLocation } from '../types/app'
import { MAX_NOTE_AISLES } from '../state/workspace'
import { applyNoteCopyToState } from './note-copy-service'
import { buildInternalNoteLinkToken, buildContextToken } from './note-references'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'

export const COPY_AS_CLIPBOARD_MIME = 'application/x-tabs-copy-as+json'
export const COPY_AS_CLIPBOARD_TEXT_PREFIX = '{{tabs-copy-as:'
export const COPY_AS_CLIPBOARD_TEXT_SUFFIX = '}}'

export const COPY_AS_ACTIONS = ['copy', 'duplicate', 'link', 'preview'] as const
export type CopyAsAction = (typeof COPY_AS_ACTIONS)[number]
export type CopyAsScope = 'note' | 'aisle'

export type CopyAsClipboardPayload = {
  version: 1
  scope: CopyAsScope
  action: CopyAsAction
  source: NoteLocation
  aisleId?: string
}

export type CopyAsClipboardData =
  | {
      ok: true
      payload: CopyAsClipboardPayload
      text: string
      privatePayloadRequired: boolean
    }
  | {
      ok: false
      message: string
    }

export type CopyAsClipboardWriteResult =
  | { ok: true; privatePayloadWritten: boolean }
  | { ok: false; error: string }

type ClipboardLike = {
  write?: (items: ClipboardItem[]) => Promise<void>
  writeText?: (text: string) => Promise<void>
  readText?: () => Promise<string>
  read?: () => Promise<ClipboardItemLike[]>
}

type ClipboardItemLike = {
  types?: readonly string[]
  getType?: (type: string) => Promise<Blob>
}

type ClipboardItemConstructorLike = new (items: Record<string, Blob>) => ClipboardItem

function isCopyAsAction(value: unknown): value is CopyAsAction {
  return typeof value === 'string' && (COPY_AS_ACTIONS as readonly string[]).includes(value)
}

function isCopyAsScope(value: unknown): value is CopyAsScope {
  return value === 'note' || value === 'aisle'
}

function normalizeNoteLocation(value: unknown): NoteLocation | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.domainId !== 'string' ||
    typeof candidate.spaceId !== 'string' ||
    typeof candidate.tabId !== 'string' ||
    (typeof candidate.subTabId !== 'string' && candidate.subTabId !== null)
  ) {
    return null
  }
  return {
    domainId: candidate.domainId,
    spaceId: candidate.spaceId,
    tabId: candidate.tabId,
    subTabId: candidate.subTabId,
  }
}

function getGlobalClipboard(): ClipboardLike | null {
  return typeof navigator !== 'undefined' ? navigator.clipboard ?? null : null
}

function getGlobalClipboardItem(): ClipboardItemConstructorLike | null {
  return typeof ClipboardItem !== 'undefined' ? ClipboardItem : null
}

export function serializeCopyAsPayload(payload: CopyAsClipboardPayload): string {
  return JSON.stringify(payload)
}

export function serializeCopyAsTextMarker(payload: CopyAsClipboardPayload): string {
  return `${COPY_AS_CLIPBOARD_TEXT_PREFIX}${encodeURIComponent(serializeCopyAsPayload(payload))}${COPY_AS_CLIPBOARD_TEXT_SUFFIX}`
}

export function parseCopyAsPayload(value: string): CopyAsClipboardPayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.version !== 1 || !isCopyAsScope(parsed.scope) || !isCopyAsAction(parsed.action)) return null
    const source = normalizeNoteLocation(parsed.source)
    if (!source) return null
    const aisleId = typeof parsed.aisleId === 'string' && parsed.aisleId.trim() ? parsed.aisleId : undefined
    if (parsed.scope === 'aisle' && !aisleId) return null
    return {
      version: 1,
      scope: parsed.scope,
      action: parsed.action,
      source,
      ...(aisleId ? { aisleId } : {}),
    }
  } catch {
    return null
  }
}

export function isCopyAsClipboardTextMarker(value: string): boolean {
  const normalized = value.trim()
  return normalized.startsWith(COPY_AS_CLIPBOARD_TEXT_PREFIX) && normalized.endsWith(COPY_AS_CLIPBOARD_TEXT_SUFFIX)
}

export function parseCopyAsTextMarker(value: string): CopyAsClipboardPayload | null {
  const normalized = value.trim()
  if (!isCopyAsClipboardTextMarker(normalized)) return null
  const encoded = normalized.slice(COPY_AS_CLIPBOARD_TEXT_PREFIX.length, -COPY_AS_CLIPBOARD_TEXT_SUFFIX.length)
  if (!encoded) return null
  try {
    return parseCopyAsPayload(decodeURIComponent(encoded))
  } catch {
    return null
  }
}

export function readCopyAsPayloadFromDataTransfer(dataTransfer: DataTransfer | null | undefined): CopyAsClipboardPayload | null {
  const value = dataTransfer?.getData(COPY_AS_CLIPBOARD_MIME) ?? ''
  const privatePayload = value ? parseCopyAsPayload(value) : null
  if (privatePayload) return privatePayload
  const text = dataTransfer?.getData('text/plain') ?? ''
  return text ? parseCopyAsTextMarker(text) : null
}

export async function readCopyAsPayloadFromClipboard(options: { clipboard?: ClipboardLike | null } = {}): Promise<CopyAsClipboardPayload | null> {
  const clipboard = options.clipboard ?? getGlobalClipboard()
  if (!clipboard) return null
  if (clipboard.read) {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        if (!item.types?.includes(COPY_AS_CLIPBOARD_MIME) || !item.getType) continue
        const blob = await item.getType(COPY_AS_CLIPBOARD_MIME)
        const privatePayload = parseCopyAsPayload(await blob.text())
        if (privatePayload) return privatePayload
      }
    } catch {
      // Fall through to the text marker.
    }
  }
  if (clipboard.readText) {
    try {
      return parseCopyAsTextMarker(await clipboard.readText())
    } catch {
      return null
    }
  }
  return null
}

export async function writeCopyAsClipboardData(
  data: { payload: CopyAsClipboardPayload; text: string },
  options: {
    clipboard?: ClipboardLike | null
    ClipboardItemCtor?: ClipboardItemConstructorLike | null
  } = {},
): Promise<CopyAsClipboardWriteResult> {
  const clipboard = options.clipboard ?? getGlobalClipboard()
  if (!clipboard) return { ok: false, error: 'clipboard unavailable' }
  const marker = serializeCopyAsTextMarker(data.payload)

  const ClipboardItemCtor = options.ClipboardItemCtor ?? getGlobalClipboardItem()
  if (clipboard.write && ClipboardItemCtor) {
    try {
      await clipboard.write([
        new ClipboardItemCtor({
          [COPY_AS_CLIPBOARD_MIME]: new Blob([serializeCopyAsPayload(data.payload)], { type: COPY_AS_CLIPBOARD_MIME }),
          'text/plain': new Blob([marker], { type: 'text/plain' }),
        }),
      ])
      return { ok: true, privatePayloadWritten: true }
    } catch {
      // Fall through to text-only clipboard support.
    }
  }

  if (!clipboard.writeText) return { ok: false, error: 'clipboard text writes unavailable' }
  try {
    await clipboard.writeText(marker)
    return { ok: true, privatePayloadWritten: false }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'clipboard write failed' }
  }
}

export function getCopyAsSuccessMessage(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = scope === 'aisle' ? 'aisle' : 'note'
  if (action === 'duplicate') return `synced ${subject} copy copied.`
  if (action === 'link') return `${subject} link copied.`
  if (action === 'copy') return `independent ${subject} copy copied.`
  return `${subject} preview copied.`
}

export function getCopyAsPasteSuccessMessage(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = scope === 'aisle' ? 'aisle' : 'note'
  if (action === 'duplicate') return `synced ${subject} copy created.`
  if (action === 'link') return `${subject} link pasted.`
  if (action === 'copy') return `independent ${subject} copy created.`
  return `${subject} preview pasted.`
}

export function getAisleCopyLabel(appState: AppState, source: NoteLocation, aisleId: string): string {
  const info = getLocationInfo(appState, source)
  const body = info.noteBodyId ? appState.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
  const index = body?.aisles.findIndex((aisle) => aisle.id === aisleId) ?? -1
  return index >= 0 ? `aisle ${index + 1}` : 'aisle'
}

export function getCopyAsAisleIdForNoteContext(
  appState: AppState,
  source: NoteLocation,
  activeLocation: NoteLocation,
  focusedAisleId: string,
): string {
  const info = getLocationInfo(appState, source)
  const body = info.noteBodyId ? appState.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
  if (!body || body.aisles.length <= 0) return ''
  if (buildNoteLocationKey(source) === buildNoteLocationKey(activeLocation)) {
    const focused = body.aisles.find((aisle) => aisle.id === focusedAisleId)
    if (focused) return focused.id
  }
  return body.aisles[0]?.id ?? ''
}

function getResolvedCopySource(appState: AppState, source: NoteLocation, aisleId?: string) {
  const info = getLocationInfo(appState, source)
  const body = info.noteBodyId ? appState.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
  const aisle = aisleId && body ? body.aisles.find((candidate) => candidate.id === aisleId) ?? null : null
  return { info, body, aisle }
}

export function buildCopyAsClipboardData(
  appState: AppState,
  source: NoteLocation,
  scope: CopyAsScope,
  action: CopyAsAction,
  aisleId?: string,
): CopyAsClipboardData {
  const { info, body, aisle } = getResolvedCopySource(appState, source, aisleId)
  if (!info.domain || !info.space || !info.tab || !body) return { ok: false, message: 'note not found.' }
  if (scope === 'aisle' && (!aisleId || !aisle)) return { ok: false, message: 'aisle not found.' }
  if (scope === 'note' && action === 'preview' && body.aisles.length > 1) {
    return { ok: false, message: 'copy a specific aisle as preview for notes with multiple aisles.' }
  }

  const target = scope === 'aisle' && aisleId ? { ...source, aisleIds: [aisleId] } : source
  const payload: CopyAsClipboardPayload = {
    version: 1,
    scope,
    action,
    source,
    ...(scope === 'aisle' && aisleId ? { aisleId } : {}),
  }
  const marker = serializeCopyAsTextMarker(payload)

  if (action === 'link') {
    const text = buildInternalNoteLinkToken(appState, target, scope === 'aisle' && aisleId ? getAisleCopyLabel(appState, source, aisleId) : '')
    return text ? { ok: true, payload, text: marker, privatePayloadRequired: false } : { ok: false, message: 'note link could not be copied.' }
  }

  if (action === 'preview') {
    const text = buildContextToken(appState, {
      id: '',
      target: source,
      ...(scope === 'aisle' && aisleId ? { aisleIds: [aisleId] } : {}),
    })
    return text ? { ok: true, payload, text: marker, privatePayloadRequired: false } : { ok: false, message: 'note preview could not be copied.' }
  }

  return {
    ok: true,
    payload,
    text: marker,
    privatePayloadRequired: false,
  }
}

export type CopyAsReferenceTextResult =
  | { ok: true; text: string }
  | { ok: false; message: string }

export function buildCopyAsReferenceText(appState: AppState, payload: CopyAsClipboardPayload): CopyAsReferenceTextResult {
  if (payload.action !== 'link' && payload.action !== 'preview') {
    return { ok: false, message: 'clipboard item is not a reference.' }
  }

  const { info, body, aisle } = getResolvedCopySource(appState, payload.source, payload.aisleId)
  if (!info.domain || !info.space || !info.tab || !body) return { ok: false, message: 'copied note no longer exists.' }
  if (payload.scope === 'aisle' && (!payload.aisleId || !aisle)) return { ok: false, message: 'copied aisle no longer exists.' }
  if (payload.scope === 'note' && payload.action === 'preview' && body.aisles.length > 1) {
    return { ok: false, message: 'copy a specific aisle as preview for notes with multiple aisles.' }
  }

  const target = payload.scope === 'aisle' && payload.aisleId ? { ...payload.source, aisleIds: [payload.aisleId] } : payload.source
  if (payload.action === 'link') {
    const text = buildInternalNoteLinkToken(
      appState,
      target,
      payload.scope === 'aisle' && payload.aisleId ? getAisleCopyLabel(appState, payload.source, payload.aisleId) : '',
    )
    return text ? { ok: true, text } : { ok: false, message: 'note link could not be pasted.' }
  }

  const text = buildContextToken(appState, {
    id: '',
    target: payload.source,
    ...(payload.scope === 'aisle' && payload.aisleId ? { aisleIds: [payload.aisleId] } : {}),
  })
  return text ? { ok: true, text } : { ok: false, message: 'note preview could not be pasted.' }
}

export type ApplyCopyAsStructuralResult =
  | { status: 'applied'; state: AppState }
  | { status: 'missing-source'; state: AppState; message: string }
  | { status: 'missing-destination'; state: AppState; message: string }
  | { status: 'self-copy'; state: AppState; message: string }
  | { status: 'max-aisles'; state: AppState; message: string }
  | { status: 'already-linked'; state: AppState; message: string }
  | { status: 'not-structural'; state: AppState; message: string }

export function applyCopyAsStructuralPayloadToState(
  appState: AppState,
  destination: NoteLocation,
  payload: CopyAsClipboardPayload,
  maxAisles = MAX_NOTE_AISLES,
): ApplyCopyAsStructuralResult {
  if (payload.action !== 'copy' && payload.action !== 'duplicate') {
    return { status: 'not-structural', state: appState, message: 'clipboard item is not a note copy.' }
  }

  const mode = payload.action === 'duplicate' ? 'linked' : 'independent'
  const noun = payload.action === 'duplicate' ? 'synced copy' : 'independent copy'
  const sourceInfo = getLocationInfo(appState, payload.source)
  const sourceBody = sourceInfo.noteBodyId ? appState.noteBodies.find((body) => body.id === sourceInfo.noteBodyId) ?? null : null
  if (!sourceInfo.noteBodyId || !sourceBody) {
    return { status: 'missing-source', state: appState, message: 'copied note no longer exists.' }
  }

  const destinationInfo = getLocationInfo(appState, destination)
  const destinationBody = destinationInfo.noteBodyId
    ? appState.noteBodies.find((body) => body.id === destinationInfo.noteBodyId) ?? null
    : null
  if (!destinationInfo.noteBodyId || !destinationBody) {
    return { status: 'missing-destination', state: appState, message: `open a note before pasting a ${noun}.` }
  }

  if (payload.scope === 'note' && buildNoteLocationKey(payload.source) === buildNoteLocationKey(destination)) {
    return { status: 'self-copy', state: appState, message: `choose a different note to paste this ${noun}.` }
  }

  if (payload.scope === 'aisle') {
    if (!payload.aisleId || !sourceBody.aisles.some((aisle) => aisle.id === payload.aisleId)) {
      return { status: 'missing-source', state: appState, message: 'copied aisle no longer exists.' }
    }
    if (destinationBody.aisles.length >= maxAisles) {
      return { status: 'max-aisles', state: appState, message: 'maximum aisle count reached.' }
    }
    const result = applyNoteCopyToState(appState, destination, { ...payload.source, aisleIds: [payload.aisleId] }, mode, 'append')
    return result.status === 'applied'
      ? { status: 'applied', state: result.state }
      : { status: 'missing-source', state: result.state, message: `copied aisle could not be ${payload.action === 'duplicate' ? 'duplicated' : 'copied'}.` }
  }

  const result = applyNoteCopyToState(appState, destination, payload.source, mode, 'replace')
  if (result.status === 'applied') return { status: 'applied', state: result.state }
  if (result.status === 'self-copy') {
    return { status: 'self-copy', state: result.state, message: `choose a different note to paste this ${noun}.` }
  }
  if (result.status === 'already-linked') {
    return { status: 'already-linked', state: result.state, message: 'destination already links to copied note.' }
  }
  return { status: 'missing-source', state: result.state, message: `copied note could not be ${payload.action === 'duplicate' ? 'duplicated' : 'copied'}.` }
}

export type ApplyCopyAsDuplicateResult = ApplyCopyAsStructuralResult

export function applyCopyAsDuplicatePayloadToState(
  appState: AppState,
  destination: NoteLocation,
  payload: CopyAsClipboardPayload,
  maxAisles = MAX_NOTE_AISLES,
): ApplyCopyAsDuplicateResult {
  return applyCopyAsStructuralPayloadToState(appState, destination, payload, maxAisles)
}
