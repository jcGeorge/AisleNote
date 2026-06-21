import * as React from 'react'
import type { RefObject } from 'react'
import type { LinkPromptState } from '../../types/app'
import { AppIcon } from '../icons/AppIcon'

void React

type LinkPromptProps = {
  linkPromptInputRef: RefObject<HTMLInputElement | null>
  linkPrompt: LinkPromptState
  onLinkPromptUrlChange: (url: string) => void
  onLinkPromptTextChange: (text: string) => void
  onInsertNamedLink: () => void
  onCloseLinkPrompt: () => void
  onOpenLink: () => void
  onOpenNoteLink?: () => void
}

export function LinkPrompt({
  linkPromptInputRef,
  linkPrompt,
  onLinkPromptUrlChange,
  onLinkPromptTextChange,
  onInsertNamedLink,
  onCloseLinkPrompt,
  onOpenLink,
  onOpenNoteLink,
}: LinkPromptProps) {
  if (!linkPrompt.open) return null
  const className = [
    'link-prompt',
    linkPrompt.urlEditable ? 'is-url-editable' : '',
    linkPrompt.centered ? 'is-centered' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      role="dialog"
      aria-label={linkPrompt.urlEditable ? 'Insert link' : 'Link'}
      style={{ top: `${linkPrompt.top}px`, left: `${linkPrompt.left}px` }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {linkPrompt.urlEditable && (
        <div className="link-prompt-header">
          <strong className="link-prompt-title">Insert link</strong>
          <button
            type="button"
            className="link-prompt-btn link-prompt-close-btn app-close-button"
            aria-label="Close link prompt"
            onClick={onCloseLinkPrompt}
          >
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </div>
      )}
      {linkPrompt.urlEditable && (
        <label className="link-prompt-field">
          <span>link url</span>
          <input
            ref={linkPromptInputRef}
            className="link-prompt-input link-prompt-url-input"
            value={linkPrompt.url}
            placeholder="https://example.com"
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
        </label>
      )}
      <label className="link-prompt-field">
        <span>{linkPrompt.urlEditable ? 'link text' : 'link name'}</span>
        <input
          ref={linkPrompt.urlEditable ? undefined : linkPromptInputRef}
          className="link-prompt-input"
          value={linkPrompt.text}
          placeholder={linkPrompt.urlEditable ? 'optional label' : 'link name'}
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
      </label>
      <div className="link-prompt-actions">
        {!linkPrompt.urlEditable && (
          <button type="button" className="link-prompt-btn" onClick={onOpenLink}>
            open
          </button>
        )}
        {linkPrompt.urlEditable && onOpenNoteLink ? (
          <button type="button" className="link-prompt-btn link-prompt-note-btn" onClick={onOpenNoteLink}>
            note
          </button>
        ) : null}
        <button type="button" className="link-prompt-btn" onClick={onInsertNamedLink}>
          done
        </button>
      </div>
    </div>
  )
}
