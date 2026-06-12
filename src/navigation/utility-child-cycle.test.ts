import { describe, expect, it } from 'vitest'
import { getNextUtilityChildSelection } from './utility-child-cycle'

describe('utility child cycling', () => {
  it('cycles settings sections in rendered order', () => {
    expect(
      getNextUtilityChildSelection({
        viewMode: 'settings',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toEqual({ viewMode: 'settings', section: 'frontmatter' })

    expect(
      getNextUtilityChildSelection({
        viewMode: 'settings',
        settingsSection: 'visuals',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toEqual({ viewMode: 'settings', section: 'data' })

    expect(
      getNextUtilityChildSelection({
        viewMode: 'settings',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: -1,
      }),
    ).toEqual({ viewMode: 'settings', section: 'visuals' })
  })

  it('cycles message sections independently from the other utility parents', () => {
    expect(
      getNextUtilityChildSelection({
        viewMode: 'messages',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toEqual({ viewMode: 'messages', section: 'toast-history' })

    expect(
      getNextUtilityChildSelection({
        viewMode: 'messages',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: -1,
      }),
    ).toEqual({ viewMode: 'messages', section: 'editor-dev' })

    expect(
      getNextUtilityChildSelection({
        viewMode: 'messages',
        settingsSection: 'data',
        messagesSection: 'diagnostics',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toEqual({ viewMode: 'messages', section: 'editor-dev' })
  })

  it('cycles about sections and ignores non-utility views', () => {
    expect(
      getNextUtilityChildSelection({
        viewMode: 'about',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toEqual({ viewMode: 'about', section: 'donation' })

    expect(
      getNextUtilityChildSelection({
        viewMode: 'main',
        settingsSection: 'data',
        messagesSection: 'inbox',
        aboutSection: 'home',
        direction: 1,
      }),
    ).toBeNull()
  })
})
