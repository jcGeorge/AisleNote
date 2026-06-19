import { describe, expect, it } from 'vitest'
import { getUrlLinkPromptDraftFromSelection } from './url-link-prompt'

describe('URL link prompt draft', () => {
  it('puts selected web addresses in the URL field', () => {
    expect(getUrlLinkPromptDraftFromSelection('https://lucide.dev/icons/link')).toEqual({
      url: 'https://lucide.dev/icons/link',
      text: '',
    })
    expect(getUrlLinkPromptDraftFromSelection('example.com/path')).toEqual({
      url: 'https://example.com/path',
      text: '',
    })
  })

  it('keeps selected non-URL text as the link label', () => {
    expect(getUrlLinkPromptDraftFromSelection('selected label')).toEqual({
      url: '',
      text: 'selected label',
    })
  })
})
