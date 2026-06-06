import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { appendToastToHistory, appendToastToStack } from '../components/overlays/toast-stack'
import { applyTriggeredTipState, getTipDefinition, type TipDefinition } from '../tips/tips'
import type { AppState, TipId, ToastState, ToastTone } from '../types/app'

const DEFAULT_TOAST_DURATION_MS = 6000
const HOVERED_TOAST_DURATION_MS = 4000

type ToastTimerApi = {
  setTimeout: (handler: () => void, timeout: number) => number
  clearTimeout: (timerId: number) => void
}

export function createToastTimerManager({
  timers,
  dismissToast,
  timerApi,
}: {
  timers: Map<number, number>
  dismissToast: (toastId: number) => void
  timerApi: ToastTimerApi
}) {
  const clearToastTimer = (toastId: number) => {
    const timer = timers.get(toastId)
    if (timer === undefined) return
    timerApi.clearTimeout(timer)
    timers.delete(toastId)
  }

  const clearToastTimers = () => {
    timers.forEach((timer) => timerApi.clearTimeout(timer))
    timers.clear()
  }

  const scheduleToastDismiss = (toastId: number, durationMs: number) => {
    clearToastTimer(toastId)
    const timer = timerApi.setTimeout(() => dismissToast(toastId), durationMs)
    timers.set(toastId, timer)
  }

  return {
    clearToastTimer,
    clearToastTimers,
    scheduleToastDismiss,
  }
}

type UseAppNotificationsParams = {
  state: AppState
  stateRef: { current: AppState }
  setState: Dispatch<SetStateAction<AppState>>
  isMacPlatform: boolean
}

export function canTriggerTip(
  tipId: TipId,
  ui: Pick<AppState['ui'], 'disabledTipIds'>,
  dismissedTipIdsThisSession: ReadonlySet<TipId> = new Set(),
) {
  return !ui.disabledTipIds.includes(tipId) && !dismissedTipIdsThisSession.has(tipId)
}

export function shouldRetainVisibleTip(
  tipId: TipId,
  disabledTipIds: readonly TipId[],
  options: { isMacPlatform?: boolean } = {},
) {
  const tip = getTipDefinition(tipId, options)
  return tip.autoDisableAfterShow || !disabledTipIds.includes(tipId)
}

export function getVisibleTipDefinitions(
  tipIds: readonly TipId[],
  disabledTipIds: readonly TipId[],
  options: { isMacPlatform?: boolean } = {},
): TipDefinition[] {
  return tipIds
    .filter((tipId) => shouldRetainVisibleTip(tipId, disabledTipIds, options))
    .map((tipId) => getTipDefinition(tipId, options))
}

export function useAppNotifications({
  state,
  stateRef,
  setState,
  isMacPlatform,
}: UseAppNotificationsParams) {
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [visibleTips, setVisibleTips] = useState<TipId[]>([])
  const toastTimersRef = useRef<Map<number, number>>(new Map())
  const toastHoveredRef = useRef(false)
  const toastIdRef = useRef(0)
  const toastsRef = useRef<ToastState[]>([])
  const dismissedTipIdsThisSessionRef = useRef<Set<TipId>>(new Set())

  const getToastTimerManager = () =>
    createToastTimerManager({
      timers: toastTimersRef.current,
      dismissToast,
      timerApi: {
        setTimeout: (handler, timeout) => window.setTimeout(handler, timeout),
        clearTimeout: (timerId) => window.clearTimeout(timerId),
      },
    })

  function clearToastTimer(toastId: number) {
    getToastTimerManager().clearToastTimer(toastId)
  }

  function clearToastTimers() {
    getToastTimerManager().clearToastTimers()
  }

  function dismissToast(toastId: number) {
    clearToastTimer(toastId)
    setToasts((currentToasts) => {
      const nextToasts = currentToasts.filter((toast) => toast.id !== toastId)
      toastsRef.current = nextToasts
      return nextToasts
    })
  }

  function scheduleToastDismiss(toastId: number, durationMs: number) {
    getToastTimerManager().scheduleToastDismiss(toastId, durationMs)
  }

  function createToastId() {
    const id = Math.max(Date.now(), toastIdRef.current + 1)
    toastIdRef.current = id
    return id
  }

  function pushToast(message: string, tone: ToastTone = 'warning', durationMs = DEFAULT_TOAST_DURATION_MS) {
    const toastId = createToastId()
    const nextToast: ToastState = {
      id: toastId,
      message,
      tone,
      durationMs,
    }

    setState((previous) => ({
      ...previous,
      toastHistory: appendToastToHistory(previous.toastHistory ?? [], {
        id: toastId,
        createdAt: new Date().toISOString(),
        message,
        tone,
      }),
    }))

    setToasts((currentToasts) => {
      const nextToasts = appendToastToStack(currentToasts, nextToast)
      const nextToastIds = new Set(nextToasts.map((toast) => toast.id))
      currentToasts.forEach((toast) => {
        if (!nextToastIds.has(toast.id)) clearToastTimer(toast.id)
      })
      toastsRef.current = nextToasts
      return nextToasts
    })

    if (!toastHoveredRef.current) {
      scheduleToastDismiss(nextToast.id, durationMs)
    }
  }

  function showTip(tipId: TipId) {
    const currentState = stateRef.current
    if (!canTriggerTip(tipId, currentState.ui, dismissedTipIdsThisSessionRef.current)) return

    setVisibleTips((currentTips) => (currentTips.includes(tipId) ? currentTips : [...currentTips, tipId]))
    setState((previous) => {
      const nextTipState = applyTriggeredTipState(previous.ui, tipId)
      if (
        nextTipState.seenTipIds === previous.ui.seenTipIds &&
        nextTipState.disabledTipIds === previous.ui.disabledTipIds
      ) {
        return previous
      }
      return {
        ...previous,
        ui: {
          ...previous.ui,
          seenTipIds: nextTipState.seenTipIds,
          disabledTipIds: nextTipState.disabledTipIds,
        },
      }
    })
  }

  function dismissTip(tipId: TipId) {
    dismissedTipIdsThisSessionRef.current.add(tipId)
    setVisibleTips((currentTips) => currentTips.filter((id) => id !== tipId))
  }

  function pauseToastDismissals() {
    toastHoveredRef.current = true
    clearToastTimers()
  }

  function resumeToastDismissals() {
    toastHoveredRef.current = false
    toastsRef.current.forEach((toast) => scheduleToastDismiss(toast.id, HOVERED_TOAST_DURATION_MS))
  }

  useEffect(() => {
    const timers = toastTimersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  useEffect(() => {
    setVisibleTips((currentTips) =>
      currentTips.filter((tipId) => shouldRetainVisibleTip(tipId, state.ui.disabledTipIds, { isMacPlatform })),
    )
  }, [isMacPlatform, state.ui.disabledTipIds])

  const visibleTipDefinitions = useMemo(
    () =>
      getVisibleTipDefinitions(visibleTips, state.ui.disabledTipIds, { isMacPlatform }),
    [isMacPlatform, state.ui.disabledTipIds, visibleTips],
  )

  return {
    toasts,
    visibleTipDefinitions,
    pushToast,
    showTip,
    dismissTip,
    pauseToastDismissals,
    resumeToastDismissals,
  }
}
