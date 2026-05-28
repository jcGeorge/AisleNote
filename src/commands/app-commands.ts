import type { ShortcutId } from '../types/app'

export type AppCommandId = ShortcutId

export type AppCommandDefinition = {
  id: AppCommandId
  label: string
  defaultShortcut: string
}

export const APP_COMMANDS: AppCommandDefinition[] = [
  { id: 'toggleTabTrash', label: 'toggle tabs/trash', defaultShortcut: 'Mod+T' },
  { id: 'openDomains', label: 'show/hide domain', defaultShortcut: 'Mod+D' },
  { id: 'openSpaces', label: 'show/hide space', defaultShortcut: 'Mod+S' },
  { id: 'newTab', label: 'new parent tab', defaultShortcut: 'Mod+Shift+N' },
  { id: 'newSubTab', label: 'new sub tab', defaultShortcut: 'Mod+N' },
  { id: 'formatStrikethrough', label: 'strikethrough', defaultShortcut: '' },
  { id: 'cycleParentTabNext', label: 'next parent tab', defaultShortcut: '' },
  { id: 'cycleParentTabPrev', label: 'previous parent tab', defaultShortcut: '' },
  { id: 'cycleSubTabNext', label: 'next sub tab', defaultShortcut: 'Ctrl+Tab' },
  { id: 'cycleSubTabPrev', label: 'previous sub tab', defaultShortcut: 'Ctrl+Shift+Tab' },
  { id: 'cycleAislePrev', label: 'previous aisle', defaultShortcut: 'Alt+[' },
  { id: 'cycleAisleNext', label: 'next aisle', defaultShortcut: 'Alt+]' },
]

export const APP_COMMAND_LABELS = APP_COMMANDS.reduce<Record<AppCommandId, string>>(
  (labels, command) => ({
    ...labels,
    [command.id]: command.label,
  }),
  {} as Record<AppCommandId, string>,
)

export const DEFAULT_COMMAND_SHORTCUTS = APP_COMMANDS.reduce<Record<ShortcutId, string>>(
  (shortcuts, command) => ({
    ...shortcuts,
    [command.id]: command.defaultShortcut,
  }),
  {} as Record<ShortcutId, string>,
)
