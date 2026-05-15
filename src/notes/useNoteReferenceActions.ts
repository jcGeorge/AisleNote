import { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  getCommandCapableEditor,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
} from '../editor/prosemirror-utils'
import { createId } from '../state/workspace'
import type { AppState, ContextMenuState, ModalState, NoteLocation, ToastTone } from '../types/app'
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
import { getDefaultNoteReferenceTarget, getLocationInfo } from './note-locations'

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
  navigateToNoteLocation: (location: NoteLocation) => void
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
  const getContextPreviewData = (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => {
    const latestState = stateRef.current
    const targetInfo = getLocationInfo(latestState, payload.target)
    const targetBody = latestState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
    const selectedAisles =
      targetBody && payload.aisleIds && payload.aisleIds.length > 0
        ? targetBody.aisles.filter((aisle) => payload.aisleIds?.includes(aisle.id))
        : targetBody?.aisles ?? []
    const recursiveBlocked =
      !targetBody ||
      !targetInfo.noteBodyId ||
      targetInfo.noteBodyId === sourceNoteBodyId ||
      wouldCreateContextCycle(latestState, targetInfo.noteBodyId, sourceNoteBodyId)
    const previewText = selectedAisles
      .map((aisle) => aisle.markdown.trim())
      .filter(Boolean)
      .join('\n\n')
    const locationLabel = targetInfo.domain && targetInfo.space && targetInfo.tab
      ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / index'}`
      : 'missing note'
    const displayTitle = targetInfo.tab
      ? `${targetInfo.tab.title} > ${targetInfo.subTab ? targetInfo.subTab.title : 'index'}`
      : targetInfo.title

    return { targetInfo, targetBody, selectedAisles, recursiveBlocked, previewText, locationLabel, displayTitle }
  }

  const insertLinkIntoActiveEditor = (label: string, url: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    getCommandCapableEditor(currentEditor).exec('addLink', { linkUrl: url, linkText: label })
    commitActiveEditorMarkdownNow(currentEditor)
    return true
  }

  const insertTextIntoActiveEditor = (text: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    getCommandCapableEditor(currentEditor).insertText(text)
    commitActiveEditorMarkdownNow(currentEditor)
    return true
  }

  const insertNoteReference = (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => {
    const latestState = stateRef.current
    const targetInfo = getLocationInfo(latestState, modalState.target)
    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
      pushToast('choose an existing note.', 'warning')
      return false
    }

    if (modalState.insertAs === 'link') {
      if (!insertLinkIntoActiveEditor(targetInfo.title, buildInternalNoteUrl(targetInfo.noteBodyId, modalState.target))) {
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
        domainId: modalState.target.domainId,
        spaceId: modalState.target.spaceId,
        tabId: modalState.target.tabId,
        subTabId: modalState.target.subTabId,
      },
      aisleIds: modalState.target.aisleIds && modalState.target.aisleIds.length > 0 ? modalState.target.aisleIds : undefined,
    }
    const nextSignature = getContextReferenceSignature(latestState, nextPayload)
    const activeBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null
    const noteMarkdowns = activeBody
      ? activeBody.aisles.map((aisle) => (aisle.id === activeAisleIdRef.current ? markdown : aisle.markdown))
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
      replaceActiveEditorMarkdown(replaceContextTokenById(markdown, modalState.editingTokenId, token))
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
    replaceActiveEditorMarkdown(nextMarkdown)
    pushToast('note preview deleted.', 'success')
  }

  const openNoteReferenceModal = () => {
    saveActiveCursorBeforeNavigation()
    const source = getCurrentNoteLocation()
    const target = getDefaultNoteReferenceTarget(stateRef.current, source)
    setModal({
      type: 'insert-note-reference',
      insertAs: 'link',
      target,
    })
  }

  const openInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const target = contextMenu.target
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
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)

    if (currentEditor && view) {
      try {
        const currentHit = getInternalNoteLinkHitAtDocPosition(view.state.doc, linkContext.from)
        const from = currentHit?.href === linkContext.href ? currentHit.from : linkContext.from
        const to = currentHit?.href === linkContext.href ? currentHit.to : linkContext.to
        view.dispatch(view.state.tr.insertText(nextSyntax, from, to).scrollIntoView())
        currentEditor.focus()
        commitActiveEditorMarkdownNow(currentEditor)
        setContextMenu(null)
        return
      } catch {
        // Fall back to markdown replacement below if the document position shifted.
      }
    }

    replaceActiveEditorMarkdown(replaceInternalNoteLinkByOccurrence(getActiveEditorMarkdown(), linkContext, nextSyntax))
    setContextMenu(null)
  }

  return {
    getContextPreviewData,
    insertLinkIntoActiveEditor,
    insertNoteReference,
    deleteContextPreview,
    openNoteReferenceModal,
    openInternalNoteLinkFromContext,
    renameInternalNoteLinkFromContext,
  }
}
