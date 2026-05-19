import { describe, expect, it } from 'vitest'
import { CLOSED_LINK_PROMPT_STATE, closeLinkPromptState } from './linkPromptState'
import type { LinkPromptState } from '../types/app'

describe('link prompt state', () => {
  it('returns the same object when the prompt is already closed', () => {
    const closedPrompt: LinkPromptState = {
      open: false,
      top: 12,
      left: 24,
      url: 'https://example.com',
      text: 'example',
    }

    expect(closeLinkPromptState(closedPrompt)).toBe(closedPrompt)
  })

  it('closes an open prompt to the shared closed state', () => {
    expect(closeLinkPromptState({
      open: true,
      top: 12,
      left: 24,
      url: 'https://example.com',
      text: 'example',
    })).toBe(CLOSED_LINK_PROMPT_STATE)
  })
})
