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
import { buildContextToken, buildInternalNoteUrl, type NoteContextReferencePayload, wouldCreateContextCycle } from './note-references'
import { normalizeNoteReferenceTarget } from './note-reference-targets'
import { createId } from '../state/workspace'

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
  const target = normalizeNoteReferenceTarget(appState, { ...edit.target, heading: edit.heading })
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
  target: NoteLocation & { aisleIds?: string[]; heading?: NoteContextReferencePayload['heading'] },
  labelOverride = '',
): NoteReferenceLinkSpec {
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
  const targetInfo = getLocationInfo(appState, normalizedTarget)
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
    return { ok: false, message: 'choose an existing note.' }
  }
  return {
    ok: true,
    href: buildInternalNoteUrl(targetInfo.noteBodyId, normalizedTarget),
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
  target: NoteLocation & { aisleIds?: string[]; heading?: NoteContextReferencePayload['heading'] },
  id = createId(),
): NoteReferencePreviewSpec {
  const normalizedTarget = normalizeNoteReferenceTarget(appState, target)
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
    id,
    target: {
      domainId: normalizedTarget.domainId,
      spaceId: normalizedTarget.spaceId,
      tabId: normalizedTarget.tabId,
      subTabId: normalizedTarget.subTabId,
    },
    aisleIds: normalizedTarget.aisleIds && normalizedTarget.aisleIds.length > 0 ? normalizedTarget.aisleIds : undefined,
    heading: normalizedTarget.heading,
  }
  return {
    ok: true,
    payload,
    token: buildContextToken(payload),
  }
}
