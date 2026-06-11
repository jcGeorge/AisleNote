import type { AppState, NoteLocation, NoteNavigationTarget, ToastTone } from '../types/app'
import { MAX_NOTE_AISLES } from '../state/workspace'
import {
  applyCopyAsStructuralPayloadToState,
  getAisleCopyLabel,
  getCopyAsPasteSuccessMessage,
  isScratchpadCopyAsSource,
  type CopyAsClipboardPayload,
} from './copy-as-clipboard'
import { getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import {
  buildInternalNoteLinkToken,
  formatEditorMarkdownNoteReferenceHref,
  buildPreviewToken,
  getPreviewReferenceSignature,
  parsePreviewReferences,
  removeNoteReferencesForNoteLocationsFromAppState,
  resolveMarkdownNoteReferenceToken,
  type NotePreviewReferencePayload,
  wouldCreatePreviewCycle,
} from './note-references'
import { normalizeNoteReferenceTarget, type NoteReferenceTarget } from './note-reference-targets'

export type NoteReferenceCommandAction = 'link' | 'preview'

export type NoteReferenceCommandToast = {
  message: string
  tone?: ToastTone
}

export type NoteReferenceCommandResult =
  | {
      ok: true
      action: NoteReferenceCommandAction
      syntax: string
      insertText: string
      payload?: NotePreviewReferencePayload
      label?: string
      href?: string
      target: NoteNavigationTarget
      noteBodyId: string
      toast?: NoteReferenceCommandToast
    }
  | {
      ok: false
      message: string
      tone?: ToastTone
    }

export type CopyAsPasteCommandResult =
  | {
      status: 'structural'
      state: AppState
      toast: NoteReferenceCommandToast
    }
  | {
      status: 'reference'
      text: string
      toast: NoteReferenceCommandToast
    }
  | {
      status: 'blocked'
      message: string
      tone?: ToastTone
    }

export type PreviewDuplicateCheckInput = {
  appState: AppState
  payload: NotePreviewReferencePayload
  markdowns: readonly string[]
  editingTokenId?: string
}

export function buildPreviewDuplicateCheck({
  appState,
  payload,
  markdowns,
  editingTokenId,
}: PreviewDuplicateCheckInput): boolean {
  const nextSignature = getPreviewReferenceSignature(appState, payload)
  return markdowns.some((markdown) =>
    parsePreviewReferences(markdown, appState).some(
      (reference) =>
        reference.payload.id !== editingTokenId &&
        getPreviewReferenceSignature(appState, reference.payload) === nextSignature,
    ),
  )
}

function getTargetNoteBodyId(appState: AppState, target: NoteLocation): string {
  return getLocationInfo(appState, target).noteBodyId ?? ''
}

function toPreviewPayload(
  target: NoteReferenceTarget,
  editingTokenId = '',
): NotePreviewReferencePayload {
  return {
    id: editingTokenId,
    target: {
      domainId: target.domainId,
      spaceId: target.spaceId,
      tabId: target.tabId,
      subTabId: target.subTabId,
    },
    aisleIds: target.aisleIds && target.aisleIds.length > 0 ? target.aisleIds : undefined,
    heading: target.heading,
    previewStart: target.heading ? undefined : target.previewStart,
  }
}

export function buildNoteReferenceCommand({
  appState,
  source,
  target,
  action,
  activeNoteBodyId,
  labelOverride = '',
  editingTokenId = '',
  previewMarkdowns,
  insertPlacement = 'inline',
}: {
  appState: AppState
  source: NoteLocation
  target: NoteReferenceTarget
  action: NoteReferenceCommandAction
  activeNoteBodyId?: string
  labelOverride?: string
  editingTokenId?: string
  previewMarkdowns?: readonly string[]
  insertPlacement?: 'inline' | 'block'
}): NoteReferenceCommandResult {
  void source
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
  const targetInfo = getLocationInfo(appState, normalizedTarget)
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
    return { ok: false, message: 'Choose an existing note.' }
  }

  if (action === 'link') {
    const syntaxTarget = {
      ...normalizedTarget,
      aisleIds: target.aisleIds && target.aisleIds.length > 0 ? normalizedTarget.aisleIds : undefined,
      heading: normalizedTarget.heading,
      startAt: normalizedTarget.heading
        ? undefined
        : normalizedTarget.previewStart === 'last-position'
          ? 'last-position' as const
          : 'top' as const,
    }
    const syntax = buildInternalNoteLinkToken(appState, syntaxTarget, labelOverride)
    if (!syntax) return { ok: false, message: 'Choose an existing note.' }
    const resolvedSyntax = resolveMarkdownNoteReferenceToken(appState, syntax)
    return {
      ok: true,
      action,
      syntax,
      insertText: syntax,
      label: resolvedSyntax?.label || labelOverride.trim() || targetInfo.title,
      href: resolvedSyntax?.canonicalTarget
        ? formatEditorMarkdownNoteReferenceHref(resolvedSyntax.canonicalTarget)
        : undefined,
      target: {
        ...normalizedTarget,
        startAt: syntaxTarget.startAt,
      },
      noteBodyId: targetInfo.noteBodyId,
    }
  }

  if (!activeNoteBodyId || targetInfo.noteBodyId === activeNoteBodyId) {
    return { ok: false, message: 'A note cannot preview itself.' }
  }
  if (wouldCreatePreviewCycle(appState, targetInfo.noteBodyId, activeNoteBodyId)) {
    return { ok: false, message: 'Note preview blocked to prevent recursion.' }
  }

  const syntaxTarget = {
    ...normalizedTarget,
    aisleIds:
      normalizedTarget.previewStart === 'last-position'
        ? undefined
        : target.aisleIds && target.aisleIds.length > 0 ? normalizedTarget.aisleIds : undefined,
    heading: normalizedTarget.heading,
    previewStart: normalizedTarget.heading ? undefined : normalizedTarget.previewStart,
  }
  const payload = toPreviewPayload(syntaxTarget, editingTokenId)
  const defaultSyntax = buildPreviewToken(appState, payload)
  const syntax = defaultSyntax
  if (!syntax) return { ok: false, message: 'Choose an existing note.' }
  const resolvedPayload = { ...payload, id: editingTokenId || syntax }
  if (
    previewMarkdowns &&
    buildPreviewDuplicateCheck({
      appState,
      payload: resolvedPayload,
      markdowns: previewMarkdowns,
      editingTokenId,
    })
  ) {
    return { ok: false, message: 'That note preview already exists in this note.' }
  }
  return {
    ok: true,
    action,
    syntax,
    insertText: insertPlacement === 'block' ? `\n\n${syntax}\n\n` : syntax,
    payload: resolvedPayload,
    target: normalizedTarget,
    noteBodyId: targetInfo.noteBodyId,
  }
}

function getResolvedCopyAsSource(appState: AppState, payload: CopyAsClipboardPayload & { source: NoteLocation }) {
  const info = getLocationInfo(appState, payload.source)
  const body = info.noteBodyId ? appState.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
  const aisle = payload.aisleId && body ? body.aisles.find((candidate) => candidate.id === payload.aisleId) ?? null : null
  return { info, body, aisle }
}

export function buildCopyAsPasteCommand({
  appState,
  destination,
  payload,
  activeNoteBodyId = getTargetNoteBodyId(appState, destination),
  previewMarkdowns,
  maxAisles = MAX_NOTE_AISLES,
}: {
  appState: AppState
  destination: NoteLocation
  payload: CopyAsClipboardPayload
  activeNoteBodyId?: string
  previewMarkdowns?: readonly string[]
  maxAisles?: number
}): CopyAsPasteCommandResult {
  if (payload.action === 'copy' || payload.action === 'duplicate') {
    const result = applyCopyAsStructuralPayloadToState(appState, destination, payload, maxAisles)
    if (result.status !== 'applied') {
      return { status: 'blocked', message: result.message, tone: 'warning' }
    }
    return {
      status: 'structural',
      state: result.state,
      toast: { message: getCopyAsPasteSuccessMessage(payload.scope, payload.action), tone: 'success' },
    }
  }

  if (isScratchpadCopyAsSource(payload.source)) {
    return { status: 'blocked', message: 'Copied note no longer exists.', tone: 'warning' }
  }

  const livePayload = payload as CopyAsClipboardPayload & { source: NoteLocation }
  const { info, body, aisle } = getResolvedCopyAsSource(appState, livePayload)
  if (!info.domain || !info.space || !info.tab || !body) {
    return { status: 'blocked', message: 'Copied note no longer exists.', tone: 'warning' }
  }
  if (payload.scope === 'aisle' && (!payload.aisleId || !aisle)) {
    return { status: 'blocked', message: 'Copied aisle no longer exists.', tone: 'warning' }
  }
  if (payload.scope === 'note' && payload.action === 'preview' && body.aisles.length > 1) {
    return { status: 'blocked', message: 'Copy a specific aisle as preview for notes with multiple aisles.', tone: 'warning' }
  }

  const target = livePayload.scope === 'aisle' && livePayload.aisleId
    ? { ...livePayload.source, aisleIds: [livePayload.aisleId] }
    : livePayload.source
  const command = buildNoteReferenceCommand({
    appState,
    source: destination,
    target,
    action: payload.action,
    activeNoteBodyId,
    labelOverride: livePayload.action === 'link' && livePayload.scope === 'aisle' && livePayload.aisleId
      ? getAisleCopyLabel(appState, livePayload.source, livePayload.aisleId)
      : '',
    previewMarkdowns,
    insertPlacement: payload.action === 'preview' ? 'block' : 'inline',
  })
  if (!command.ok) return { status: 'blocked', message: command.message, tone: command.tone ?? 'warning' }
  return {
    status: 'reference',
    text: command.insertText,
    toast: { message: getCopyAsPasteSuccessMessage(payload.scope, payload.action), tone: 'success' },
  }
}

export function getNoteBodyPreviewMarkdowns(
  appState: AppState,
  noteBodyId: string,
  activeAisleOverride?: { aisleId: string; markdown: string },
): string[] {
  const body = appState.noteBodies.find((candidate) => candidate.id === noteBodyId) ?? null
  if (!body) return []
  return body.aisles.map((aisle) =>
    activeAisleOverride && aisle.id === activeAisleOverride.aisleId
      ? activeAisleOverride.markdown
      : getAisleMarkdown(aisle, appState.noteAisleBodies),
  )
}

export function removeNoteReferencesForDeletedLocations(
  appState: AppState,
  locations: readonly NoteLocation[],
  resolverState = appState,
): AppState {
  return removeNoteReferencesForNoteLocationsFromAppState(appState, locations, resolverState)
}
