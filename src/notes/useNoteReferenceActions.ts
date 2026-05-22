import { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
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
import { createId } from '../state/workspace'
import type { AppState, ContextMenuState, ModalState, NoteLocation, NoteNavigationTarget, ToastTone } from '../types/app'
import { normalizeExternalWebUrl } from './external-links'
import {
  buildContextToken,
  buildInternalNoteUrl,
  escapeMarkdownLinkLabel,
  getContextReferenceSignature,
  type NoteContextReferencePayload,
  parseContextReferences,
  removeContextTokenById,
  replaceContextTokenById,
  replaceInternalNoteLinkByOccurrence,
  wouldCreateContextCycle,
} from './note-references'
import { getDefaultNoteLinkLabel, getDefaultNoteReferenceTarget, getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import { normalizeNoteReferenceTarget } from './note-reference-targets'

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

  const getContextPreviewData = (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => {
    const latestState = stateRef.current
    const targetInfo = getLocationInfo(latestState, payload.target)
    const targetBody = latestState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
    const payloadAisleIds = payload.heading?.aisleId ? [payload.heading.aisleId] : payload.aisleIds
    const selectedAisleCandidates =
      targetBody && payloadAisleIds && payloadAisleIds.length > 0
        ? targetBody.aisles.filter((aisle) => payloadAisleIds.includes(aisle.id))
        : targetBody?.aisles ?? []
    const selectedAisles = selectedAisleCandidates.length > 0 || !payload.heading ? selectedAisleCandidates : targetBody?.aisles ?? []
    const selectedAislesWithMarkdown = selectedAisles.map((aisle) => ({
      ...aisle,
      markdown: getAisleMarkdown(aisle, latestState.noteAisleBodies),
    }))
    const recursiveBlocked =
      !targetBody ||
      !targetInfo.noteBodyId ||
      targetInfo.noteBodyId === sourceNoteBodyId ||
      wouldCreateContextCycle(latestState, targetInfo.noteBodyId, sourceNoteBodyId)
    const previewText = selectedAislesWithMarkdown
      .map((aisle) => aisle.markdown.trim())
      .filter(Boolean)
      .join('\n\n')
    const locationLabel = targetInfo.domain && targetInfo.space && targetInfo.tab
      ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / index'}`
      : 'missing note'
    const displayTitle = targetInfo.tab
      ? `${targetInfo.tab.title} > ${targetInfo.subTab ? targetInfo.subTab.title : 'index'}`
      : targetInfo.title

    return { targetInfo, targetBody, selectedAisles: selectedAislesWithMarkdown, recursiveBlocked, previewText, locationLabel, displayTitle }
  }

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
      return tr.addMark(currentRange.from, currentRange.from + nextLabel.length, linkType.create({ href: url }))
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
      return tr.addMark(from, from + nextLabel.length, linkType.create({ href: url }))
    }).handled
  }

  const insertTextIntoActiveEditor = (text: string) => {
    return insertEditorTextOperation(editorOperationRuntime, text).handled
  }

  const insertNoteReference = (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => {
    const latestState = stateRef.current
    const target = modalState.mode === 'note' ? normalizeNoteReferenceTarget(latestState, modalState.target) : modalState.target
    const targetInfo = getLocationInfo(latestState, target)
    if (modalState.mode === 'url') {
      const url = normalizeExternalWebUrl(modalState.url)
      if (!url) {
        pushToast('enter a valid web link.', 'warning')
        return false
      }
      const label = modalState.urlLabel.trim() || modalState.url.trim()
      if (modalState.urlEditRange) {
        if (!replaceLinkRangeInActiveEditor(modalState.urlEditRange, label, url)) {
          pushToast('could not update link.', 'warning')
          return false
        }
        pushToast('link updated.', 'success')
        return true
      }
      if (!insertLinkIntoActiveEditor(label, url)) {
        pushToast('open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('link inserted.', 'success')
      return true
    }

    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
      pushToast('choose an existing note.', 'warning')
      return false
    }

    if (modalState.insertAs === 'link') {
      const href = buildInternalNoteUrl(targetInfo.noteBodyId, target)
      const previousHref = modalState.internalEdit?.href ?? href
      const label = modalState.noteLabel.trim() || getDefaultNoteLinkLabel(latestState, modalState.source, target)
      const internalEdit = modalState.internalEdit
      if (internalEdit) {
        if (internalEdit.range) {
          if (!replaceLinkRangeInActiveEditor(internalEdit.range, label, href)) {
            pushToast('could not update note link.', 'warning')
            return false
          }
          pushToast('note link updated.', 'success')
          return true
        }
        const nextSyntax = `[${escapeMarkdownLinkLabel(label)}](${href})`
        const editFrom = internalEdit.from
        const editTo = internalEdit.to
        if (typeof editFrom === 'number' && typeof editTo === 'number') {
          const updated = dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
            const currentHit = getInternalNoteLinkHitAtDocPosition(view.state.doc, editFrom)
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
              heading: internalEdit.heading,
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
      if (!insertLinkIntoActiveEditor(label, href)) {
        pushToast('open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('note link inserted.', 'success')
      return true
    }

    if (!activeNoteBodyId || targetInfo.noteBodyId === activeNoteBodyId) {
      pushToast('a note cannot preview itself.', 'warning')
      return false
    }

    if (wouldCreateContextCycle(latestState, targetInfo.noteBodyId, activeNoteBodyId)) {
      pushToast('note preview blocked to prevent recursion.', 'warning')
      return false
    }

    const markdown = getActiveEditorMarkdown()
    const nextPayload: NoteContextReferencePayload = {
      id: modalState.editingTokenId ?? createId(),
      target: {
        domainId: target.domainId,
        spaceId: target.spaceId,
        tabId: target.tabId,
        subTabId: target.subTabId,
      },
      aisleIds: target.aisleIds && target.aisleIds.length > 0 ? target.aisleIds : undefined,
      heading: target.heading,
    }
    const nextSignature = getContextReferenceSignature(latestState, nextPayload)
    const activeBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null
    const noteMarkdowns = activeBody
      ? activeBody.aisles.map((aisle) =>
          aisle.id === activeAisleIdRef.current ? markdown : getAisleMarkdown(aisle, latestState.noteAisleBodies),
        )
      : [markdown]
    const duplicateReference = noteMarkdowns.flatMap(parseContextReferences).find(
      (reference) =>
        reference.payload.id !== modalState.editingTokenId &&
        getContextReferenceSignature(latestState, reference.payload) === nextSignature,
    )
    if (duplicateReference) {
      pushToast('that note preview already exists in this note.', 'warning')
      return false
    }

    const token = buildContextToken(nextPayload)
    if (modalState.editingTokenId) {
      replaceEditorMarkdownOperation(editorOperationRuntime, replaceContextTokenById(markdown, modalState.editingTokenId, token))
      pushToast('note preview settings updated.', 'success')
      return true
    }

    if (!insertTextIntoActiveEditor(`\n\n${token}\n\n`)) {
      pushToast('open a note before inserting a note preview.', 'warning')
      return false
    }
    pushToast('note preview inserted.', 'success')
    return true
  }

  const deleteContextPreview = (tokenId: string) => {
    const markdown = getActiveEditorMarkdown()
    const nextMarkdown = removeContextTokenById(markdown, tokenId)
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
    const target = getDefaultNoteReferenceTarget(stateRef.current, source)
    const normalizedTarget = normalizeNoteReferenceTarget(stateRef.current, target)
    setModal({
      type: 'insert-note-reference',
      mode: stateRef.current.ui.lastLinkInsertMode ?? 'note',
      insertAs: 'link',
      source,
      target: normalizedTarget,
      noteLabel: getDefaultNoteLinkLabel(stateRef.current, source, normalizedTarget),
      url: '',
      urlLabel: '',
    })
  }

  const openInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const target = { ...contextMenu.target, heading: contextMenu.heading }
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

    const nextSyntax = `[${escapeMarkdownLinkLabel(nextLabel)}](${linkContext.href})`
    const updated = dispatchEditorTransaction(editorOperationRuntime, ({ view }) => {
        const currentHit = getInternalNoteLinkHitAtDocPosition(view.state.doc, linkContext.from)
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
    insertNoteReference,
    deleteContextPreview,
    openNoteReferenceModal,
    openInternalNoteLinkFromContext,
    renameInternalNoteLinkFromContext,
  }
}
