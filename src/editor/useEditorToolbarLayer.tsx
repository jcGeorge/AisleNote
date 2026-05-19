import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { Editor } from '@toast-ui/editor'
import { EditorToolbarPopovers } from '../components/editor/EditorToolbarPopovers'
import { SharedEditorToolbar } from '../components/editor/SharedEditorToolbar'
import type { ToolbarFormatKey, ToolbarFormatState, ToolbarHeadingLevel } from '../components/editor/toolbar-state'
import type { NoteAisle, ToastTone } from '../types/app'
import { getCommandCapableEditor } from './prosemirror-utils'
import { importImageBlobAsAssetUrl } from '../markdown/image-asset-registry'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

type UseEditorToolbarLayerOptions = {
  editorRef: MutableRefObject<Editor | null>
  headingToolbarButtonRef: RefObject<HTMLButtonElement | null>
  aisleToolbarButtonRef: RefObject<HTMLButtonElement | null>
  toolbarFormatState: ToolbarFormatState
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarShortcutFeedback: ToolbarFormatKey | null
  noteToolsOpen: boolean
  headingMenuOpen: boolean
  toolbarPopoverPosition: {
    heading: ToolbarPopoverPosition | null
    aisles: ToolbarPopoverPosition | null
  }
  activeNoteAisles: NoteAisle[]
  setNoteToolsOpen: Dispatch<SetStateAction<boolean>>
  setHeadingMenuOpen: Dispatch<SetStateAction<boolean>>
  setToolbarPopoverPosition: Dispatch<SetStateAction<Record<'heading' | 'aisles', ToolbarPopoverPosition | null>>>
  refreshToolbarPopoverPosition: (kind: 'heading' | 'aisles') => ToolbarPopoverPosition | null
  runActiveEditorCommand: (command: string, payload?: Record<string, unknown>) => boolean
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  openSharedLinkModal: (selectedText?: string) => void
  clearActiveNoteContent: () => void
  openCopyModalForActiveNote: () => void
  openFrontmatterModalForActiveNote: () => void
  addAisleToActiveNote: () => void
  openAisleEditModal: () => void
  pushToast: (message: string, tone?: ToastTone) => void
}

export function useEditorToolbarLayer({
  editorRef,
  headingToolbarButtonRef,
  aisleToolbarButtonRef,
  toolbarFormatState,
  activeHeadingLevel,
  toolbarShortcutFeedback,
  noteToolsOpen,
  headingMenuOpen,
  toolbarPopoverPosition,
  activeNoteAisles,
  setNoteToolsOpen,
  setHeadingMenuOpen,
  setToolbarPopoverPosition,
  refreshToolbarPopoverPosition,
  runActiveEditorCommand,
  commitActiveEditorMarkdownNow,
  openSharedLinkModal,
  clearActiveNoteContent,
  openCopyModalForActiveNote,
  openFrontmatterModalForActiveNote,
  addAisleToActiveNote,
  openAisleEditModal,
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
      void importImageBlobAsAssetUrl(file, file.name).then((assetUrl) => {
        if (!assetUrl) {
          pushToast('could not import image.', 'warning')
          return
        }
        currentEditor.focus()
        getCommandCapableEditor(currentEditor).exec('addImage', { imageUrl: assetUrl, altText: file.name })
        commitActiveEditorMarkdownNow(currentEditor)
      })
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
    const selectedText = getCommandCapableEditor(currentEditor).getSelectedText().trim()
    openSharedLinkModal(selectedText)
  }

  const openCopyModalFromToolbar = () => {
    closeToolbarMenus()
    setToolbarPopoverPosition({ heading: null, aisles: null })
    openCopyModalForActiveNote()
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
        activeHeadingLevel={activeHeadingLevel}
        toolbarShortcutFeedback={toolbarShortcutFeedback}
        onOpenCopy={openCopyModalFromToolbar}
        onOpenFrontmatter={openFrontmatterModalForActiveNote}
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
        activeHeadingLevel={activeHeadingLevel}
        toolbarPopoverPosition={toolbarPopoverPosition}
        activeNoteAisles={activeNoteAisles}
        onExecuteToolbarCommand={executeToolbarCommand}
        onCloseAislePopover={closeToolbarMenus}
        onAddAisle={addAisleToActiveNote}
        onOpenAisleEditModal={openAisleEditModal}
      />
    ),
  }
}
