import { normalizeExternalWebUrl } from '../notes/external-links'
import type { LinkPromptState } from '../types/app'

export function getUrlLinkPromptDraftFromSelection(selectedText: string): Pick<LinkPromptState, 'url' | 'text'> {
  const url = normalizeExternalWebUrl(selectedText)
  if (url) return { url, text: '' }
  return { url: '', text: selectedText }
}
