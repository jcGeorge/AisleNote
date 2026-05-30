import { useEffect, useRef, useState } from 'react'
import type { ToastTone, UserSettingsLocationStatus } from '../types/app'

type UserSettingsLocationActionResult =
  | { canceled: true; status: UserSettingsLocationStatus }
  | { ok: true; status: UserSettingsLocationStatus }
  | { ok: false; error?: string; status: UserSettingsLocationStatus }

type BeforeUserSettingsLocationActionOptions = {
  snapshotMode?: 'force' | 'skip'
}

type UseUserSettingsLocationControllerParams = {
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
  beforeUserSettingsLocationAction?: (options?: BeforeUserSettingsLocationActionOptions) => Promise<void> | void
}

const USER_SETTINGS_LOCATION_ERROR_TOAST_DURATION_MS = 6000

export function getUserSettingsLocationStatusToast(nextStatus: UserSettingsLocationStatus): {
  message: string
  tone: ToastTone
  durationMs?: number
} | null {
  if (nextStatus.status === 'warning' || nextStatus.status === 'error') {
    return {
      message: nextStatus.error ?? 'settings folder could not be synced.',
      tone: nextStatus.status === 'error' ? 'error' : 'warning',
      durationMs: USER_SETTINGS_LOCATION_ERROR_TOAST_DURATION_MS,
    }
  }
  if (nextStatus.event === 'settings-sync-loaded') {
    return { message: 'user settings loaded from settings folder.', tone: 'success' }
  }
  return null
}

export function useUserSettingsLocationController({
  pushToast,
  beforeUserSettingsLocationAction,
}: UseUserSettingsLocationControllerParams) {
  const [userSettingsLocationStatus, setUserSettingsLocationStatus] = useState<UserSettingsLocationStatus | null>(null)
  const pushToastRef = useRef(pushToast)
  const beforeActionRef = useRef(beforeUserSettingsLocationAction)

  pushToastRef.current = pushToast
  beforeActionRef.current = beforeUserSettingsLocationAction

  useEffect(() => {
    let disposed = false
    const applyStatus = (nextStatus: UserSettingsLocationStatus) => {
      setUserSettingsLocationStatus(nextStatus)
      const toast = getUserSettingsLocationStatusToast(nextStatus)
      if (toast) pushToastRef.current(toast.message, toast.tone, toast.durationMs)
    }

    void window.electronAPI?.getUserSettingsLocationStatus?.().then((status) => {
      if (!disposed && status) setUserSettingsLocationStatus(status)
    })
    const unsubscribe =
      window.electronAPI?.onUserSettingsLocationStatusUpdated?.((status) => {
        if (!disposed) applyStatus(status)
      }) ?? (() => undefined)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  const handleResult = (result: UserSettingsLocationActionResult, successMessage: string) => {
    if ('status' in result && result.status) {
      setUserSettingsLocationStatus(result.status)
    }
    if ('canceled' in result && result.canceled) return
    if ('ok' in result && result.ok) {
      pushToastRef.current(successMessage, 'success')
      return
    }
    pushToastRef.current(
      'ok' in result ? result.error ?? 'settings folder action failed.' : 'settings folder action failed.',
      'error',
      USER_SETTINGS_LOCATION_ERROR_TOAST_DURATION_MS,
    )
  }

  const chooseUserSettingsFolder = async () => {
    await beforeActionRef.current?.()
    const result = await window.electronAPI?.chooseUserSettingsFolder?.()
    if (!result) {
      pushToastRef.current('settings folder selection is only available in the desktop app.', 'warning')
      return
    }
    handleResult(result, 'settings folder updated.')
  }

  const revealUserSettingsFolder = async () => {
    const result = await window.electronAPI?.revealUserSettingsFolder?.()
    if (!result) {
      pushToastRef.current('reveal settings folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', USER_SETTINGS_LOCATION_ERROR_TOAST_DURATION_MS)
  }

  const retryUserSettingsSync = async () => {
    await beforeActionRef.current?.()
    const result = await window.electronAPI?.retryUserSettingsSync?.()
    if (!result) {
      pushToastRef.current('settings sync is only available in the desktop app.', 'warning')
      return
    }
    handleResult(result, 'settings sync refreshed.')
  }

  const resetUserSettingsFolder = async () => {
    const result = await window.electronAPI?.resetUserSettingsFolder?.()
    if (!result) {
      pushToastRef.current('settings folder reset is only available in the desktop app.', 'warning')
      return
    }
    handleResult(result, 'settings folder reset to local.')
  }

  return {
    userSettingsLocationStatus,
    chooseUserSettingsFolder,
    revealUserSettingsFolder,
    retryUserSettingsSync,
    resetUserSettingsFolder,
  }
}
