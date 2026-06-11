import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { buildShortcutFromKeyboardEvent, eventMatchesShortcut, normalizeHotkeySettings } from './shortcuts'
import type { AppState, ArrangeModeState, ShortcutId, Tab, TipId, ViewMode } from '../types/app'

type UseGlobalHotkeysParams = {
  viewMode: ViewMode
  activeTab: Tab
  primeTabs: Tab[]
  arrangeMode: ArrangeModeState
  hotkeys: AppState['hotkeys']
  deleteActiveAisleShortcutEnabled: boolean
  scratchpadActive?: boolean
  shortcutsSuspended?: boolean
  isMacPlatform: boolean
  editingShortcut: ShortcutId | null
  setEditingShortcut: Dispatch<SetStateAction<ShortcutId | null>>
  updateShortcutSetting: (shortcutId: ShortcutId, nextShortcut: string) => void
  exitArrangeMode: () => void
  openSettings: () => void
  toggleSpaceRail: () => void
  toggleDomainRail: () => void
  toggleNotesTrash: () => void
  toggleNotesScratchpad: () => void
  toggleNotesFilter: () => void
  navigateHistoryBy: (delta: number) => void
  showTip: (tipId: TipId) => void
  cycleUtilityChild?: (direction: -1 | 1) => void
  addTab: () => void
  addSubTab: () => void
  addScratchpadAisle?: () => void
  deleteActiveAisle: () => void
  deleteScratchpadAisle?: () => void
  cycleAisle?: (direction: -1 | 1) => void
  formatStrikethrough: () => void
  selectTab: (tabId: string) => void
  selectSubTab: (subTabId: string) => void
}

const getShortcutIndex = (key: string): number | null => {
  if (key >= '1' && key <= '9') return Number(key) - 1
  if (key === '0') return 9
  return null
}

function usesPlatformPrimaryModifier(event: KeyboardEvent, isMacPlatform: boolean): boolean {
  if (event.altKey || event.shiftKey) return false
  return isMacPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
}

export function getNumberedPrimeTabTarget(tabs: Tab[], shortcutIndex: number): string | null {
  return tabs[shortcutIndex]?.id ?? null
}

export function getNumberedPrimeTabShortcutIndex(event: KeyboardEvent, isMacPlatform: boolean): number | null {
  if (!usesPlatformPrimaryModifier(event, isMacPlatform)) return null
  return getShortcutIndex(event.key)
}

export function getCycledParentTabTarget(tabs: Tab[], activeTabId: string, direction: -1 | 1): string | null {
  if (tabs.length === 0) return null
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0
  const nextIndex = (safeActiveIndex + direction + tabs.length) % tabs.length
  return tabs[nextIndex]?.id ?? null
}

export function getCycledAisleTarget(aisleIds: string[], activeAisleId: string, direction: -1 | 1): string | null {
  if (aisleIds.length <= 1) return null
  const activeIndex = aisleIds.findIndex((aisleId) => aisleId === activeAisleId)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0
  const nextIndex = (safeActiveIndex + direction + aisleIds.length) % aisleIds.length
  return aisleIds[nextIndex] ?? null
}

export const AISLE_BRACKET_CHORD_GUARD_MS = 40

export type AisleCycleBracketKey = 'left' | 'right'

type AisleBracketCycleGuardTimer = ReturnType<typeof globalThis.setTimeout>

type AisleBracketCycleGuardOptions = {
  delayMs?: number
  setTimeoutFn?: typeof globalThis.setTimeout
  clearTimeoutFn?: typeof globalThis.clearTimeout
}

type HandleAisleBracketCycleKeydownOptions = {
  bracketKey: AisleCycleBracketKey
  direction: -1 | 1
  repeat?: boolean
  run: (direction: -1 | 1) => void
}

export function getAisleCycleBracketKey(event: Pick<KeyboardEvent, 'code'>): AisleCycleBracketKey | null {
  if (event.code === 'BracketLeft') return 'left'
  if (event.code === 'BracketRight') return 'right'
  return null
}

export function createAisleBracketCycleGuard({
  delayMs = AISLE_BRACKET_CHORD_GUARD_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
}: AisleBracketCycleGuardOptions = {}) {
  const heldKeys = new Set<AisleCycleBracketKey>()
  let pending:
    | {
        bracketKey: AisleCycleBracketKey
        timer: AisleBracketCycleGuardTimer
      }
    | null = null
  let suppressUntilRelease = false

  const cancelPending = () => {
    if (!pending) return
    clearTimeoutFn(pending.timer)
    pending = null
  }

  const reset = () => {
    cancelPending()
    heldKeys.clear()
    suppressUntilRelease = false
  }

  const handleKeydown = ({ bracketKey, direction, repeat = false, run }: HandleAisleBracketCycleKeydownOptions) => {
    heldKeys.add(bracketKey)
    const oppositeBracketKey: AisleCycleBracketKey = bracketKey === 'left' ? 'right' : 'left'

    if (heldKeys.has(oppositeBracketKey) || pending?.bracketKey === oppositeBracketKey) {
      cancelPending()
      suppressUntilRelease = true
      return
    }

    if (suppressUntilRelease) return

    if (repeat) {
      if (!pending) {
        run(direction)
      }
      return
    }

    cancelPending()
    const timer = setTimeoutFn(() => {
      pending = null
      if (!suppressUntilRelease) {
        run(direction)
      }
    }, delayMs)
    pending = { bracketKey, timer }
  }

  const handleKeyup = (bracketKey: AisleCycleBracketKey) => {
    heldKeys.delete(bracketKey)
    if (heldKeys.size === 0) {
      suppressUntilRelease = false
    }
  }

  return {
    handleKeydown,
    handleKeyup,
    reset,
  }
}

export function getRailVisibilityShortcutTarget(
  event: KeyboardEvent,
  hotkeys: AppState['hotkeys'],
  isMacPlatform: boolean,
): 'space' | 'domain' | null {
  const normalizedHotkeys = normalizeHotkeySettings(hotkeys)
  if (eventMatchesShortcut(event, normalizedHotkeys.shortcuts.openSpaces, isMacPlatform)) return 'space'
  if (eventMatchesShortcut(event, normalizedHotkeys.shortcuts.openDomains, isMacPlatform)) return 'domain'
  return null
}

export function getCapturedRailVisibilityShortcutTarget({
  event,
  hotkeys,
  isMacPlatform,
  viewMode,
  editingShortcut,
}: {
  event: KeyboardEvent
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
  editingShortcut: ShortcutId | null
}): 'space' | 'domain' | null {
  if (viewMode === 'settings' && editingShortcut) return null
  return getRailVisibilityShortcutTarget(event, hotkeys, isMacPlatform)
}

export type DeleteActiveAisleShortcutIntent = 'show-tip' | 'delete-active-aisle'
export type DeleteActiveAisleShortcutCaptureResult =
  | 'ignored'
  | 'show-tip'
  | 'delete-active-aisle'
  | 'delete-scratchpad-aisle'

export function isDeleteActiveAisleShortcut(event: KeyboardEvent, isMacPlatform: boolean): boolean {
  const isW = event.code === 'KeyW' || event.key?.toLowerCase?.() === 'w'
  if (!isW || event.altKey || event.shiftKey) return false
  return isMacPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
}

export function isPrimaryNewAisleShortcut(event: KeyboardEvent, isMacPlatform: boolean): boolean {
  const isN = event.code === 'KeyN' || event.key?.toLowerCase?.() === 'n'
  if (!isN || event.altKey || event.shiftKey) return false
  return isMacPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
}

export function isSettingsShortcut(event: KeyboardEvent, isMacPlatform: boolean): boolean {
  if (event.key !== ',' && event.code !== 'Comma') return false
  return usesPlatformPrimaryModifier(event, isMacPlatform)
}

export function getUtilityChildCycleShortcutDirection({
  event,
  hotkeys,
  isMacPlatform,
  viewMode,
}: {
  event: KeyboardEvent
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  viewMode: ViewMode
}): -1 | 1 | null {
  if (viewMode !== 'settings' && viewMode !== 'messages' && viewMode !== 'about') return null
  const normalizedHotkeys = normalizeHotkeySettings(hotkeys)
  if (eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleSubTabNext, isMacPlatform)) return 1
  if (eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)) return -1
  return null
}

export function getDeleteActiveAisleShortcutIntent({
  event,
  isMacPlatform,
  viewMode,
  arrangeActive,
  enabled,
}: {
  event: KeyboardEvent
  isMacPlatform: boolean
  viewMode: ViewMode
  arrangeActive: boolean
  enabled: boolean
}): DeleteActiveAisleShortcutIntent | null {
  if (viewMode !== 'main' || arrangeActive) return null
  if (!isDeleteActiveAisleShortcut(event, isMacPlatform)) return null
  if (!enabled) return 'show-tip'
  return 'delete-active-aisle'
}

export function handleDeleteActiveAisleShortcutCapture({
  event,
  isMacPlatform,
  viewMode,
  arrangeActive,
  deleteActiveAisleShortcutEnabled,
  scratchpadActive,
  actions,
}: {
  event: KeyboardEvent
  isMacPlatform: boolean
  viewMode: ViewMode
  arrangeActive: boolean
  deleteActiveAisleShortcutEnabled: boolean
  scratchpadActive: boolean
  actions: {
    showTip: (tipId: TipId) => void
    deleteActiveAisle: () => void
    deleteScratchpadAisle: () => void
  }
}): DeleteActiveAisleShortcutCaptureResult {
  if (viewMode !== 'main' || arrangeActive) return 'ignored'
  if (!isDeleteActiveAisleShortcut(event, isMacPlatform)) return 'ignored'

  event.preventDefault()
  event.stopPropagation()

  if (!deleteActiveAisleShortcutEnabled) {
    actions.showTip('delete-active-aisle-shortcut')
    return 'show-tip'
  }

  if (scratchpadActive) {
    actions.deleteScratchpadAisle()
    return 'delete-scratchpad-aisle'
  }

  actions.deleteActiveAisle()
  return 'delete-active-aisle'
}

export function useGlobalHotkeys({
  viewMode,
  activeTab,
  primeTabs,
  arrangeMode,
  hotkeys,
  deleteActiveAisleShortcutEnabled,
  scratchpadActive = false,
  shortcutsSuspended = false,
  isMacPlatform,
  editingShortcut,
  setEditingShortcut,
  updateShortcutSetting,
  exitArrangeMode,
  openSettings,
  toggleSpaceRail,
  toggleDomainRail,
  toggleNotesTrash,
  toggleNotesScratchpad,
  toggleNotesFilter,
  navigateHistoryBy,
  showTip,
  cycleUtilityChild = () => undefined,
  addTab,
  addSubTab,
  addScratchpadAisle = () => undefined,
  deleteActiveAisle,
  deleteScratchpadAisle = () => undefined,
  cycleAisle = () => undefined,
  formatStrikethrough,
  selectTab,
  selectSubTab,
}: UseGlobalHotkeysParams) {
  const aisleBracketCycleGuardRef = useRef(createAisleBracketCycleGuard())
  const normalizedHotkeys = useMemo(() => normalizeHotkeySettings(hotkeys), [hotkeys])
  const scratchpadActiveRef = useRef(scratchpadActive)
  const shortcutsSuspendedRef = useRef(shortcutsSuspended)
  const actionsRef = useRef({
    setEditingShortcut,
    updateShortcutSetting,
    exitArrangeMode,
    openSettings,
    toggleSpaceRail,
    toggleDomainRail,
    toggleNotesTrash,
    toggleNotesScratchpad,
    toggleNotesFilter,
    navigateHistoryBy,
    showTip,
    cycleUtilityChild,
    addTab,
    addSubTab,
    addScratchpadAisle,
    deleteActiveAisle,
    deleteScratchpadAisle,
    cycleAisle,
    formatStrikethrough,
    selectTab,
    selectSubTab,
  })

  actionsRef.current = {
    setEditingShortcut,
    updateShortcutSetting,
    exitArrangeMode,
    openSettings,
    toggleSpaceRail,
    toggleDomainRail,
    toggleNotesTrash,
    toggleNotesScratchpad,
    toggleNotesFilter,
    navigateHistoryBy,
    showTip,
    cycleUtilityChild,
    addTab,
    addSubTab,
    addScratchpadAisle,
    deleteActiveAisle,
    deleteScratchpadAisle,
    cycleAisle,
    formatStrikethrough,
    selectTab,
    selectSubTab,
  }
  scratchpadActiveRef.current = scratchpadActive
  shortcutsSuspendedRef.current = shortcutsSuspended

  useEffect(() => {
    const handleCapturedKeydown = (event: KeyboardEvent) => {
      if (shortcutsSuspendedRef.current) return
      const railVisibilityShortcutTarget = getCapturedRailVisibilityShortcutTarget({
        event,
        hotkeys: normalizedHotkeys,
        isMacPlatform,
        viewMode,
        editingShortcut,
      })
      if (railVisibilityShortcutTarget) {
        event.preventDefault()
        event.stopPropagation()
        if (event.repeat) return
        if (railVisibilityShortcutTarget === 'space') {
          actionsRef.current.toggleSpaceRail()
          return
        }
        actionsRef.current.toggleDomainRail()
        return
      }

      const deleteFocusedShortcutResult = handleDeleteActiveAisleShortcutCapture({
        event,
        isMacPlatform,
        viewMode,
        arrangeActive: arrangeMode.active,
        deleteActiveAisleShortcutEnabled,
        scratchpadActive: scratchpadActiveRef.current,
        actions: {
          showTip: actionsRef.current.showTip,
          deleteActiveAisle: actionsRef.current.deleteActiveAisle,
          deleteScratchpadAisle: actionsRef.current.deleteScratchpadAisle,
        },
      })
      if (deleteFocusedShortcutResult !== 'ignored') return
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (shortcutsSuspendedRef.current) return
      const actions = actionsRef.current

      if (viewMode === 'settings' && editingShortcut) {
        event.preventDefault()
        if (event.key === 'Escape') {
          actions.setEditingShortcut(null)
          return
        }
        const nextShortcut = buildShortcutFromKeyboardEvent(event, isMacPlatform)
        if (!nextShortcut) return
        actions.updateShortcutSetting(editingShortcut, nextShortcut)
        actions.setEditingShortcut(null)
        return
      }

      if (arrangeMode.active && event.key === 'Escape') {
        event.preventDefault()
        actions.exitArrangeMode()
        return
      }

      if (isSettingsShortcut(event, isMacPlatform)) {
        event.preventDefault()
        actions.openSettings()
        return
      }

      const isCommandBracketBack =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '['
      const isCommandBracketForward =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === ']'
      const isAltArrowBack =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowLeft'
      const isAltArrowForward =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowRight'
      const isBrowserBackKey = event.key === 'BrowserBack'
      const isBrowserForwardKey = event.key === 'BrowserForward'

      if (isCommandBracketBack || isAltArrowBack || isBrowserBackKey) {
        event.preventDefault()
        actions.navigateHistoryBy(-1)
        return
      }

      if (isCommandBracketForward || isAltArrowForward || isBrowserForwardKey) {
        event.preventDefault()
        actions.navigateHistoryBy(1)
        return
      }

      const isToggleNotesTrashShortcut = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.toggleNotesTrash, isMacPlatform)
      if (isToggleNotesTrashShortcut) {
        event.preventDefault()
        actions.toggleNotesTrash()
        return
      }

      const isToggleNotesScratchpadShortcut = eventMatchesShortcut(
        event,
        normalizedHotkeys.shortcuts.toggleNotesScratchpad,
        isMacPlatform,
      )
      if (isToggleNotesScratchpadShortcut) {
        event.preventDefault()
        actions.toggleNotesScratchpad()
        return
      }

      const isToggleNotesFilterShortcut = eventMatchesShortcut(
        event,
        normalizedHotkeys.shortcuts.toggleNotesFilter,
        isMacPlatform,
      )
      if (isToggleNotesFilterShortcut) {
        event.preventDefault()
        actions.toggleNotesFilter()
        return
      }

      const isHistoryBackShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'Backquote'
      if (isHistoryBackShortcut) {
        event.preventDefault()
        actions.navigateHistoryBy(-1)
        return
      }

      const isHistoryForwardShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.code === 'Backquote'
      if (isHistoryForwardShortcut) {
        event.preventDefault()
        actions.navigateHistoryBy(1)
        return
      }

      const railVisibilityShortcutTarget = getRailVisibilityShortcutTarget(event, normalizedHotkeys, isMacPlatform)
      if (railVisibilityShortcutTarget === 'space') {
        event.preventDefault()
        actions.toggleSpaceRail()
        return
      }

      if (railVisibilityShortcutTarget === 'domain') {
        event.preventDefault()
        actions.toggleDomainRail()
        return
      }

      const isCycleNextShortcut = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleSubTabNext, isMacPlatform)
      const isCyclePrevShortcut = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)
      if (
        viewMode !== 'main' &&
        (viewMode === 'settings' || viewMode === 'messages' || viewMode === 'about') &&
        (isCycleNextShortcut || isCyclePrevShortcut)
      ) {
        event.preventDefault()
        actions.cycleUtilityChild(isCyclePrevShortcut ? -1 : 1)
        return
      }

      if (viewMode !== 'main') return
      if (arrangeMode.active) return

      const isCommandNewTab = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.newTab, isMacPlatform)
      const isCycleAisleNextShortcut = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleAisleNext, isMacPlatform)
      const isCycleAislePrevShortcut = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.cycleAislePrev, isMacPlatform)

      if (isCycleAisleNextShortcut || isCycleAislePrevShortcut) {
        event.preventDefault()
        const direction = isCycleAislePrevShortcut ? -1 : 1
        const bracketKey = getAisleCycleBracketKey(event)
        if (bracketKey) {
          aisleBracketCycleGuardRef.current.handleKeydown({
            bracketKey,
            direction,
            repeat: event.repeat,
            run: (nextDirection) => actionsRef.current.cycleAisle(nextDirection),
          })
        } else {
          actions.cycleAisle(direction)
        }
        return
      }

      if (scratchpadActiveRef.current) {
        if (isPrimaryNewAisleShortcut(event, isMacPlatform) || isCommandNewTab) {
          event.preventDefault()
          actions.addScratchpadAisle()
          return
        }
        if (isCycleNextShortcut || isCyclePrevShortcut) {
          event.preventDefault()
          return
        }
      }

      if (isCommandNewTab) {
        event.preventDefault()
        actions.addTab()
        return
      }

      const isCommandNewSubTab = eventMatchesShortcut(event, normalizedHotkeys.shortcuts.newSubTab, isMacPlatform)
      if (isCommandNewSubTab) {
        event.preventDefault()
        actions.addSubTab()
        return
      }

      const isFormatStrikethroughShortcut = eventMatchesShortcut(
        event,
        normalizedHotkeys.shortcuts.formatStrikethrough,
        isMacPlatform,
      )
      if (isFormatStrikethroughShortcut) {
        event.preventDefault()
        actions.formatStrikethrough()
        return
      }

      const isCycleParentNextShortcut = eventMatchesShortcut(
        event,
        normalizedHotkeys.shortcuts.cycleParentTabNext,
        isMacPlatform,
      )
      const isCycleParentPrevShortcut = eventMatchesShortcut(
        event,
        normalizedHotkeys.shortcuts.cycleParentTabPrev,
        isMacPlatform,
      )
      if (isCycleParentNextShortcut || isCycleParentPrevShortcut) {
        event.preventDefault()
        const direction = isCycleParentPrevShortcut ? -1 : 1
        const nextParentTabId = getCycledParentTabTarget(primeTabs, activeTab.id, direction)
        if (!nextParentTabId || nextParentTabId === activeTab.id) return
        actions.selectTab(nextParentTabId)
        return
      }

      const shortcutIndex = getNumberedPrimeTabShortcutIndex(event, isMacPlatform)

      if (shortcutIndex !== null) {
        event.preventDefault()

        const nextPrimeTabId = getNumberedPrimeTabTarget(primeTabs, shortcutIndex)
        if (!nextPrimeTabId) return
        actions.selectTab(nextPrimeTabId)
        return
      }

      const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
      if (childTargets.length === 0) return

      if (!isCycleNextShortcut && !isCyclePrevShortcut) return

      event.preventDefault()

      const currentIndex = activeTab.activeSubTabId ? childTargets.findIndex((id) => id === activeTab.activeSubTabId) : 0
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      const direction = isCyclePrevShortcut ? -1 : 1
      const nextIndex = (safeCurrentIndex + direction + childTargets.length) % childTargets.length
      const nextChild = childTargets[nextIndex]

      if (nextChild === null) {
        actions.selectTab(activeTab.id)
        return
      }

      actions.selectSubTab(nextChild)
    }

    const handleKeyup = (event: KeyboardEvent) => {
      const bracketKey = getAisleCycleBracketKey(event)
      if (bracketKey) {
        aisleBracketCycleGuardRef.current.handleKeyup(bracketKey)
      }
    }

    const resetAisleBracketCycleGuard = () => {
      aisleBracketCycleGuardRef.current.reset()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetAisleBracketCycleGuard()
      }
    }

    const handleMouseNavigation = (event: globalThis.MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault()
        actionsRef.current.navigateHistoryBy(-1)
        return
      }
      if (event.button === 4) {
        event.preventDefault()
        actionsRef.current.navigateHistoryBy(1)
      }
    }

    window.addEventListener('keydown', handleCapturedKeydown, true)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    window.addEventListener('blur', resetAisleBracketCycleGuard)
    window.addEventListener('mouseup', handleMouseNavigation)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleCapturedKeydown, true)
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('keyup', handleKeyup)
      window.removeEventListener('blur', resetAisleBracketCycleGuard)
      window.removeEventListener('mouseup', handleMouseNavigation)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    viewMode,
    activeTab.id,
    activeTab.subTabs,
    activeTab.activeSubTabId,
    primeTabs,
    editingShortcut,
    isMacPlatform,
    normalizedHotkeys,
    deleteActiveAisleShortcutEnabled,
    scratchpadActive,
    arrangeMode.active,
    arrangeMode.scope,
  ])

  useEffect(() => () => aisleBracketCycleGuardRef.current.reset(), [])
}
