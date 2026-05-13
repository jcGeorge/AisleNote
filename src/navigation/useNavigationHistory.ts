import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { setActiveSpaceInActiveDomain, updateSpaceInActiveDomain } from '../state/domains'
import type { AppState, NavLocation, ViewMode } from '../types/app'

type UseNavigationHistoryParams = {
  viewMode: ViewMode
  activeSpaceId: string
  mainTabId: string
  mainSubTabId: string | null
  trashTabId: string
  trashSubTabId: string | null
  setState: Dispatch<SetStateAction<AppState>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setTrashTabId: Dispatch<SetStateAction<string>>
  setTrashSubTabId: Dispatch<SetStateAction<string | null>>
  flushPendingContent: () => void
  clearTransientUi: () => void
}

const areNavLocationsEqual = (a: NavLocation, b: NavLocation) =>
  a.viewMode === b.viewMode &&
  a.activeSpaceId === b.activeSpaceId &&
  a.mainTabId === b.mainTabId &&
  a.mainSubTabId === b.mainSubTabId &&
  a.trashTabId === b.trashTabId &&
  a.trashSubTabId === b.trashSubTabId

export function useNavigationHistory({
  viewMode,
  activeSpaceId,
  mainTabId,
  mainSubTabId,
  trashTabId,
  trashSubTabId,
  setState,
  setViewMode,
  setTrashTabId,
  setTrashSubTabId,
  flushPendingContent,
  clearTransientUi,
}: UseNavigationHistoryParams) {
  const navHistoryRef = useRef<NavLocation[]>([])
  const navIndexRef = useRef(-1)
  const isHistoryNavigationRef = useRef(false)
  const lastTabLikeViewRef = useRef<'main' | 'trash'>('main')

  const buildNavLocation = (): NavLocation => ({
    viewMode,
    activeSpaceId,
    mainTabId,
    mainSubTabId,
    trashTabId,
    trashSubTabId,
  })

  const applyNavLocation = (location: NavLocation) => {
    setState((previous) => {
      const projected = setActiveSpaceInActiveDomain(previous, location.activeSpaceId)
      const fallbackSpace = projected.spaces[0]
      const resolvedSpace = projected.spaces.find((space) => space.id === location.activeSpaceId) ?? fallbackSpace
      const resolvedSpaceId = resolvedSpace?.id ?? projected.activeSpaceId

      return updateSpaceInActiveDomain(setActiveSpaceInActiveDomain(projected, resolvedSpaceId), resolvedSpaceId, (space) => {
        const data = space.data
        const resolvedTabId = data.tabs.some((tab) => tab.id === location.mainTabId)
          ? location.mainTabId
          : data.tabs[0]?.id ?? data.activeTabId

        const tabs = data.tabs.map((tab) => {
          if (tab.id !== resolvedTabId) return tab
          const resolvedSubTabId =
            location.mainSubTabId && tab.subTabs.some((sub) => sub.id === location.mainSubTabId)
              ? location.mainSubTabId
              : null
          return tab.activeSubTabId === resolvedSubTabId ? tab : { ...tab, activeSubTabId: resolvedSubTabId }
        })

        return {
          ...space,
          data: {
            ...data,
            activeTabId: resolvedTabId,
            tabs,
          },
        }
      })
    })

    setTrashTabId(location.trashTabId)
    setTrashSubTabId(location.trashSubTabId)
    setViewMode(location.viewMode)
    clearTransientUi()
  }

  const navigateHistoryBy = (delta: number) => {
    const history = navHistoryRef.current
    if (history.length === 0) return
    const nextIndex = navIndexRef.current + delta
    if (nextIndex < 0 || nextIndex >= history.length) return
    flushPendingContent()
    navIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    applyNavLocation(history[nextIndex])
  }

  const navigateToLastTabLikeLocation = () => {
    const history = navHistoryRef.current
    for (let index = navIndexRef.current - 1; index >= 0; index -= 1) {
      const candidate = history[index]
      if (candidate.viewMode !== 'main' && candidate.viewMode !== 'trash') continue
      flushPendingContent()
      navIndexRef.current = index
      isHistoryNavigationRef.current = true
      applyNavLocation(candidate)
      return true
    }
    return false
  }

  const returnToLastTabLikeView = () => {
    clearTransientUi()
    if (navigateToLastTabLikeLocation()) return
    setViewMode(lastTabLikeViewRef.current)
  }

  useEffect(() => {
    if (viewMode === 'main' || viewMode === 'trash') {
      lastTabLikeViewRef.current = viewMode
    }
  }, [viewMode])

  useEffect(() => {
    const snapshot = buildNavLocation()
    const history = navHistoryRef.current

    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    if (history.length === 0) {
      history.push(snapshot)
      navIndexRef.current = 0
      return
    }

    const activeHistory = history.slice(0, navIndexRef.current + 1)
    const current = activeHistory[activeHistory.length - 1]
    if (current && areNavLocationsEqual(current, snapshot)) return

    const collapsedHistory = activeHistory.filter((entry) => !areNavLocationsEqual(entry, snapshot))
    history.splice(0, history.length, ...collapsedHistory, snapshot)
    navIndexRef.current = history.length - 1
  }, [viewMode, activeSpaceId, mainTabId, mainSubTabId, trashTabId, trashSubTabId])

  return {
    navigateHistoryBy,
    navigateToLastTabLikeLocation,
    returnToLastTabLikeView,
  }
}
