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

export type CopyToolbarAction = 'open-copy-modal' | 'open-copy-menu'

export function getCopyToolbarAction(activeNoteDuplicateCount: number): CopyToolbarAction {
  return activeNoteDuplicateCount > 1 ? 'open-copy-menu' : 'open-copy-modal'
}

type UseEditorToolbarLayerOptions = {
  editorRef: MutableRefObject<Editor | null>
  copyToolbarButtonRef: RefObject<HTMLButtonElement | null>
  headingToolbarButtonRef: RefObject<HTMLButtonElement | null>
  aisleToolbarButtonRef: RefObject<HTMLButtonElement | null>
  toolbarFormatState: ToolbarFormatState
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarShortcutFeedback: ToolbarFormatKey | null
  tooltipsDisabled: boolean
  interactionDisabled: boolean
  copyMenuOpen: boolean
  noteToolsOpen: boolean
  headingMenuOpen: boolean
  toolbarPopoverPosition: {
    copy: ToolbarPopoverPosition | null
    heading: ToolbarPopoverPosition | null
    aisles: ToolbarPopoverPosition | null
  }
  activeNoteAisles: NoteAisle[]
  activeNoteDuplicateCount: number
  setCopyMenuOpen: Dispatch<SetStateAction<boolean>>
  setNoteToolsOpen: Dispatch<SetStateAction<boolean>>
  setHeadingMenuOpen: Dispatch<SetStateAction<boolean>>
  setToolbarPopoverPosition: Dispatch<SetStateAction<Record<'copy' | 'heading' | 'aisles', ToolbarPopoverPosition | null>>>
  refreshToolbarPopoverPosition: (kind: 'copy' | 'heading' | 'aisles') => ToolbarPopoverPosition | null
  runActiveEditorCommand: (command: string, payload?: Record<string, unknown>) => boolean
  runActiveEditorHistory: (direction: 'undo' | 'redo') => boolean
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  openSharedLinkModal: (selectedText?: string) => void
  clearActiveNoteContent: () => void
  openCopyModalForActiveNote: () => void
  openDeduplicateModalForActiveNote: () => void
  openFrontmatterModalForActiveNote: () => void
  openTableOfContents: () => void
  addAisleToActiveNote: () => void
  openAisleEditModal: () => void
  pushToast: (message: string, tone?: ToastTone) => void
  onDisabledToolbarInteraction: () => void
}

export function useEditorToolbarLayer({
  editorRef,
  copyToolbarButtonRef,
  headingToolbarButtonRef,
  aisleToolbarButtonRef,
  toolbarFormatState,
  activeHeadingLevel,
  toolbarShortcutFeedback,
  tooltipsDisabled,
  interactionDisabled,
  copyMenuOpen,
  noteToolsOpen,
  headingMenuOpen,
  toolbarPopoverPosition,
  activeNoteAisles,
  activeNoteDuplicateCount,
  setCopyMenuOpen,
  setNoteToolsOpen,
  setHeadingMenuOpen,
  setToolbarPopoverPosition,
  refreshToolbarPopoverPosition,
  runActiveEditorCommand,
  runActiveEditorHistory,
  commitActiveEditorMarkdownNow,
  openSharedLinkModal,
  clearActiveNoteContent,
  openCopyModalForActiveNote,
  openDeduplicateModalForActiveNote,
  openFrontmatterModalForActiveNote,
  openTableOfContents,
  addAisleToActiveNote,
  openAisleEditModal,
  pushToast,
  onDisabledToolbarInteraction,
}: UseEditorToolbarLayerOptions) {
  const closeToolbarMenus = () => {
    setCopyMenuOpen(false)
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    setToolbarPopoverPosition({ copy: null, heading: null, aisles: null })
  }

  const executeToolbarCommand = (command: string, payload?: Record<string, unknown>) => {
    closeToolbarMenus()
    if (!runActiveEditorCommand(command, payload)) {
      pushToast('open a note before using the toolbar.', 'warning')
    }
  }

  const executeToolbarHistory = (direction: 'undo' | 'redo') => {
    closeToolbarMenus()
    if (!runActiveEditorHistory(direction)) {
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
    if (getCopyToolbarAction(activeNoteDuplicateCount) === 'open-copy-menu') {
      setHeadingMenuOpen(false)
      setNoteToolsOpen(false)
      setToolbarPopoverPosition((previous) => ({ ...previous, heading: null, aisles: null }))
      const nextOpen = !copyMenuOpen
      setCopyMenuOpen(nextOpen)
      if (nextOpen) {
        refreshToolbarPopoverPosition('copy')
      } else {
        setToolbarPopoverPosition((previous) => ({ ...previous, copy: null }))
      }
      return
    }

    closeToolbarMenus()
    openCopyModalForActiveNote()
  }

  const openCopyModalFromCopyMenu = () => {
    closeToolbarMenus()
    openCopyModalForActiveNote()
  }

  const openDeduplicateModalFromCopyMenu = () => {
    closeToolbarMenus()
    openDeduplicateModalForActiveNote()
  }

  const openTableOfContentsFromToolbar = () => {
    closeToolbarMenus()
    openTableOfContents()
  }

  const toggleAisleToolbarPopover = () => {
    setCopyMenuOpen(false)
    setHeadingMenuOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, copy: null, heading: null }))
    const nextOpen = !noteToolsOpen
    setNoteToolsOpen(nextOpen)
    if (nextOpen) {
      refreshToolbarPopoverPosition('aisles')
    } else {
      setToolbarPopoverPosition((previous) => ({ ...previous, aisles: null }))
    }
  }

  const toggleHeadingToolbarPopover = () => {
    setCopyMenuOpen(false)
    setNoteToolsOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, copy: null, aisles: null }))
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
        copyButtonRef={copyToolbarButtonRef}
        headingButtonRef={headingToolbarButtonRef}
        aisleButtonRef={aisleToolbarButtonRef}
        tooltipsDisabled={tooltipsDisabled}
        interactionDisabled={interactionDisabled}
        toolbarFormatState={toolbarFormatState}
        activeHeadingLevel={activeHeadingLevel}
        toolbarShortcutFeedback={toolbarShortcutFeedback}
        onOpenCopy={openCopyModalFromToolbar}
        onOpenFrontmatter={openFrontmatterModalForActiveNote}
        onOpenTableOfContents={openTableOfContentsFromToolbar}
        onToggleAisles={toggleAisleToolbarPopover}
        onToggleHeading={toggleHeadingToolbarPopover}
        onCommand={executeToolbarCommand}
        onHistory={executeToolbarHistory}
        onInsertImage={insertImageFromToolbar}
        onInsertWebLink={insertWebLinkFromToolbar}
        onClear={clearActiveNoteFromToolbar}
        onDisabledInteraction={onDisabledToolbarInteraction}
      />
    ),
    popovers: (
      <EditorToolbarPopovers
        disabled={interactionDisabled}
        copyMenuOpen={copyMenuOpen}
        headingMenuOpen={headingMenuOpen}
        noteToolsOpen={noteToolsOpen}
        activeHeadingLevel={activeHeadingLevel}
        toolbarPopoverPosition={toolbarPopoverPosition}
        activeNoteAisles={activeNoteAisles}
        onExecuteToolbarCommand={executeToolbarCommand}
        onOpenCopyModal={openCopyModalFromCopyMenu}
        onOpenDeduplicateModal={openDeduplicateModalFromCopyMenu}
        onCloseAislePopover={closeToolbarMenus}
        onAddAisle={addAisleToActiveNote}
        onOpenAisleEditModal={openAisleEditModal}
      />
    ),
  }
}
