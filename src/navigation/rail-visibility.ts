import type { AppState } from '../types/app'

export type RailVisibilityTarget = 'space' | 'domain'

export type RailVisibilitySettings = Pick<AppState['ui'], 'alwaysShowSpaces' | 'alwaysShowDomains'>

export function getToggledRailVisibilitySettings(
  settings: RailVisibilitySettings,
  target: RailVisibilityTarget,
): Required<RailVisibilitySettings> {
  const spacesVisible = settings.alwaysShowSpaces ?? false
  const domainsVisible = settings.alwaysShowDomains ?? false

  if (target === 'space') {
    return spacesVisible
      ? { alwaysShowSpaces: false, alwaysShowDomains: false }
      : { alwaysShowSpaces: true, alwaysShowDomains: false }
  }

  return domainsVisible
    ? { alwaysShowSpaces: spacesVisible, alwaysShowDomains: false }
    : { alwaysShowSpaces: true, alwaysShowDomains: true }
}
