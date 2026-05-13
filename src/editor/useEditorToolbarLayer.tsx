import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { Editor } from '@toast-ui/editor'
import { EditorToolbarPopovers } from '../components/editor/EditorToolbarPopovers'
import { SharedEditorToolbar } from '../components/editor/SharedEditorToolbar'
import type { ToolbarFormatKey, ToolbarFormatState } from '../components/editor/toolbar-state'
import type { NoteAisle, ToastTone } from '../types/app'
import { getCommandCapableEditor } from './prosemirror-utils'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

type AisleDeleteConfirmationState = {
  aisleId: string
  aisleIndex: number
  top: number
  left: number
}

type UseEditorToolbarLayerOptions = {
  editorRef: MutableRefObject<Editor | null>
  headingToolbarButtonRef: RefObject<HTMLButtonElement | null>
  aisleToolbarButtonRef: RefObject<HTMLButtonElement | null>
  toolbarFormatState: ToolbarFormatState
  toolbarShortcutFeedback: ToolbarFormatKey | null
  noteToolsOpen: boolean
  headingMenuOpen: boolean
  toolbarPopoverPosition: {
    heading: ToolbarPopoverPosition | null
    aisles: ToolbarPopoverPosition | null
  }
  aisleDeleteMode: boolean
  aisleDeleteConfirmation: AisleDeleteConfirmationState | null
  activeNoteAisles: NoteAisle[]
  aisleDeleteConfirmButtonRef: RefObject<HTMLButtonElement | null>
  setNoteToolsOpen: Dispatch<SetStateAction<boolean>>
  setHeadingMenuOpen: Dispatch<SetStateAction<boolean>>
  setToolbarPopoverPosition: Dispatch<SetStateAction<Record<'heading' | 'aisles', ToolbarPopoverPosition | null>>>
  setAisleDeleteMode: Dispatch<SetStateAction<boolean>>
  setAisleDeleteConfirmation: Dispatch<SetStateAction<AisleDeleteConfirmationState | null>>
  refreshToolbarPopoverPosition: (kind: 'heading' | 'aisles') => ToolbarPopoverPosition | null
  runActiveEditorCommand: (command: string, payload?: Record<string, unknown>) => boolean
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  insertLinkIntoActiveEditor: (label: string, url: string) => boolean
  clearActiveNoteContent: () => void
  openNoteReferenceModal: () => void
  addAisleToActiveNote: () => void
  deleteAisleFromActiveNote: (aisleId: string) => void
  pushToast: (message: string, tone?: ToastTone) => void
}

export function useEditorToolbarLayer({
  editorRef,
  headingToolbarButtonRef,
  aisleToolbarButtonRef,
  toolbarFormatState,
  toolbarShortcutFeedback,
  noteToolsOpen,
  headingMenuOpen,
  toolbarPopoverPosition,
  aisleDeleteMode,
  aisleDeleteConfirmation,
  activeNoteAisles,
  aisleDeleteConfirmButtonRef,
  setNoteToolsOpen,
  setHeadingMenuOpen,
  setToolbarPopoverPosition,
  setAisleDeleteMode,
  setAisleDeleteConfirmation,
  refreshToolbarPopoverPosition,
  runActiveEditorCommand,
  commitActiveEditorMarkdownNow,
  insertLinkIntoActiveEditor,
  clearActiveNoteContent,
  openNoteReferenceModal,
  addAisleToActiveNote,
  deleteAisleFromActiveNote,
  pushToast,
}: UseEditorToolbarLayerOptions) {
  const closeToolbarMenus = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
  }

  const executeToolbarCommand = (command: string, payload?: Record<string, unknown>) => {
    closeToolbarMenus()
    if (!runActiveEditorCommand(command, payload)) {
      pushToast('open a note before using the toolbar.', 'warning')
    }
  }

  const insertImageFromToolbar = () => {
    closeToolbarMenus()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before inserting an image.', 'warning')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return
        currentEditor.focus()
        getCommandCapableEditor(currentEditor).exec('addImage', { imageUrl: dataUrl, altText: file.name })
        commitActiveEditorMarkdownNow(currentEditor)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const insertWebLinkFromToolbar = () => {
    closeToolbarMenus()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before inserting a link.', 'warning')
      return
    }
    const url = window.prompt('link url')
    if (!url) return
    const selectedText = getCommandCapableEditor(currentEditor).getSelectedText().trim()
    const label = window.prompt('link text', selectedText || url)
    insertLinkIntoActiveEditor((label ?? '').trim() || url, url)
  }

  const openNoteReferenceFromToolbar = () => {
    closeToolbarMenus()
    setToolbarPopoverPosition({ heading: null, aisles: null })
    openNoteReferenceModal()
  }

  const toggleAisleToolbarPopover = () => {
    setHeadingMenuOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, heading: null }))
    const nextOpen = !noteToolsOpen
    setNoteToolsOpen(nextOpen)
    if (nextOpen) {
      refreshToolbarPopoverPosition('aisles')
    } else {
      setToolbarPopoverPosition((previous) => ({ ...previous, aisles: null }))
    }
  }

  const toggleHeadingToolbarPopover = () => {
    setNoteToolsOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, aisles: null }))
    const nextOpen = !headingMenuOpen
    setHeadingMenuOpen(nextOpen)
    if (nextOpen) {
      refreshToolbarPopoverPosition('heading')
    } else {
      setToolbarPopoverPosition((previous) => ({ ...previous, heading: null }))
    }
  }

  const clearActiveNoteFromToolbar = () => {
    closeToolbarMenus()
    clearActiveNoteContent()
  }

  return {
    toolbar: (
      <SharedEditorToolbar
        headingButtonRef={headingToolbarButtonRef}
        aisleButtonRef={aisleToolbarButtonRef}
        toolbarFormatState={toolbarFormatState}
        toolbarShortcutFeedback={toolbarShortcutFeedback}
        onOpenNoteReference={openNoteReferenceFromToolbar}
        onToggleAisles={toggleAisleToolbarPopover}
        onToggleHeading={toggleHeadingToolbarPopover}
        onCommand={executeToolbarCommand}
        onInsertImage={insertImageFromToolbar}
        onInsertWebLink={insertWebLinkFromToolbar}
        onClear={clearActiveNoteFromToolbar}
      />
    ),
    popovers: (
      <EditorToolbarPopovers
        headingMenuOpen={headingMenuOpen}
        noteToolsOpen={noteToolsOpen}
        toolbarPopoverPosition={toolbarPopoverPosition}
        aisleDeleteMode={aisleDeleteMode}
        aisleDeleteConfirmation={aisleDeleteConfirmation}
        activeNoteAisles={activeNoteAisles}
        aisleDeleteConfirmButtonRef={aisleDeleteConfirmButtonRef}
        onExecuteToolbarCommand={executeToolbarCommand}
        onCloseAislePopover={closeToolbarMenus}
        onAddAisle={addAisleToActiveNote}
        onEnterAisleDeleteMode={() => {
          setAisleDeleteConfirmation(null)
          setAisleDeleteMode(true)
        }}
        onCancelAisleDeleteConfirmation={() => setAisleDeleteConfirmation(null)}
        onDeleteAisle={deleteAisleFromActiveNote}
        onWarn={(message) => pushToast(message, 'warning')}
      />
    ),
  }
}
