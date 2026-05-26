import { describe, expect, it } from 'vitest'
import { getToggledRailVisibilitySettings } from './rail-visibility'

describe('rail visibility toggles', () => {
  it('shows only the space rail when toggling spaces on from hidden state', () => {
    expect(getToggledRailVisibilitySettings({}, 'space')).toEqual({
      alwaysShowSpaces: true,
      alwaysShowDomains: false,
    })
  })

  it('hides both rails when toggling spaces off', () => {
    expect(getToggledRailVisibilitySettings({ alwaysShowSpaces: true, alwaysShowDomains: true }, 'space')).toEqual({
      alwaysShowSpaces: false,
      alwaysShowDomains: false,
    })
  })

  it('shows spaces and domains when toggling domains on', () => {
    expect(getToggledRailVisibilitySettings({ alwaysShowSpaces: false, alwaysShowDomains: false }, 'domain')).toEqual({
      alwaysShowSpaces: true,
      alwaysShowDomains: true,
    })
  })

  it('hides only the domain rail when toggling domains off', () => {
    expect(getToggledRailVisibilitySettings({ alwaysShowSpaces: true, alwaysShowDomains: true }, 'domain')).toEqual({
      alwaysShowSpaces: true,
      alwaysShowDomains: false,
    })
  })
})
