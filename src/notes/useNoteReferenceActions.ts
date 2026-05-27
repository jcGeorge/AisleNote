import { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  createLinkMark,
  getExternalLinkRangeAtDocPosition,
  type ExternalLinkRange,
  getInternalNoteLinkHitAtDocPosition,
} from '../editor/prosemirror-utils'
import {
  dispatchEditorTransaction,
  insertEditorTextOperation,
  replaceEditorMarkdownOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from '../editor/editor-operation-runner'
import type { AppState, ContextMenuState, ModalState, NoteLocation, NoteNavigationTarget, ToastTone } from '../types/app'
import {
  buildInternalNoteLinkToken,
  getContextReferenceSignature,
  type NoteContextReferencePayload,
  parseContextReferences,
  parseContextToken,
  removeContextTokenById,
  replaceContextTokenById,
  replaceInternalNoteLinkByOccurrence,
  resolveWikiReferenceToken,
} from './note-references'
import { getAisleMarkdown } from './note-markdown'
import { normalizeNoteReferenceTarget } from './note-reference-targets'
import {
  buildDefaultNoteReferenceDraft,
  getNoteReferenceLinkSpec,
  getNoteReferencePreviewSpec,
  getUrlReferenceLinkSpec,
  type NoteReferenceAction,
  type NoteReferenceCommandResult,
} from './note-reference-model'
import { getContextPreviewDataFromState } from './note-preview-data'

type UseNoteReferenceActionsParams = {
  stateRef: MutableRefObject<AppState>
  contextMenu: ContextMenuState | null
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setModal: Dispatch<SetStateAction<ModalState | null>>
  editorRef: MutableRefObject<Editor | null>
  activeNoteBodyId: string
  activeAisleIdRef: MutableRefObject<string>
  getCurrentNoteLocation: () => NoteLocation
  getActiveEditorMarkdown: () => string
  replaceActiveEditorMarkdown: (markdown: string) => void
  commitActiveEditorMarkdownNow: (editor: Editor) => string
  saveActiveCursorBeforeNavigation: () => void
  navigateToNoteLocation: (location: NoteNavigationTarget) => void
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

export const useNoteReferenceActions = ({
  stateRef,
  contextMenu,
  setContextMenu,
  setModal,
  editorRef,
  activeNoteBodyId,
  activeAisleIdRef,
  getCurrentNoteLocation,
  getActiveEditorMarkdown,
  replaceActiveEditorMarkdown,
  commitActiveEditorMarkdownNow,
  saveActiveCursorBeforeNavigation,
  navigateToNoteLocation,
  pushToast,
}: UseNoteReferenceActionsParams) => {
  const editorOperationRuntime: EditorOperationRuntime = {
    editorRef,
    commitActiveEditorMarkdownNow,
    replaceActiveEditorMarkdown,
    pushToast,
  }

  const getContextPreviewData = (payload: Parameters<typeof getContextPreviewDataFromState>[1], sourceNoteBodyId: string) =>
    getContextPreviewDataFromState(stateRef.current, payload, sourceNoteBodyId)

  const insertLinkIntoActiveEditor = (label: string, url: string) => {
    return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl: url, linkText: label }).handled
  }

  const replaceLinkRangeInActiveEditor = (range: ExternalLinkRange, label: string, url: string) => {
    return dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
      const linkType = view.state.schema.marks.link
      if (!linkType) return false

      const currentRange =
        getExternalLinkRangeAtDocPosition(view.state.doc, range.from, range.href) ??
        getExternalLinkRangeAtDocPosition(view.state.doc, range.to, range.href) ??
        range
      const nextLabel = label.trim() || url
      let tr = view.state.tr.removeMark(currentRange.from, currentRange.to, linkType)
      tr = tr.insertText(nextLabel, currentRange.from, currentRange.to)
      return tr.addMark(currentRange.from, currentRange.from + nextLabel.length, createLinkMark(linkType, url))
    }).handled
  }

  const replaceTextRangeInActiveEditor = (from: number, to: number, text: string) => {
    return dispatchEditorTransaction(editorOperationRuntime, ({ view }) => view.state.tr.insertText(text, from, to)).handled
  }

  const replaceTextRangeWithLinkInActiveEditor = (from: number, to: number, label: string, url: string) => {
    return dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
      const linkType = view.state.schema.marks.link
      if (!linkType) return false

      const nextLabel = label.trim() || url
      const tr = view.state.tr.insertText(nextLabel, from, to)
      return tr.addMark(from, from + nextLabel.length, createLinkMark(linkType, url))
    }).handled
  }

  const insertTextIntoActiveEditor = (text: string) => {
    return insertEditorTextOperation(editorOperationRuntime, text).handled
  }

  const hasDuplicateContextPreview = (
    payload: NoteContextReferencePayload,
    editingTokenId?: string,
  ) => {
    const latestState = stateRef.current
    const markdown = getActiveEditorMarkdown()
    const activeBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null
    const noteMarkdowns = activeBody
      ? activeBody.aisles.map((aisle) =>
          aisle.id === activeAisleIdRef.current ? markdown : getAisleMarkdown(aisle, latestState.noteAisleBodies),
        )
      : [markdown]
    const nextSignature = getContextReferenceSignature(latestState, payload)
    return Boolean(
      noteMarkdowns.flatMap((noteMarkdown) => parseContextReferences(noteMarkdown, latestState)).find(
        (reference) =>
          reference.payload.id !== editingTokenId &&
          getContextReferenceSignature(latestState, reference.payload) === nextSignature,
      ),
    )
  }

  const insertNoteReferenceFromMention = ({
    target,
    action,
    from,
    to,
  }: {
    target: NoteNavigationTarget
    action: NoteReferenceAction
    from: number
    to: number
  }): NoteReferenceCommandResult => {
    const latestState = stateRef.current
    if (action === 'link') {
      const linkSpec = getNoteReferenceLinkSpec(latestState, getCurrentNoteLocation(), target)
      if (!linkSpec.ok) {
        pushToast(linkSpec.message, 'warning')
        return { handled: false, toast: { message: linkSpec.message, tone: 'warning' } }
      }
      if (!replaceTextRangeInActiveEditor(from, to, linkSpec.syntax)) {
        const message = 'open a note before inserting a note link.'
        pushToast(message, 'warning')
        return { handled: false, toast: { message, tone: 'warning' } }
      }
      return { handled: true }
    }

    const previewSpec = getNoteReferencePreviewSpec(latestState, activeNoteBodyId, target)
    if (!previewSpec.ok) {
      pushToast(previewSpec.message, 'warning')
      return { handled: false, toast: { message: previewSpec.message, tone: 'warning' } }
    }
    if (hasDuplicateContextPreview(previewSpec.payload)) {
      const message = 'that note preview already exists in this note.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' } }
    }
    if (!replaceTextRangeInActiveEditor(from, to, previewSpec.token)) {
      const message = 'open a note before inserting a note preview.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' } }
    }
    return { handled: true }
  }

  const insertNoteReference = (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => {
    const latestState = stateRef.current
    const target = modalState.mode === 'note' ? normalizeNoteReferenceTarget(latestState, modalState.target) : modalState.target
    if (modalState.mode === 'url') {
      const urlSpec = getUrlReferenceLinkSpec(modalState.url, modalState.urlLabel)
      if (!urlSpec.handled || !urlSpec.url || !urlSpec.label) {
        if (urlSpec.toast) pushToast(urlSpec.toast.message, urlSpec.toast.tone)
        return false
      }
      if (modalState.urlEditRange) {
        if (!replaceLinkRangeInActiveEditor(modalState.urlEditRange, urlSpec.label, urlSpec.url)) {
          pushToast('could not update link.', 'warning')
          return false
        }
        pushToast('link updated.', 'success')
        return true
      }
      if (!insertLinkIntoActiveEditor(urlSpec.label, urlSpec.url)) {
        pushToast('open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('link inserted.', 'success')
      return true
    }

    if (modalState.insertAs === 'link') {
      const requestedLabel = modalState.noteLabelTouched || modalState.internalEdit ? modalState.noteLabel : ''
      const linkSpec = getNoteReferenceLinkSpec(latestState, modalState.source, target, requestedLabel)
      if (!linkSpec.ok) {
        pushToast(linkSpec.message, 'warning')
        return false
      }
      const href = linkSpec.href
      const previousHref = modalState.internalEdit?.href ?? href
      const internalEdit = modalState.internalEdit
      if (internalEdit) {
        const nextSyntax = linkSpec.syntax
        const editFrom = internalEdit.from
        const editTo = internalEdit.to
        if (typeof editFrom === 'number' && typeof editTo === 'number') {
          const updated = dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
            const currentHit = getInternalNoteLinkHitAtDocPosition(
              view.state.doc,
              editFrom,
              (token) => resolveWikiReferenceToken(stateRef.current, token),
            )
            const from = currentHit?.href === previousHref ? currentHit.from : editFrom
            const to = currentHit?.href === previousHref ? currentHit.to : editTo
            return view.state.tr.insertText(nextSyntax, from, to)
          }).handled
          if (updated) {
            pushToast('note link updated.', 'success')
            return true
          }
        }
        replaceEditorMarkdownOperation(
          editorOperationRuntime,
          replaceInternalNoteLinkByOccurrence(
            getActiveEditorMarkdown(),
            {
              label: internalEdit.label,
              href: previousHref,
              target: internalEdit.target,
              aisleIds: internalEdit.aisleIds,
              heading: internalEdit.heading,
              startAt: internalEdit.startAt,
              from: internalEdit.from ?? 0,
              to: internalEdit.to ?? 0,
              occurrence: internalEdit.occurrence ?? 0,
            },
            nextSyntax,
          ),
        )
        pushToast('note link updated.', 'success')
        return true
      }
      if (!insertTextIntoActiveEditor(linkSpec.syntax)) {
        pushToast('open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('note link inserted.', 'success')
      return true
    }

    const previewSpec = getNoteReferencePreviewSpec(latestState, activeNoteBodyId, target, modalState.editingTokenId)
    if (!previewSpec.ok) {
      pushToast(previewSpec.message, 'warning')
      return false
    }

    const markdown = getActiveEditorMarkdown()
    if (hasDuplicateContextPreview(previewSpec.payload, modalState.editingTokenId)) {
      pushToast('that note preview already exists in this note.', 'warning')
      return false
    }

    if (modalState.editingTokenId) {
      replaceEditorMarkdownOperation(
        editorOperationRuntime,
        replaceContextTokenById(markdown, latestState, modalState.editingTokenId, previewSpec.token),
      )
      pushToast('note preview settings updated.', 'success')
      return true
    }

    if (!insertTextIntoActiveEditor(`\n\n${previewSpec.token}\n\n`)) {
      pushToast('open a note before inserting a note preview.', 'warning')
      return false
    }
    pushToast('note preview inserted.', 'success')
    return true
  }

  const deleteContextPreview = (tokenId: string) => {
    const markdown = getActiveEditorMarkdown()
    const nextMarkdown = removeContextTokenById(markdown, stateRef.current, tokenId)
    if (nextMarkdown === markdown) {
      pushToast('note preview not found.', 'warning')
      return
    }
    replaceEditorMarkdownOperation(editorOperationRuntime, nextMarkdown)
    pushToast('note preview deleted.', 'success')
  }

  const openNoteReferenceModal = () => {
    saveActiveCursorBeforeNavigation()
    const source = getCurrentNoteLocation()
    setModal(buildDefaultNoteReferenceDraft(stateRef.current, source, stateRef.current.ui.lastLinkInsertMode ?? 'note', '', 'toolbar'))
  }

  const openInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const target = {
      ...contextMenu.target,
      heading: contextMenu.heading,
      aisleId: contextMenu.heading ? undefined : contextMenu.aisleIds?.[0],
      startAt: contextMenu.startAt,
    }
    setContextMenu(null)
    navigateToNoteLocation(target)
  }

  const renameInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const linkContext = contextMenu
    const nextLabel = window.prompt('link name', linkContext.label)?.trim()
    if (!nextLabel || nextLabel === linkContext.label) {
      setContextMenu(null)
      return
    }

    const nextSyntax = buildInternalNoteLinkToken(
      stateRef.current,
      {
        ...linkContext.target,
        aisleIds: linkContext.aisleIds,
        heading: linkContext.heading,
        startAt: linkContext.startAt,
      },
      nextLabel,
    )
    const updated = dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
      const currentHit = getInternalNoteLinkHitAtDocPosition(
        view.state.doc,
        linkContext.from,
        (token) => resolveWikiReferenceToken(stateRef.current, token),
      )
      const from = currentHit?.href === linkContext.href ? currentHit.from : linkContext.from
      const to = currentHit?.href === linkContext.href ? currentHit.to : linkContext.to
      return view.state.tr.insertText(nextSyntax, from, to)
    }).handled
    if (updated) {
      setContextMenu(null)
      return
    }

    replaceEditorMarkdownOperation(
      editorOperationRuntime,
      replaceInternalNoteLinkByOccurrence(getActiveEditorMarkdown(), linkContext, nextSyntax),
    )
    setContextMenu(null)
  }

  return {
    getContextPreviewData,
    insertLinkIntoActiveEditor,
    replaceLinkRangeInActiveEditor,
    replaceTextRangeInActiveEditor,
    replaceTextRangeWithLinkInActiveEditor,
    insertNoteReferenceFromMention,
    insertNoteReference,
    deleteContextPreview,
    resolveContextPreviewToken: (token: string) => parseContextToken(token, stateRef.current),
    resolveInternalNoteReferenceToken: (token: string) => resolveWikiReferenceToken(stateRef.current, token),
    openNoteReferenceModal,
    openInternalNoteLinkFromContext,
    renameInternalNoteLinkFromContext,
  }
}
