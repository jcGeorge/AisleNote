import type { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  createLinkMark,
  getExternalLinkRangeAtDocPosition,
  type ExternalLinkRange,
} from '../editor/prosemirror-utils'
import {
  dispatchEditorTransaction,
  insertEditorTextOperation,
  replaceEditorMarkdownOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from '../editor/editor-operation-runner'
import type {
  AppState,
  ContextMenuState,
  ModalState,
  NoteLocation,
  NoteNavigationTarget,
  NotePreviewEdit,
  ToastTone,
} from '../types/app'
import {
  buildPreviewToken,
  parsePreviewToken,
  removePreviewTokenById,
  removePreviewTokenByPayload,
  replacePreviewTokenByPayload,
  replacePreviewTokenById,
  replaceInternalNoteLinkByOccurrence,
  resolveMarkdownNoteReferenceToken,
  type NotePreviewDeleteRequest,
  type NotePreviewReferencePayload,
} from './note-references'
import { normalizeNoteReferenceTarget } from './note-reference-targets'
import {
  buildDefaultNoteReferenceDraft,
  getUrlReferenceLinkSpec,
  type NoteReferenceAction,
  type NoteReferenceEditorCommandResult,
} from './note-reference-model'
import { buildNoteReferenceCommand, getNoteBodyPreviewMarkdowns } from './note-reference-commands'
import { getNotePreviewDataFromState } from './note-preview-data'

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

  const getNotePreviewData = (payload: Parameters<typeof getNotePreviewDataFromState>[1], sourceNoteBodyId: string) =>
    getNotePreviewDataFromState(stateRef.current, payload, sourceNoteBodyId)

  const insertLinkIntoActiveEditor = (label: string, url: string) => {
    const directInsert = dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
      const linkType = view.state.schema.marks.link
      if (!linkType) return false
      const selection = view.state.selection
      const from = selection?.from
      const to = selection?.to
      if (typeof from !== 'number' || typeof to !== 'number') return false
      const nextLabel = label.trim() || url
      const tr = view.state.tr.insertText(nextLabel, from, to)
      return tr.addMark(from, from + nextLabel.length, createLinkMark(linkType, url))
    }).handled
    return directInsert || runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl: url, linkText: label }).handled
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

  const replacePreviewEditWithText = (previewEdit: NotePreviewEdit, text: string): boolean => {
    const range = previewEdit.sourceRange
    if (range && replaceTextRangeInActiveEditor(range.from, range.to, text)) return true

    const markdown = getActiveEditorMarkdown()
    const payload = {
      id: previewEdit.tokenId ?? '',
      target: previewEdit.target,
      aisleIds: previewEdit.aisleIds,
      heading: previewEdit.heading,
      previewStart: previewEdit.previewStart,
    }
    const nextMarkdown = payload.id
      ? replacePreviewTokenById(markdown, stateRef.current, payload.id, text)
      : replacePreviewTokenByPayload(markdown, stateRef.current, payload, text)
    const fallbackMarkdown =
      nextMarkdown === markdown
        ? replacePreviewTokenByPayload(markdown, stateRef.current, payload, text)
        : nextMarkdown
    if (fallbackMarkdown === markdown) return false
    replaceEditorMarkdownOperation(editorOperationRuntime, fallbackMarkdown)
    return true
  }

  const replacePreviewEditWithLink = (
    previewEdit: NotePreviewEdit,
    label: string,
    href: string,
    fallbackSyntax: string,
  ): boolean => {
    const range = previewEdit.sourceRange
    if (range && replaceTextRangeWithLinkInActiveEditor(range.from, range.to, label, href)) return true
    return replacePreviewEditWithText(previewEdit, fallbackSyntax)
  }

  const getActivePreviewMarkdowns = (latestState: AppState) => {
    return getNoteBodyPreviewMarkdowns(latestState, activeNoteBodyId, {
      aisleId: activeAisleIdRef.current,
      markdown: getActiveEditorMarkdown(),
    })
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
  }): NoteReferenceEditorCommandResult => {
    const latestState = stateRef.current
    const command = buildNoteReferenceCommand({
      appState: latestState,
      source: getCurrentNoteLocation(),
      target,
      action,
      activeNoteBodyId,
      previewMarkdowns: action === 'preview' ? getActivePreviewMarkdowns(latestState) : undefined,
    })
    if (!command.ok) {
      pushToast(command.message, 'warning')
      return { handled: false, toast: { message: command.message, tone: 'warning' } }
    }
    const handled = action === 'link'
      ? replaceTextRangeWithLinkInActiveEditor(from, to, command.label ?? '', command.href ?? command.syntax)
      : replaceTextRangeInActiveEditor(from, to, command.insertText)
    if (!handled) {
      const message = action === 'preview'
        ? 'Open a note before inserting a note preview.'
        : 'Open a note before inserting a note link.'
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
          pushToast('Could not update link.', 'warning')
          return false
        }
        pushToast('Link updated.', 'success')
        return true
      }
      if (!insertLinkIntoActiveEditor(urlSpec.label, urlSpec.url)) {
        pushToast('Open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('Link inserted.', 'success')
      return true
    }

    if (modalState.insertAs === 'link') {
      const requestedLabel =
        modalState.noteLabelTouched || modalState.internalEdit || modalState.previewEdit ? modalState.noteLabel : ''
      const command = buildNoteReferenceCommand({
        appState: latestState,
        source: modalState.source,
        target,
        action: 'link',
        labelOverride: requestedLabel,
      })
      if (!command.ok) {
        pushToast(command.message, 'warning')
        return false
      }
      const href = command.href ?? command.syntax
      const previousHref = modalState.internalEdit?.href ?? href
      const internalEdit = modalState.internalEdit
      if (internalEdit) {
        const nextSyntax = command.syntax
        if (internalEdit.range) {
          const updated = replaceLinkRangeInActiveEditor(internalEdit.range, command.label ?? '', href)
          if (updated) {
            pushToast('Note link updated.', 'success')
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
        pushToast('Note link updated.', 'success')
        return true
      }
      if (modalState.previewEdit) {
        if (!replacePreviewEditWithLink(modalState.previewEdit, command.label ?? '', href, command.syntax)) {
          pushToast('Could not update note preview.', 'warning')
          return false
        }
        pushToast('Note link updated.', 'success')
        return true
      }
      if (!insertLinkIntoActiveEditor(command.label ?? '', href)) {
        pushToast('Open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('Note link inserted.', 'success')
      return true
    }

    const markdown = getActiveEditorMarkdown()
    const requestedLabel =
      modalState.noteLabelTouched || modalState.internalEdit || modalState.previewEdit ? modalState.noteLabel : ''
    const command = buildNoteReferenceCommand({
      appState: latestState,
      source: modalState.source,
      target,
      action: 'preview',
      activeNoteBodyId,
      labelOverride: requestedLabel,
      editingTokenId: modalState.previewEdit?.tokenId ?? modalState.editingTokenId,
      previewMarkdowns: getActivePreviewMarkdowns(latestState),
      insertPlacement: modalState.editingTokenId || modalState.previewEdit || modalState.internalEdit ? 'inline' : 'block',
    })
    if (!command.ok) {
      pushToast(command.message, 'warning')
      return false
    }

    if (modalState.internalEdit) {
      const internalEdit = modalState.internalEdit
      const replaced = internalEdit.range
        ? replaceTextRangeInActiveEditor(internalEdit.range.from, internalEdit.range.to, command.syntax)
        : false
      if (!replaced) {
        replaceEditorMarkdownOperation(
          editorOperationRuntime,
          replaceInternalNoteLinkByOccurrence(
            markdown,
            {
              label: internalEdit.label,
              href: internalEdit.href,
              target: internalEdit.target,
              aisleIds: internalEdit.aisleIds,
              heading: internalEdit.heading,
              startAt: internalEdit.startAt,
              from: internalEdit.from ?? 0,
              to: internalEdit.to ?? 0,
              occurrence: internalEdit.occurrence ?? 0,
            },
            command.syntax,
          ),
        )
      }
      pushToast('Note preview updated.', 'success')
      return true
    }

    if (modalState.previewEdit) {
      if (!replacePreviewEditWithText(modalState.previewEdit, command.syntax)) {
        pushToast('Could not update note preview.', 'warning')
        return false
      }
      pushToast('Note preview settings updated.', 'success')
      return true
    }

    if (modalState.editingTokenId) {
      replaceEditorMarkdownOperation(
        editorOperationRuntime,
        replacePreviewTokenById(markdown, latestState, modalState.editingTokenId, command.syntax),
      )
      pushToast('Note preview settings updated.', 'success')
      return true
    }

    if (!insertTextIntoActiveEditor(command.insertText)) {
      pushToast('Open a note before inserting a note preview.', 'warning')
      return false
    }
    pushToast('Note preview inserted.', 'success')
    return true
  }

  const deleteNotePreviewBySourceRange = (request: NotePreviewDeleteRequest): boolean => {
    const range = request.sourceRange
    if (!range) return false
    return dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
      const docSize = typeof view.state?.doc?.content?.size === 'number' ? view.state.doc.content.size : 0
      const from = Math.max(0, Math.min(docSize, Math.floor(range.from)))
      const to = Math.max(0, Math.min(docSize, Math.floor(range.to)))
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false
      return view.state.tr.delete(from, to)
    }).handled
  }

  const deleteNotePreview = (request: NotePreviewDeleteRequest) => {
    if (deleteNotePreviewBySourceRange(request)) {
      pushToast('Note preview deleted.', 'success')
      return
    }
    const payload = request.payload
    const markdown = getActiveEditorMarkdown()
    const nextMarkdown = removePreviewTokenByPayload(markdown, stateRef.current, payload)
    const fallbackMarkdown = nextMarkdown === markdown && payload.id
      ? removePreviewTokenById(markdown, stateRef.current, payload.id)
      : nextMarkdown
    if (fallbackMarkdown === markdown) {
      pushToast('Note preview not found.', 'warning')
      return
    }
    replaceEditorMarkdownOperation(editorOperationRuntime, fallbackMarkdown)
    pushToast('Note preview deleted.', 'success')
  }

  const openNoteReferenceModal = () => {
    saveActiveCursorBeforeNavigation()
    const source = getCurrentNoteLocation()
    setModal(buildDefaultNoteReferenceDraft(stateRef.current, source, stateRef.current.ui.lastLinkInsertMode ?? 'note', '', 'toolbar'))
  }

  const openNotePreviewContextMenu = ({
    x,
    y,
    payload,
    label,
    sourceRange,
  }: {
    x: number
    y: number
    payload: NotePreviewReferencePayload
    label: string
    sourceRange?: { from: number; to: number }
  }) => {
    const syntax = buildPreviewToken(stateRef.current, payload)
    const reference = syntax ? resolveMarkdownNoteReferenceToken(stateRef.current, syntax) : null
    if (!reference) return
    const nextLabel = label.trim() || reference.label
    setContextMenu({
      type: 'editor',
      x,
      y,
      link: {
        type: 'internal',
        label: nextLabel,
        href: reference.canonicalTarget,
        target: payload.target,
        aisleIds: payload.aisleIds,
        heading: payload.heading,
        startAt: payload.previewStart === 'last-position' ? 'last-position' : undefined,
        from: sourceRange?.from ?? 0,
        to: sourceRange?.to ?? 0,
        occurrence: 0,
        range: null,
        previewEdit: {
          label: nextLabel,
          href: reference.canonicalTarget,
          target: payload.target,
          aisleIds: payload.aisleIds,
          heading: payload.heading,
          previewStart: payload.previewStart,
          ...(sourceRange ? { sourceRange } : {}),
          tokenId: payload.id,
        },
      },
    })
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

    const command = buildNoteReferenceCommand({
      appState: stateRef.current,
      source: getCurrentNoteLocation(),
      target: {
        ...linkContext.target,
        aisleIds: linkContext.aisleIds,
        heading: linkContext.heading,
        previewStart: linkContext.startAt === 'last-position' ? 'last-position' : undefined,
      },
      action: 'link',
      labelOverride: nextLabel,
    })
    if (!command.ok) {
      setContextMenu(null)
      pushToast(command.message, 'warning')
      return
    }
    const updated = linkContext.range
      ? replaceLinkRangeInActiveEditor(linkContext.range, command.label ?? nextLabel, command.href ?? command.syntax)
      : false
    if (updated) {
      setContextMenu(null)
      return
    }

    replaceEditorMarkdownOperation(
      editorOperationRuntime,
      replaceInternalNoteLinkByOccurrence(getActiveEditorMarkdown(), linkContext, command.syntax),
    )
    setContextMenu(null)
  }

  return {
    getNotePreviewData,
    insertLinkIntoActiveEditor,
    replaceLinkRangeInActiveEditor,
    replaceTextRangeInActiveEditor,
    replaceTextRangeWithLinkInActiveEditor,
    insertNoteReferenceFromMention,
    insertNoteReference,
    deleteNotePreview,
    openNotePreviewContextMenu,
    resolvePreviewToken: (token: string) => parsePreviewToken(token, stateRef.current),
    resolveInternalNoteReferenceToken: (token: string) => resolveMarkdownNoteReferenceToken(stateRef.current, token),
    openNoteReferenceModal,
    openInternalNoteLinkFromContext,
    renameInternalNoteLinkFromContext,
  }
}
