import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { buildShortcutFromKeyboardEvent, eventMatchesShortcut } from './shortcuts'
import type { AppState, ArrangeModeState, ShortcutId, Tab, ViewMode } from '../types/app'

type UseGlobalHotkeysParams = {
  viewMode: ViewMode
  activeTab: Tab
  arrangeMode: ArrangeModeState
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  editingShortcut: ShortcutId | null
  setEditingShortcut: Dispatch<SetStateAction<ShortcutId | null>>
  updateShortcutSetting: (shortcutId: ShortcutId, nextShortcut: string) => void
  exitArrangeMode: () => void
  openSettings: () => void
  openSpacesView: () => void
  openDomainsView: () => void
  toggleTrashView: () => void
  returnToLastTabLikeView: () => void
  navigateHistoryBy: (delta: number) => void
  addTab: () => void
  addSubTab: () => void
  selectTab: (tabId: string) => void
  selectSubTab: (subTabId: string) => void
}

const getShortcutIndex = (key: string): number | null => {
  if (key >= '1' && key <= '9') return Number(key) - 1
  if (key === '0') return 9
  return null
}

export function useGlobalHotkeys({
  viewMode,
  activeTab,
  arrangeMode,
  hotkeys,
  isMacPlatform,
  editingShortcut,
  setEditingShortcut,
  updateShortcutSetting,
  exitArrangeMode,
  openSettings,
  openSpacesView,
  openDomainsView,
  toggleTrashView,
  returnToLastTabLikeView,
  navigateHistoryBy,
  addTab,
  addSubTab,
  selectTab,
  selectSubTab,
}: UseGlobalHotkeysParams) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (viewMode === 'settings' && editingShortcut) {
        event.preventDefault()
        if (event.key === 'Escape') {
          setEditingShortcut(null)
          return
        }
        const nextShortcut = buildShortcutFromKeyboardEvent(event, isMacPlatform)
        if (!nextShortcut) return
        updateShortcutSetting(editingShortcut, nextShortcut)
        setEditingShortcut(null)
        return
      }

      if (arrangeMode.active && event.key === 'Escape') {
        event.preventDefault()
        exitArrangeMode()
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
        openSettings()
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

      if (hotkeys.enableGenericHistoryHotkeys && (isCommandBracketBack || isAltArrowBack || isBrowserBackKey)) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      if (hotkeys.enableGenericHistoryHotkeys && (isCommandBracketForward || isAltArrowForward || isBrowserForwardKey)) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isTabTrashShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.toggleTabTrash, isMacPlatform)
      if (isTabTrashShortcut) {
        event.preventDefault()
        if (viewMode === 'spaces' && arrangeMode.active && arrangeMode.scope === 'spaces') {
          return
        }
        if (viewMode === 'main' || viewMode === 'trash') {
          toggleTrashView()
          return
        }
        returnToLastTabLikeView()
        return
      }

      const isHistoryBackShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'Backquote'
      if (isHistoryBackShortcut) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      const isHistoryForwardShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.code === 'Backquote'
      if (isHistoryForwardShortcut) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isSpacesShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.openSpaces, isMacPlatform)
      if (isSpacesShortcut) {
        event.preventDefault()
        openSpacesView()
        return
      }

      const isDomainsShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.openDomains, isMacPlatform)
      if (isDomainsShortcut) {
        event.preventDefault()
        openDomainsView()
        return
      }

      if (viewMode !== 'main') return
      if (arrangeMode.active) return

      const isCommandNewTab = eventMatchesShortcut(event, hotkeys.shortcuts.newTab, isMacPlatform)
      if (isCommandNewTab) {
        event.preventDefault()
        addTab()
        return
      }

      const isCommandNewSubTab = eventMatchesShortcut(event, hotkeys.shortcuts.newSubTab, isMacPlatform)
      if (isCommandNewSubTab) {
        event.preventDefault()
        addSubTab()
        return
      }

      const shortcutIndex = getShortcutIndex(event.key)
      const usesCommand = event.metaKey && !event.ctrlKey && !event.altKey

      if (usesCommand && !event.shiftKey && shortcutIndex !== null) {
        event.preventDefault()

        const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
        const nextChild = childTargets[shortcutIndex]
        if (nextChild === undefined) return
        if (nextChild === null) {
          selectTab(activeTab.id)
          return
        }
        selectSubTab(nextChild)
        return
      }

      const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
      if (childTargets.length === 0) return

      const isCycleNextShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleSubTabNext, isMacPlatform)
      const isCyclePrevShortcut = eventMatchesShortcut(event, hotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)
      if (!isCycleNextShortcut && !isCyclePrevShortcut) return

      event.preventDefault()

      const currentIndex = activeTab.activeSubTabId ? childTargets.findIndex((id) => id === activeTab.activeSubTabId) : 0
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      const direction = isCyclePrevShortcut ? -1 : 1
      const nextIndex = (safeCurrentIndex + direction + childTargets.length) % childTargets.length
      const nextChild = childTargets[nextIndex]

      if (nextChild === null) {
        selectTab(activeTab.id)
        return
      }

      selectSubTab(nextChild)
    }

    const handleMouseNavigation = (event: globalThis.MouseEvent) => {
      if (!hotkeys.enableMouseBackForward) return
      if (event.button === 3) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }
      if (event.button === 4) {
        event.preventDefault()
        navigateHistoryBy(1)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('mouseup', handleMouseNavigation)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('mouseup', handleMouseNavigation)
    }
  }, [
    viewMode,
    activeTab.id,
    activeTab.subTabs,
    activeTab.activeSubTabId,
    editingShortcut,
    isMacPlatform,
    hotkeys,
    arrangeMode.active,
    arrangeMode.scope,
  ])
}
