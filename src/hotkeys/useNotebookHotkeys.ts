import { useEffect, useRef } from 'react'
import type { AppState, ShortcutId, ViewMode } from '../types/app'
import { eventMatchesShortcut, normalizeHotkeySettings } from './shortcuts'

export type NotebookHotkeyIntent = Extract<
  ShortcutId,
  | 'openSettings'
  | 'newNote'
  | 'newFolder'
  | 'toggleNotesTrash'
  | 'toggleNotesFilter'
  | 'cycleAislePrev'
  | 'cycleAisleNext'
  | 'formatStrikethrough'
>

type NotebookHotkeyActions = Record<NotebookHotkeyIntent, () => void>

const NOTEBOOK_HOTKEY_INTENTS: NotebookHotkeyIntent[] = [
  'openSettings',
  'newNote',
  'newFolder',
  'toggleNotesTrash',
  'toggleNotesFilter',
  'cycleAislePrev',
  'cycleAisleNext',
  'formatStrikethrough',
]

const MAIN_ONLY_INTENTS = new Set<NotebookHotkeyIntent>([
  'cycleAislePrev',
  'cycleAisleNext',
  'formatStrikethrough',
])

function hasShortcutModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

function isEditableTarget(target: EventTarget | null): boolean {
  const targetWithClosest = target as { closest?: (selector: string) => unknown } | null
  if (typeof targetWithClosest?.closest === 'function') {
    return Boolean(targetWithClosest.closest('input, textarea, select, [contenteditable="true"]'))
  }
  if (typeof Element === 'undefined') return false
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function shouldIgnoreNotebookHotkeyEvent(event: KeyboardEvent): boolean {
  return !hasShortcutModifier(event) && String(event.key ?? '').length === 1 && isEditableTarget(event.target)
}

export function getNotebookHotkeyIntent({
  event,
  hotkeys,
  isMacPlatform,
  viewMode,
}: {
  event: KeyboardEvent
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
}): NotebookHotkeyIntent | null {
  if (event.defaultPrevented || shouldIgnoreNotebookHotkeyEvent(event)) return null

  const normalizedHotkeys = normalizeHotkeySettings(hotkeys)
  for (const intent of NOTEBOOK_HOTKEY_INTENTS) {
    if (MAIN_ONLY_INTENTS.has(intent) && viewMode !== 'main') continue
    const shortcut = normalizedHotkeys.shortcuts[intent]
    if (shortcut && eventMatchesShortcut(event, shortcut, isMacPlatform)) return intent
  }
  return null
}

export function useNotebookHotkeys({
  hotkeys,
  isMacPlatform,
  viewMode,
  actions,
}: {
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
  actions: NotebookHotkeyActions
}) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const intent = getNotebookHotkeyIntent({ event, hotkeys, isMacPlatform, viewMode })
      if (!intent) return

      event.preventDefault()
      event.stopPropagation()
      if (event.repeat && intent !== 'cycleAislePrev' && intent !== 'cycleAisleNext') return

      actionsRef.current[intent]()
    }

    window.addEventListener('keydown', handleKeydown, true)
    return () => window.removeEventListener('keydown', handleKeydown, true)
  }, [hotkeys, isMacPlatform, viewMode])
}
