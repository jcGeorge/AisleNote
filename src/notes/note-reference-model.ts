import type {
  AppState,
  InternalNoteLinkEdit,
  LinkEditRange,
  LinkInsertMode,
  ModalState,
  NoteLocation,
  NoteNavigationTarget,
  ToastTone,
} from '../types/app'
import { normalizeExternalWebUrl } from './external-links'
import { getDefaultNoteLinkLabel, getDefaultNoteReferenceTarget, getLocationInfo } from './note-locations'
import {
  buildContextToken,
  buildInternalNoteLinkToken,
  type NoteContextReferencePayload,
  wouldCreateContextCycle,
} from './note-references'
import { normalizeNoteReferenceTarget } from './note-reference-targets'

export type NoteReferenceSource = 'mention' | 'toolbar' | 'context-menu' | 'modal'
export type NoteReferenceAction = 'link' | 'preview'

export type NoteReferenceDraft = Extract<ModalState, { type: 'insert-note-reference' }> & {
  sourceKind?: NoteReferenceSource
}

export type NoteReferenceCommandResult = {
  handled: boolean
  toast?: {
    message: string
    tone?: ToastTone
  }
}

export type NoteReferenceLinkSpec =
  | {
      ok: true
      href: string
      syntax: string
      label: string
      target: NoteNavigationTarget
      noteBodyId: string
    }
  | {
      ok: false
      message: string
    }

export type NoteReferencePreviewSpec =
  | {
      ok: true
      token: string
      payload: NoteContextReferencePayload
    }
  | {
      ok: false
      message: string
    }

export function buildDefaultNoteReferenceDraft(
  appState: AppState,
  source: NoteLocation,
  mode: LinkInsertMode,
  selectedText = '',
  sourceKind: NoteReferenceSource = 'modal',
): NoteReferenceDraft {
  const target = getDefaultNoteReferenceTarget(appState, source)
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
  return {
    type: 'insert-note-reference',
    sourceKind,
    mode,
    insertAs: 'link',
    source,
    target: normalizedTarget,
    noteLabel: getDefaultNoteLinkLabel(appState, source, normalizedTarget),
    url: '',
    urlLabel: selectedText,
  }
}

export function buildExternalLinkEditDraft(
  appState: AppState,
  source: NoteLocation,
  href: string,
  label: string,
  range: LinkEditRange | null,
): NoteReferenceDraft {
  return {
    ...buildDefaultNoteReferenceDraft(appState, source, 'url', '', 'context-menu'),
    modeLocked: true,
    url: href,
    urlLabel: label,
    urlEditRange: range,
  }
}

export function buildInternalNoteLinkEditDraft(
  appState: AppState,
  source: NoteLocation,
  edit: InternalNoteLinkEdit,
): NoteReferenceDraft {
  const target = normalizeNoteReferenceTarget(appState, { ...edit.target, aisleIds: edit.aisleIds, heading: edit.heading })
  return {
    ...buildDefaultNoteReferenceDraft(appState, source, 'note', '', 'context-menu'),
    modeLocked: true,
    insertAs: 'link',
    target,
    noteLabel: edit.label,
    noteLabelTouched: true,
    internalEdit: edit,
  }
}

export function getNoteReferenceLinkSpec(
  appState: AppState,
  source: NoteLocation,
  target: NoteLocation & {
    aisleIds?: string[]
    heading?: NoteContextReferencePayload['heading']
    previewStart?: NoteContextReferencePayload['previewStart']
  },
  labelOverride = '',
): NoteReferenceLinkSpec {
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
  const syntaxTarget = {
    ...normalizedTarget,
    aisleIds: target.aisleIds && target.aisleIds.length > 0 ? normalizedTarget.aisleIds : undefined,
    heading: normalizedTarget.heading,
  }
  const targetInfo = getLocationInfo(appState, normalizedTarget)
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
    return { ok: false, message: 'choose an existing note.' }
  }
  const syntax = buildInternalNoteLinkToken(appState, syntaxTarget, labelOverride)
  if (!syntax) return { ok: false, message: 'choose an existing note.' }
  return {
    ok: true,
    href: syntax,
    syntax,
    label: labelOverride.trim() || getDefaultNoteLinkLabel(appState, source, normalizedTarget),
    target: normalizedTarget,
    noteBodyId: targetInfo.noteBodyId,
  }
}

export function getUrlReferenceLinkSpec(urlValue: string, labelValue: string): NoteReferenceCommandResult & { url?: string; label?: string } {
  const url = normalizeExternalWebUrl(urlValue)
  if (!url) {
    return { handled: false, toast: { message: 'enter a valid web link.', tone: 'warning' } }
  }
  return {
    handled: true,
    url,
    label: labelValue.trim() || urlValue.trim(),
  }
}

export function getNoteReferencePreviewSpec(
  appState: AppState,
  activeNoteBodyId: string,
  target: NoteLocation & {
    aisleIds?: string[]
    heading?: NoteContextReferencePayload['heading']
    previewStart?: NoteContextReferencePayload['previewStart']
  },
  editingTokenId = '',
): NoteReferencePreviewSpec {
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
  const syntaxTarget = {
    ...normalizedTarget,
    aisleIds:
      normalizedTarget.previewStart === 'last-position'
        ? undefined
        : target.aisleIds && target.aisleIds.length > 0 ? normalizedTarget.aisleIds : undefined,
    heading: normalizedTarget.heading,
    previewStart: normalizedTarget.heading ? undefined : normalizedTarget.previewStart,
  }
  const targetInfo = getLocationInfo(appState, normalizedTarget)
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
    return { ok: false, message: 'choose an existing note.' }
  }
  if (!activeNoteBodyId || targetInfo.noteBodyId === activeNoteBodyId) {
    return { ok: false, message: 'a note cannot preview itself.' }
  }
  if (wouldCreateContextCycle(appState, targetInfo.noteBodyId, activeNoteBodyId)) {
    return { ok: false, message: 'note preview blocked to prevent recursion.' }
  }

  const payload: NoteContextReferencePayload = {
    id: editingTokenId,
    target: {
      domainId: normalizedTarget.domainId,
      spaceId: normalizedTarget.spaceId,
      tabId: normalizedTarget.tabId,
      subTabId: normalizedTarget.subTabId,
    },
    aisleIds: syntaxTarget.aisleIds && syntaxTarget.aisleIds.length > 0 ? syntaxTarget.aisleIds : undefined,
    heading: normalizedTarget.heading,
    previewStart: syntaxTarget.previewStart,
  }
  const token = buildContextToken(appState, payload)
  if (!token) return { ok: false, message: 'choose an existing note.' }
  return {
    ok: true,
    payload: {
      ...payload,
      id: editingTokenId || token,
    },
    token,
  }
}
