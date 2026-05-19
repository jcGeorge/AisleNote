import type { LinkPromptState } from '../types/app'

export const CLOSED_LINK_PROMPT_STATE: LinkPromptState = {
  open: false,
  top: 0,
  left: 0,
  url: '',
  text: '',
  urlEditable: false,
  editRange: null,
}

export function closeLinkPromptState(previous: LinkPromptState): LinkPromptState {
  return previous.open ? CLOSED_LINK_PROMPT_STATE : previous
}
