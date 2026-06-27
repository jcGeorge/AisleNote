import type { ShortcutId } from '../types/app'

export type AppCommandId = ShortcutId

export type AppCommandDefinition = {
  id: AppCommandId
  label: string
  defaultShortcut: string
}

export const APP_COMMANDS: AppCommandDefinition[] = [
  { id: 'toggleNotesTrash', label: 'toggle notes / trash', defaultShortcut: 'Mod+T' },
  { id: 'toggleNotesScratchpad', label: 'toggle notes / scratchpad', defaultShortcut: 'Mod+S' },
  { id: 'toggleNotesFilter', label: 'toggle notes / filter', defaultShortcut: '' },
  { id: 'newNote', label: 'new note', defaultShortcut: 'Mod+N' },
  { id: 'newFolder', label: 'new folder', defaultShortcut: 'Mod+Shift+N' },
  { id: 'closeCurrentNote', label: 'close current note', defaultShortcut: 'Mod+W' },
  { id: 'cyclePinnedNoteTabNext', label: 'next pinned note tab', defaultShortcut: 'Ctrl+Tab' },
  { id: 'cyclePinnedNoteTabPrev', label: 'previous pinned note tab', defaultShortcut: 'Ctrl+Shift+Tab' },
  { id: 'reopenClosedNoteTab', label: 'reopen closed note tab', defaultShortcut: 'Mod+Shift+T' },
  { id: 'formatStrikethrough', label: 'strikethrough', defaultShortcut: '' },
  { id: 'formatHighlight', label: 'highlight', defaultShortcut: 'Mod+Shift+H' },
  { id: 'cycleAislePrev', label: 'previous aisle', defaultShortcut: 'Mod+Ctrl+ArrowLeft' },
  { id: 'cycleAisleNext', label: 'next aisle', defaultShortcut: 'Mod+Ctrl+ArrowRight' },
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
