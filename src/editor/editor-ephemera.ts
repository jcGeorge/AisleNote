export type CloseEditorEphemeraOptions = {
  restoreEditorFocus?: boolean
}

export type EditorEphemeraClosers = {
  dismissMentionMenu?: () => void
  closeToolbarPopovers?: () => void
  closeContextMenu?: () => void
  closeImageTools?: () => void
  closeTableTools?: () => void
  closeTableOfContents?: () => void
  closeShortcutMenu?: (options?: CloseEditorEphemeraOptions) => void
}

export function closeEditorEphemera(
  closers: EditorEphemeraClosers,
  options: CloseEditorEphemeraOptions = {},
): void {
  closers.dismissMentionMenu?.()
  closers.closeToolbarPopovers?.()
  closers.closeContextMenu?.()
  closers.closeImageTools?.()
  closers.closeTableTools?.()
  closers.closeTableOfContents?.()
  closers.closeShortcutMenu?.({ restoreEditorFocus: options.restoreEditorFocus })
}
