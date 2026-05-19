import type { ReactNode, RefObject } from 'react'

type LegacyEditorShellProps = {
  editorReadOnly: boolean
  editorMountRef: RefObject<HTMLDivElement | null>
  imageToolsOverlay: ReactNode
}

export function LegacyEditorShell({
  editorReadOnly,
  editorMountRef,
  imageToolsOverlay,
}: LegacyEditorShellProps) {
  return (
    <section className={`editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
      <div ref={editorMountRef} className="toast-editor-host" />
      {imageToolsOverlay}
      {editorReadOnly && <div className="editor-lock" aria-hidden="true" />}
    </section>
  )
}
