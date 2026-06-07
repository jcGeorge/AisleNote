import type {
  AppState,
  InternalNoteLinkEdit,
  LinkEditRange,
  LinkInsertMode,
  ModalState,
  NoteLocation,
  NotePreviewEdit,
  NoteNavigationTarget,
  ToastTone,
} from '../types/app'
import { normalizeExternalWebUrl } from './external-links'
import { getDefaultNoteReferenceTarget, getLocationInfo } from './note-locations'
import type { NotePreviewReferencePayload } from './note-references'
import { buildNoteReferenceCommand, type NoteReferenceCommandAction } from './note-reference-commands'
import { normalizeNoteReferenceTarget } from './note-reference-targets'

export type NoteReferenceSource = 'mention' | 'toolbar' | 'context-menu' | 'modal'
export type NoteReferenceAction = NoteReferenceCommandAction

export type NoteReferenceDraft = Extract<ModalState, { type: 'insert-note-reference' }> & {
  sourceKind?: NoteReferenceSource
}

export type NoteReferenceEditorCommandResult = {
  handled: boolean
  toast?: {
    message: string
    tone?: ToastTone
  }
}

export function getDefaultMarkdownNoteReferenceLabel(appState: AppState, target: NoteLocation): string {
  return getLocationInfo(appState, target).title || 'note'
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
      payload: NotePreviewReferencePayload
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
    noteLabel: getDefaultMarkdownNoteReferenceLabel(appState, normalizedTarget),
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

export function buildUrlLinkShortcutDraft(
  appState: AppState,
  source: NoteLocation,
  selectedText = '',
  sourceKind: NoteReferenceSource = 'modal',
): NoteReferenceDraft {
  const trimmedSelection = selectedText.trim()
  const selectedUrl = normalizeExternalWebUrl(trimmedSelection)
  return {
    ...buildDefaultNoteReferenceDraft(appState, source, 'url', '', sourceKind),
    url: selectedUrl ? trimmedSelection : '',
    urlLabel: selectedUrl ? '' : trimmedSelection,
    urlInitialFocus: selectedUrl ? 'label' : 'url',
  }
}

export function buildInternalNoteLinkEditDraft(
  appState: AppState,
  source: NoteLocation,
  edit: InternalNoteLinkEdit & { previewEdit?: NotePreviewEdit | null },
): NoteReferenceDraft {
  const previewEdit = edit.previewEdit ?? null
  const target = normalizeNoteReferenceTarget(appState, {
    ...(previewEdit?.target ?? edit.target),
    aisleIds: previewEdit?.aisleIds ?? edit.aisleIds,
    heading: previewEdit?.heading ?? edit.heading,
    previewStart: previewEdit?.previewStart ?? (edit.startAt === 'last-position' ? 'last-position' : undefined),
  })
  return {
    ...buildDefaultNoteReferenceDraft(appState, source, 'note', '', 'context-menu'),
    modeLocked: true,
    insertAs: previewEdit ? 'preview' : 'link',
    target,
    noteLabel: previewEdit?.label || edit.label,
    noteLabelTouched: true,
    internalEdit: previewEdit ? null : edit,
    previewEdit,
    editingTokenId: previewEdit?.tokenId,
  }
}

export function getNoteReferenceLinkSpec(
  appState: AppState,
  source: NoteLocation,
  target: NoteLocation & {
    aisleIds?: string[]
    heading?: NotePreviewReferencePayload['heading']
    previewStart?: NotePreviewReferencePayload['previewStart']
  },
  labelOverride = '',
): NoteReferenceLinkSpec {
  const command = buildNoteReferenceCommand({
    appState,
    source,
    target,
    action: 'link',
    labelOverride,
  })
  if (!command.ok) return { ok: false, message: command.message }
  return {
    ok: true,
    href: command.href ?? command.syntax,
    syntax: command.syntax,
    label: command.label ?? '',
    target: command.target,
    noteBodyId: command.noteBodyId,
  }
}

export function getUrlReferenceLinkSpec(urlValue: string, labelValue: string): NoteReferenceEditorCommandResult & { url?: string; label?: string } {
  const url = normalizeExternalWebUrl(urlValue)
  if (!url) {
    return { handled: false, toast: { message: 'Enter a valid web link.', tone: 'warning' } }
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
    heading?: NotePreviewReferencePayload['heading']
    previewStart?: NotePreviewReferencePayload['previewStart']
  },
  editingTokenId = '',
): NoteReferencePreviewSpec {
  const command = buildNoteReferenceCommand({
    appState,
    source: target,
    target,
    action: 'preview',
    activeNoteBodyId,
    editingTokenId,
  })
  if (!command.ok) return { ok: false, message: command.message }
  if (!command.payload) return { ok: false, message: 'Choose an existing note.' }
  return {
    ok: true,
    payload: command.payload,
    token: command.syntax,
  }
}
