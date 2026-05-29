import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { buildShortcutFromKeyboardEvent, eventMatchesShortcut } from './shortcuts'
import type { AppState, ArrangeModeState, ShortcutId, Tab, TipId, ViewMode } from '../types/app'

type UseGlobalHotkeysParams = {
  viewMode: ViewMode
  activeTab: Tab
  primeTabs: Tab[]
  arrangeMode: ArrangeModeState
  hotkeys: AppState['hotkeys']
  deleteSubtabShortcutEnabled: boolean
  scratchpadActive?: boolean
  scratchpadDeleteAisleShortcutEnabled?: boolean
  isMacPlatform: boolean
  editingShortcut: ShortcutId | null
  setEditingShortcut: Dispatch<SetStateAction<ShortcutId | null>>
  updateShortcutSetting: (shortcutId: ShortcutId, nextShortcut: string) => void
  exitArrangeMode: () => void
  openSettings: () => void
  toggleSpaceRail: () => void
  toggleDomainRail: () => void
  toggleTrashView: () => void
  returnToLastTabLikeView: () => void
  navigateHistoryBy: (delta: number) => void
  showTip: (tipId: TipId) => void
  warnHomeSubtabDelete: () => void
  warnScratchpadDeleteShortcutDisabled?: () => void
  addTab: () => void
  addSubTab: () => void
  addScratchpadAisle?: () => void
  deleteFocusedSubTab: () => void
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

export function getNumberedPrimeTabTarget(tabs: Tab[], shortcutIndex: number): string | null {
  return tabs[shortcutIndex]?.id ?? null
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
  if (eventMatchesShortcut(event, hotkeys.shortcuts.openSpaces, isMacPlatform)) return 'space'
  if (eventMatchesShortcut(event, hotkeys.shortcuts.openDomains, isMacPlatform)) return 'domain'
  return null
}

export type DeleteFocusedSubtabShortcutIntent = 'show-tip' | 'delete-subtab' | 'warn-home'

export function isDeleteFocusedSubtabShortcut(event: KeyboardEvent, isMacPlatform: boolean): boolean {
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

export function getDeleteFocusedSubtabShortcutIntent({
  event,
  isMacPlatform,
  viewMode,
  arrangeActive,
  enabled,
  activeSubTabId,
}: {
  event: KeyboardEvent
  isMacPlatform: boolean
  viewMode: ViewMode
  arrangeActive: boolean
  enabled: boolean
  activeSubTabId: string | null
}): DeleteFocusedSubtabShortcutIntent | null {
  if (viewMode !== 'main' || arrangeActive) return null
  if (!isDeleteFocusedSubtabShortcut(event, isMacPlatform)) return null
  if (!enabled) return 'show-tip'
  return activeSubTabId ? 'delete-subtab' : 'warn-home'
}

export function useGlobalHotkeys({
  viewMode,
  activeTab,
  primeTabs,
  arrangeMode,
  hotkeys,
  deleteSubtabShortcutEnabled,
  scratchpadActive = false,
  scratchpadDeleteAisleShortcutEnabled = false,
  isMacPlatform,
  editingShortcut,
  setEditingShortcut,
  updateShortcutSetting,
  exitArrangeMode,
  openSettings,
  toggleSpaceRail,
  toggleDomainRail,
  toggleTrashView,
  returnToLastTabLikeView,
  navigateHistoryBy,
  showTip,
  warnHomeSubtabDelete,
  warnScratchpadDeleteShortcutDisabled = () => undefined,
  addTab,
  addSubTab,
  addScratchpadAisle = () => undefined,
  deleteFocusedSubTab,
  deleteScratchpadAisle = () => undefined,
  cycleAisle = () => undefined,
  formatStrikethrough,
  selectTab,
  selectSubTab,
}: UseGlobalHotkeysParams) {
  const aisleBracketCycleGuardRef = useRef(createAisleBracketCycleGuard())
  const actionsRef = useRef({
    setEditingShortcut,
    updateShortcutSetting,
    exitArrangeMode,
    openSettings,
    toggleSpaceRail,
    toggleDomainRail,
    toggleTrashView,
    returnToLastTabLikeView,
    navigateHistoryBy,
    showTip,
    warnHomeSubtabDelete,
    warnScratchpadDeleteShortcutDisabled,
    addTab,
    addSubTab,
    addScratchpadAisle,
    deleteFocusedSubTab,
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
    toggleTrashView,
    returnToLastTabLikeView,
    navigateHistoryBy,
    showTip,
    warnHomeSubtabDelete,
    warnScratchpadDeleteShortcutDisabled,
    addTab,
    addSubTab,
    addScratchpadAisle,
    deleteFocusedSubTab,
    deleteScratchpadAisle,
    cycleAisle,
    formatStrikethrough,
    selectTab,
    selectSubTab,
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
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

      const isSettingsShortcut =
        isMacPlatform &&
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === ',' || event.code === 'Comma')
      if (isSettingsShortcut) {
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

      const isTabTrashShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.toggleTabTrash, isMacPlatform)
      if (isTabTrashShortcut) {
        event.preventDefault()
        if (viewMode === 'main' || viewMode === 'trash') {
          actions.toggleTrashView()
          return
        }
        actions.returnToLastTabLikeView()
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

      const railVisibilityShortcutTarget = getRailVisibilityShortcutTarget(event, hotkeys, isMacPlatform)
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

      if (viewMode !== 'main') return
      if (arrangeMode.active) return

      const isCommandNewTab = eventMatchesShortcut(event, hotkeys.shortcuts.newTab, isMacPlatform)
      const isCycleNextShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleSubTabNext, isMacPlatform)
      const isCyclePrevShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)
      const isCycleAisleNextShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleAisleNext, isMacPlatform)
      const isCycleAislePrevShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleAislePrev, isMacPlatform)

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

      if (scratchpadActive) {
        if (isDeleteFocusedSubtabShortcut(event, isMacPlatform)) {
          event.preventDefault()
          if (!scratchpadDeleteAisleShortcutEnabled) {
            actions.warnScratchpadDeleteShortcutDisabled()
            return
          }
          actions.deleteScratchpadAisle()
          return
        }
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

      const deleteFocusedSubtabShortcutIntent = getDeleteFocusedSubtabShortcutIntent({
        event,
        isMacPlatform,
        viewMode,
        arrangeActive: arrangeMode.active,
        enabled: deleteSubtabShortcutEnabled,
        activeSubTabId: activeTab.activeSubTabId,
      })
      if (deleteFocusedSubtabShortcutIntent) {
        event.preventDefault()
        if (deleteFocusedSubtabShortcutIntent === 'show-tip') {
          actions.showTip('delete-subtab-shortcut')
          return
        }
        if (deleteFocusedSubtabShortcutIntent === 'warn-home') {
          actions.warnHomeSubtabDelete()
          return
        }
        actions.deleteFocusedSubTab()
        return
      }

      if (isCommandNewTab) {
        event.preventDefault()
        actions.addTab()
        return
      }

      const isCommandNewSubTab = eventMatchesShortcut(event, hotkeys.shortcuts.newSubTab, isMacPlatform)
      if (isCommandNewSubTab) {
        event.preventDefault()
        actions.addSubTab()
        return
      }

      const isFormatStrikethroughShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.formatStrikethrough, isMacPlatform)
      if (isFormatStrikethroughShortcut) {
        event.preventDefault()
        actions.formatStrikethrough()
        return
      }

      const isCycleParentNextShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleParentTabNext, isMacPlatform)
      const isCycleParentPrevShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleParentTabPrev, isMacPlatform)
      if (isCycleParentNextShortcut || isCycleParentPrevShortcut) {
        event.preventDefault()
        const direction = isCycleParentPrevShortcut ? -1 : 1
        const nextParentTabId = getCycledParentTabTarget(primeTabs, activeTab.id, direction)
        if (!nextParentTabId || nextParentTabId === activeTab.id) return
        actions.selectTab(nextParentTabId)
        return
      }

      const shortcutIndex = getShortcutIndex(event.key)
      const usesCommand = event.metaKey && !event.ctrlKey && !event.altKey

      if (usesCommand && !event.shiftKey && shortcutIndex !== null) {
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

    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    window.addEventListener('blur', resetAisleBracketCycleGuard)
    window.addEventListener('mouseup', handleMouseNavigation)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
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
    hotkeys,
    deleteSubtabShortcutEnabled,
    scratchpadActive,
    scratchpadDeleteAisleShortcutEnabled,
    arrangeMode.active,
    arrangeMode.scope,
  ])

  useEffect(() => () => aisleBracketCycleGuardRef.current.reset(), [])
}
