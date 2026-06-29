import { useEffect, useRef } from 'react'
import type { AppState, ShortcutId, ViewMode } from '../types/app'
import { eventMatchesShortcut, normalizeHotkeySettings } from './shortcuts'

export type VaultHotkeyIntent = Extract<
  ShortcutId,
  | 'openSettings'
  | 'newNote'
  | 'newFolder'
  | 'toggleNotesTrash'
  | 'toggleNotesScratchpad'
  | 'closeCurrentNote'
  | 'cyclePinnedNoteTabNext'
  | 'cyclePinnedNoteTabPrev'
  | 'reopenClosedNoteTab'
  | 'cycleAislePrev'
  | 'cycleAisleNext'
  | 'formatStrikethrough'
  | 'formatHighlight'
  | 'pastePlainText'
>

type VaultHotkeyActions = Record<VaultHotkeyIntent, () => void> & {
  navigateHistoryBack: () => void
  navigateHistoryForward: () => void
}

const VAULT_HOTKEY_INTENTS: VaultHotkeyIntent[] = [
  'openSettings',
  'newNote',
  'newFolder',
  'toggleNotesTrash',
  'toggleNotesScratchpad',
  'closeCurrentNote',
  'cyclePinnedNoteTabNext',
  'cyclePinnedNoteTabPrev',
  'reopenClosedNoteTab',
  'cycleAislePrev',
  'cycleAisleNext',
  'formatStrikethrough',
  'formatHighlight',
  'pastePlainText',
]

const MAIN_ONLY_INTENTS = new Set<VaultHotkeyIntent>([
  'cyclePinnedNoteTabNext',
  'cyclePinnedNoteTabPrev',
  'reopenClosedNoteTab',
  'cycleAislePrev',
  'cycleAisleNext',
  'closeCurrentNote',
  'formatStrikethrough',
  'formatHighlight',
  'pastePlainText',
])

const EDITOR_TARGET_INTENTS = new Set<VaultHotkeyIntent>([
  'pastePlainText',
])

const REPEATABLE_INTENTS = new Set<VaultHotkeyIntent>([
  'cyclePinnedNoteTabNext',
  'cyclePinnedNoteTabPrev',
  'cycleAislePrev',
  'cycleAisleNext',
])

export type VaultMouseHistoryNavigationPhase = 'press' | 'release' | 'auxclick'

export type VaultMouseHistoryNavigationRecord = {
  button: number
  released: boolean
}

type VaultMouseHistoryNavigationEvent = Pick<MouseEvent, 'button'> &
  Partial<Pick<MouseEvent, 'defaultPrevented'>>

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

function isEditorContentTarget(target: EventTarget | null): boolean {
  const targetWithClosest = target as { closest?: (selector: string) => unknown } | null
  if (typeof targetWithClosest?.closest === 'function') {
    return Boolean(targetWithClosest.closest('.ProseMirror[contenteditable="true"]'))
  }
  if (typeof Element === 'undefined') return false
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('.ProseMirror[contenteditable="true"]'))
}

export function shouldIgnoreVaultHotkeyEvent(event: KeyboardEvent): boolean {
  return !hasShortcutModifier(event) && String(event.key ?? '').length === 1 && isEditableTarget(event.target)
}

export function getVaultHistoryNavigationDirection(event: KeyboardEvent, isMacPlatform: boolean): -1 | 1 | null {
  if (event.defaultPrevented) return null
  if (event.key === 'BrowserBack') return -1
  if (event.key === 'BrowserForward') return 1

  const isBracketLeft = event.key === '[' || event.code === 'BracketLeft'
  const isBracketRight = event.key === ']' || event.code === 'BracketRight'
  if (isMacPlatform && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    if (isBracketLeft) return -1
    if (isBracketRight) return 1
  }

  if (!isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (event.key === 'ArrowLeft' || event.code === 'ArrowLeft') return -1
    if (event.key === 'ArrowRight' || event.code === 'ArrowRight') return 1
  }

  return null
}

export function getVaultMouseHistoryNavigationDirection(event: VaultMouseHistoryNavigationEvent): -1 | 1 | null {
  if (event.defaultPrevented) return null
  if (event.button === 3) return -1
  if (event.button === 4) return 1
  return null
}

export function createVaultMouseHistoryNavigationRecord(
  event: VaultMouseHistoryNavigationEvent,
): VaultMouseHistoryNavigationRecord | null {
  return getVaultMouseHistoryNavigationDirection(event)
    ? { button: event.button, released: false }
    : null
}

export function shouldSuppressVaultMouseHistoryFollowup(
  event: VaultMouseHistoryNavigationEvent,
  record: VaultMouseHistoryNavigationRecord | null,
  phase: VaultMouseHistoryNavigationPhase,
): boolean {
  if (!record || getVaultMouseHistoryNavigationDirection(event) === null) return false
  if (event.button !== record.button) return false
  return phase === 'press' ? !record.released : true
}

export function updateVaultMouseHistoryNavigationRecordForFollowup(
  record: VaultMouseHistoryNavigationRecord | null,
  phase: VaultMouseHistoryNavigationPhase,
): VaultMouseHistoryNavigationRecord | null {
  if (!record) return null
  if (phase === 'auxclick') return null
  if (phase === 'release') return { ...record, released: true }
  return record
}

export function getVaultHotkeyIntent({
  event,
  hotkeys,
  isMacPlatform,
  viewMode,
}: {
  event: KeyboardEvent
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
}): VaultHotkeyIntent | null {
  if (event.defaultPrevented || shouldIgnoreVaultHotkeyEvent(event)) return null

  const normalizedHotkeys = normalizeHotkeySettings(hotkeys)
  for (const intent of VAULT_HOTKEY_INTENTS) {
    if (MAIN_ONLY_INTENTS.has(intent) && viewMode !== 'main') continue
    if (EDITOR_TARGET_INTENTS.has(intent) && !isEditorContentTarget(event.target)) continue
    const shortcut = normalizedHotkeys.shortcuts[intent]
    if (shortcut && eventMatchesShortcut(event, shortcut, isMacPlatform)) return intent
  }
  return null
}

export function useVaultHotkeys({
  hotkeys,
  isMacPlatform,
  viewMode,
  actions,
}: {
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
  actions: VaultHotkeyActions
}) {
  const actionsRef = useRef(actions)
  const mouseHistoryNavigationRef = useRef<VaultMouseHistoryNavigationRecord | null>(null)
  actionsRef.current = actions

  useEffect(() => {
    const runHistoryNavigation = (direction: -1 | 1) => {
      if (direction < 0) actionsRef.current.navigateHistoryBack()
      else actionsRef.current.navigateHistoryForward()
    }

    const consumeMouseHistoryEvent = (event: MouseEvent | PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const startMouseHistoryNavigation = (event: MouseEvent | PointerEvent) => {
      const historyDirection = getVaultMouseHistoryNavigationDirection(event)
      if (!historyDirection) return false
      consumeMouseHistoryEvent(event)
      mouseHistoryNavigationRef.current = createVaultMouseHistoryNavigationRecord(event)
      runHistoryNavigation(historyDirection)
      return true
    }

    const suppressMouseHistoryFollowup = (
      event: MouseEvent | PointerEvent,
      phase: VaultMouseHistoryNavigationPhase,
    ) => {
      if (!shouldSuppressVaultMouseHistoryFollowup(event, mouseHistoryNavigationRef.current, phase)) return false
      consumeMouseHistoryEvent(event)
      mouseHistoryNavigationRef.current = updateVaultMouseHistoryNavigationRecordForFollowup(
        mouseHistoryNavigationRef.current,
        phase,
      )
      return true
    }

    const handleKeydown = (event: KeyboardEvent) => {
      const historyDirection = getVaultHistoryNavigationDirection(event, isMacPlatform)
      if (historyDirection) {
        event.preventDefault()
        event.stopPropagation()
        runHistoryNavigation(historyDirection)
        return
      }

      const intent = getVaultHotkeyIntent({ event, hotkeys, isMacPlatform, viewMode })
      if (!intent) return

      event.preventDefault()
      event.stopPropagation()
      if (event.repeat && !REPEATABLE_INTENTS.has(intent)) return

      actionsRef.current[intent]()
    }

    const handlePointerdown = (event: PointerEvent) => {
      startMouseHistoryNavigation(event)
    }

    const handleMousedown = (event: MouseEvent) => {
      if (suppressMouseHistoryFollowup(event, 'press')) return
      startMouseHistoryNavigation(event)
    }

    const handleMouseup = (event: MouseEvent) => {
      if (suppressMouseHistoryFollowup(event, 'release')) return
      if (startMouseHistoryNavigation(event)) {
        mouseHistoryNavigationRef.current = updateVaultMouseHistoryNavigationRecordForFollowup(
          mouseHistoryNavigationRef.current,
          'release',
        )
      }
    }

    const handleAuxclick = (event: MouseEvent) => {
      if (suppressMouseHistoryFollowup(event, 'auxclick')) return
      if (startMouseHistoryNavigation(event)) {
        mouseHistoryNavigationRef.current = null
      }
    }

    window.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('pointerdown', handlePointerdown, true)
    window.addEventListener('mousedown', handleMousedown, true)
    window.addEventListener('mouseup', handleMouseup, true)
    window.addEventListener('auxclick', handleAuxclick, true)
    return () => {
      window.removeEventListener('keydown', handleKeydown, true)
      window.removeEventListener('pointerdown', handlePointerdown, true)
      window.removeEventListener('mousedown', handleMousedown, true)
      window.removeEventListener('mouseup', handleMouseup, true)
      window.removeEventListener('auxclick', handleAuxclick, true)
    }
  }, [hotkeys, isMacPlatform, viewMode])
}
