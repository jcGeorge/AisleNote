import type { RefObject } from 'react'
import type { LinkPromptState } from '../../types/app'

type LinkPromptProps = {
  linkPromptInputRef: RefObject<HTMLInputElement | null>
  linkPrompt: LinkPromptState
  onLinkPromptUrlChange: (url: string) => void
  onLinkPromptTextChange: (text: string) => void
  onInsertNamedLink: () => void
  onCloseLinkPrompt: () => void
  onOpenLink: () => void
}

export function LinkPrompt({
  linkPromptInputRef,
  linkPrompt,
  onLinkPromptUrlChange,
  onLinkPromptTextChange,
  onInsertNamedLink,
  onCloseLinkPrompt,
  onOpenLink,
}: LinkPromptProps) {
  if (!linkPrompt.open) return null

  return (
    <div
      className={linkPrompt.urlEditable ? 'link-prompt is-url-editable' : 'link-prompt'}
      style={{ top: `${linkPrompt.top}px`, left: `${linkPrompt.left}px` }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {linkPrompt.urlEditable && (
        <input
          ref={linkPromptInputRef}
          className="link-prompt-input link-prompt-url-input"
          value={linkPrompt.url}
          placeholder="link url"
          onChange={(event) => onLinkPromptUrlChange(event.target.value)}
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
      )}
      <input
        ref={linkPrompt.urlEditable ? undefined : linkPromptInputRef}
        className="link-prompt-input"
        value={linkPrompt.text}
        placeholder={linkPrompt.urlEditable ? 'link text' : 'link name'}
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
      {!linkPrompt.urlEditable && (
        <button type="button" className="link-prompt-btn" onClick={onOpenLink}>
          open
        </button>
      )}
      <button type="button" className="link-prompt-btn" onClick={onInsertNamedLink}>
        done
      </button>
    </div>
  )
}
