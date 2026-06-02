export type CloseEditorEphemeraOptions = {
  restoreEditorFocus?: boolean
}

export type EditorEphemeraClosers = {
  dismissMentionMenu?: () => void
  dismissTagAutocomplete?: () => void
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
  closers.dismissTagAutocomplete?.()
  closers.closeToolbarPopovers?.()
  closers.closeContextMenu?.()
  closers.closeImageTools?.()
  closers.closeTableTools?.()
  closers.closeTableOfContents?.()
  closers.closeShortcutMenu?.({ restoreEditorFocus: options.restoreEditorFocus })
}
