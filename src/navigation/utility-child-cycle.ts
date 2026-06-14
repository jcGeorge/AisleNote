import { SETTINGS_SECTIONS } from '../settings/defaults'
import type { AboutSection, MessagesSection, SettingsSection, ViewMode } from '../types/app'

export const ABOUT_SECTIONS: AboutSection[] = ['home', 'tooltip-sources']
export const MESSAGES_SECTIONS: MessagesSection[] = ['inbox', 'toast-history', 'diagnostics', 'editor-dev']

export type UtilityChildSelection =
  | { viewMode: 'about'; section: AboutSection }
  | { viewMode: 'messages'; section: MessagesSection }
  | { viewMode: 'settings'; section: SettingsSection }

function getCycledSection<T extends string>(sections: readonly T[], activeSection: T, direction: -1 | 1): T | null {
  if (sections.length <= 1) return null
  const activeIndex = sections.indexOf(activeSection)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0
  const nextIndex = (safeActiveIndex + direction + sections.length) % sections.length
  return sections[nextIndex] ?? null
}

export function getNextUtilityChildSelection({
  viewMode,
  settingsSection,
  messagesSection,
  aboutSection,
  direction,
}: {
  viewMode: ViewMode
  settingsSection: SettingsSection
  messagesSection: MessagesSection
  aboutSection: AboutSection
  direction: -1 | 1
}): UtilityChildSelection | null {
  if (viewMode === 'settings') {
    const section = getCycledSection(SETTINGS_SECTIONS, settingsSection, direction)
    return section ? { viewMode, section } : null
  }
  if (viewMode === 'messages') {
    const section = getCycledSection(MESSAGES_SECTIONS, messagesSection, direction)
    return section ? { viewMode, section } : null
  }
  if (viewMode === 'about') {
    const section = getCycledSection(ABOUT_SECTIONS, aboutSection, direction)
    return section ? { viewMode, section } : null
  }
  return null
}
