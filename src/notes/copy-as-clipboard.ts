import type { AppState, NoteLocation } from '../types/app'
import { MAX_NOTE_AISLES } from '../state/workspace'
import { applyNoteCopyToState } from './note-copy-service'
import { buildInternalNoteLinkToken, buildContextToken } from './note-references'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'

export const COPY_AS_CLIPBOARD_MIME = 'application/x-tabs-copy-as+json'

export const COPY_AS_ACTIONS = ['duplicate', 'link', 'copy', 'preview'] as const
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

export function readCopyAsPayloadFromDataTransfer(dataTransfer: DataTransfer | null | undefined): CopyAsClipboardPayload | null {
  const value = dataTransfer?.getData(COPY_AS_CLIPBOARD_MIME) ?? ''
  return value ? parseCopyAsPayload(value) : null
}

export async function readCopyAsPayloadFromClipboard(options: { clipboard?: ClipboardLike | null } = {}): Promise<CopyAsClipboardPayload | null> {
  const clipboard = options.clipboard ?? getGlobalClipboard()
  if (!clipboard?.read) return null
  try {
    const items = await clipboard.read()
    for (const item of items) {
      if (!item.types?.includes(COPY_AS_CLIPBOARD_MIME) || !item.getType) continue
      const blob = await item.getType(COPY_AS_CLIPBOARD_MIME)
      return parseCopyAsPayload(await blob.text())
    }
  } catch {
    return null
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

  const ClipboardItemCtor = options.ClipboardItemCtor ?? getGlobalClipboardItem()
  if (clipboard.write && ClipboardItemCtor) {
    try {
      await clipboard.write([
        new ClipboardItemCtor({
          [COPY_AS_CLIPBOARD_MIME]: new Blob([serializeCopyAsPayload(data.payload)], { type: COPY_AS_CLIPBOARD_MIME }),
          'text/plain': new Blob([data.text], { type: 'text/plain' }),
        }),
      ])
      return { ok: true, privatePayloadWritten: true }
    } catch {
      // Fall through to text-only clipboard support.
    }
  }

  if (!clipboard.writeText) return { ok: false, error: 'clipboard text writes unavailable' }
  try {
    await clipboard.writeText(data.text)
    return { ok: true, privatePayloadWritten: false }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'clipboard write failed' }
  }
}

export function getCopyAsSuccessMessage(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = scope === 'aisle' ? 'aisle' : 'note'
  if (action === 'duplicate') return `${subject} duplicate copied.`
  if (action === 'link') return `${subject} link copied.`
  if (action === 'copy') return `${subject} content copied.`
  return `${subject} preview copied.`
}

export function getCopyAsPasteSuccessMessage(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = scope === 'aisle' ? 'aisle' : 'note'
  if (action === 'duplicate') return `${subject} duplicated.`
  if (action === 'link') return `${subject} link pasted.`
  if (action === 'copy') return `${subject} content pasted.`
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

function getNoteMarkdownFallback(appState: AppState, source: NoteLocation): string {
  const { body } = getResolvedCopySource(appState, source)
  if (!body) return ''
  return body.aisles
    .map((aisle) => getAisleMarkdown(aisle, appState.noteAisleBodies).trim())
    .filter(Boolean)
    .join('\n\n')
}

function getAisleMarkdownFallback(appState: AppState, source: NoteLocation, aisleId: string): string {
  const { aisle } = getResolvedCopySource(appState, source, aisleId)
  return aisle ? getAisleMarkdown(aisle, appState.noteAisleBodies) : ''
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

  if (action === 'link') {
    const text = buildInternalNoteLinkToken(appState, target, scope === 'aisle' && aisleId ? getAisleCopyLabel(appState, source, aisleId) : '')
    return text ? { ok: true, payload, text, privatePayloadRequired: false } : { ok: false, message: 'note link could not be copied.' }
  }

  if (action === 'preview') {
    const text = buildContextToken(appState, {
      id: '',
      target: source,
      ...(scope === 'aisle' && aisleId ? { aisleIds: [aisleId] } : {}),
    })
    return text ? { ok: true, payload, text, privatePayloadRequired: false } : { ok: false, message: 'note preview could not be copied.' }
  }

  return {
    ok: true,
    payload,
    text: scope === 'aisle' && aisleId ? getAisleMarkdownFallback(appState, source, aisleId) : getNoteMarkdownFallback(appState, source),
    privatePayloadRequired: action === 'duplicate',
  }
}

export type ApplyCopyAsDuplicateResult =
  | { status: 'applied'; state: AppState }
  | { status: 'missing-source'; state: AppState; message: string }
  | { status: 'missing-destination'; state: AppState; message: string }
  | { status: 'self-duplicate'; state: AppState; message: string }
  | { status: 'max-aisles'; state: AppState; message: string }
  | { status: 'not-duplicate'; state: AppState; message: string }

export function applyCopyAsDuplicatePayloadToState(
  appState: AppState,
  destination: NoteLocation,
  payload: CopyAsClipboardPayload,
  maxAisles = MAX_NOTE_AISLES,
): ApplyCopyAsDuplicateResult {
  if (payload.action !== 'duplicate') {
    return { status: 'not-duplicate', state: appState, message: 'clipboard item is not a duplicate.' }
  }

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
    return { status: 'missing-destination', state: appState, message: 'open a note before pasting a duplicate.' }
  }

  if (buildNoteLocationKey(payload.source) === buildNoteLocationKey(destination)) {
    return { status: 'self-duplicate', state: appState, message: 'choose a different note to paste this duplicate.' }
  }

  if (payload.scope === 'aisle') {
    if (!payload.aisleId || !sourceBody.aisles.some((aisle) => aisle.id === payload.aisleId)) {
      return { status: 'missing-source', state: appState, message: 'copied aisle no longer exists.' }
    }
    if (destinationBody.aisles.length >= maxAisles) {
      return { status: 'max-aisles', state: appState, message: 'maximum aisle count reached.' }
    }
    const result = applyNoteCopyToState(appState, destination, { ...payload.source, aisleIds: [payload.aisleId] }, 'independent', 'append')
    return result.status === 'applied'
      ? { status: 'applied', state: result.state }
      : { status: 'missing-source', state: result.state, message: 'copied aisle could not be duplicated.' }
  }

  const result = applyNoteCopyToState(appState, destination, payload.source, 'independent', 'replace')
  if (result.status === 'applied') return { status: 'applied', state: result.state }
  if (result.status === 'self-copy') {
    return { status: 'self-duplicate', state: result.state, message: 'choose a different note to paste this duplicate.' }
  }
  return { status: 'missing-source', state: result.state, message: 'copied note could not be duplicated.' }
}
