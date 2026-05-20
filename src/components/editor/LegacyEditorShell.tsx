import type { ReactNode, RefObject } from 'react'

type LegacyEditorShellProps = {
  editorReadOnly: boolean
  editorMountRef: RefObject<HTMLDivElement | null>
  imageToolsOverlay: ReactNode
  tableControlsOverlay: ReactNode
}

export function LegacyEditorShell({
  editorReadOnly,
  editorMountRef,
  imageToolsOverlay,
  tableControlsOverlay,
}: LegacyEditorShellProps) {
  return (
    <section className={`editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
      <div ref={editorMountRef} className="toast-editor-host" />
      {imageToolsOverlay}
      {tableControlsOverlay}
      {editorReadOnly && <div className="editor-lock" aria-hidden="true" />}
    </section>
  )
}
