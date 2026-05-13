import type { ReactNode, RefObject } from 'react'
import type { LinkPromptState, ViewMode } from '../../types/app'

type LegacyEditorShellProps = {
  viewMode: ViewMode
  editorReadOnly: boolean
  editorMountRef: RefObject<HTMLDivElement | null>
  linkPromptInputRef: RefObject<HTMLInputElement | null>
  linkPrompt: LinkPromptState
  imageToolsOverlay: ReactNode
  onOpenNoteReference: () => void
  onLinkPromptTextChange: (text: string) => void
  onInsertNamedLink: () => void
  onCloseLinkPrompt: () => void
}

export function LegacyEditorShell({
  viewMode,
  editorReadOnly,
  editorMountRef,
  linkPromptInputRef,
  linkPrompt,
  imageToolsOverlay,
  onOpenNoteReference,
  onLinkPromptTextChange,
  onInsertNamedLink,
  onCloseLinkPrompt,
}: LegacyEditorShellProps) {
  return (
    <section className={`editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
      {viewMode === 'main' && (
        <button
          type="button"
          className="note-reference-btn"
          onClick={onOpenNoteReference}
          title="Insert note link or note preview"
          aria-label="Insert note link or note preview"
        >
          <span className="note-reference-paper" aria-hidden="true" />
          <span className="note-reference-chain" aria-hidden="true" />
        </button>
      )}
      <div ref={editorMountRef} className="toast-editor-host" />
      {imageToolsOverlay}
      {viewMode === 'main' && linkPrompt.open && (
        <div
          className="link-prompt"
          style={{ top: `${linkPrompt.top}px`, left: `${linkPrompt.left}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <input
            ref={linkPromptInputRef}
            className="link-prompt-input"
            value={linkPrompt.text}
            placeholder="link name"
            onChange={(event) => onLinkPromptTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onInsertNamedLink()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCloseLinkPrompt()
              }
            }}
          />
          <button type="button" className="link-prompt-btn" onClick={onInsertNamedLink}>
            done
          </button>
        </div>
      )}
      {editorReadOnly && <div className="editor-lock" aria-hidden="true" />}
    </section>
  )
}
