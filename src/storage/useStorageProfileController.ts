import { useEffect, useRef, useState } from 'react'
import type { StorageProfileStatus, ToastTone } from '../types/app'

type StorageProfileActionResult =
  | { canceled: true; status: StorageProfileStatus }
  | { ok: true; status: StorageProfileStatus }
  | { ok: false; error?: string; status: StorageProfileStatus }

type UseStorageProfileControllerParams = {
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

const STORAGE_ERROR_TOAST_DURATION_MS = 6000

export function useStorageProfileController({ pushToast }: UseStorageProfileControllerParams) {
  const [storageProfileStatus, setStorageProfileStatus] = useState<StorageProfileStatus | null>(null)
  const pushToastRef = useRef(pushToast)

  pushToastRef.current = pushToast

  useEffect(() => {
    let disposed = false
    const applyStorageProfileStatus = (nextStatus: StorageProfileStatus) => {
      setStorageProfileStatus(nextStatus)
      if (nextStatus.event === 'external-loaded') {
        pushToastRef.current('external storage changes loaded.', 'success')
      } else if (nextStatus.status === 'error') {
        pushToastRef.current(
          nextStatus.error ?? 'storage profile could not be loaded. saves are paused.',
          'error',
          STORAGE_ERROR_TOAST_DURATION_MS,
        )
      }
    }

    void window.electronAPI?.getStorageProfileStatus?.().then((status) => {
      if (!disposed && status) setStorageProfileStatus(status)
    })
    const unsubscribe =
      window.electronAPI?.onStorageProfileStatusUpdated?.((status) => {
        if (!disposed) applyStorageProfileStatus(status)
      }) ?? (() => undefined)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  const handleStorageProfileResult = (result: StorageProfileActionResult, successMessage: string) => {
    if ('status' in result && result.status) {
      setStorageProfileStatus(result.status)
    }
    if ('canceled' in result && result.canceled) return
    if ('ok' in result && result.ok) {
      pushToastRef.current(successMessage, 'success')
      return
    }
    pushToastRef.current(
      'ok' in result ? result.error ?? 'storage profile action failed.' : 'storage profile action failed.',
      'error',
      STORAGE_ERROR_TOAST_DURATION_MS,
    )
  }

  const chooseStorageFolder = async () => {
    const result = await window.electronAPI?.chooseStorageFolder?.()
    if (!result) {
      pushToastRef.current('sync folder selection is only available in the desktop app.', 'warning')
      return
    }
    handleStorageProfileResult(result, 'storage folder updated.')
  }

  const moveStorageProfile = async () => {
    const result = await window.electronAPI?.moveStorageProfile?.()
    if (!result) {
      pushToastRef.current('storage folder migration is only available in the desktop app.', 'warning')
      return
    }
    handleStorageProfileResult(result, 'current data moved to storage folder.')
  }

  const revealStorageProfile = async () => {
    const result = await window.electronAPI?.revealStorageProfile?.()
    if (!result) {
      pushToastRef.current('reveal folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', STORAGE_ERROR_TOAST_DURATION_MS)
  }

  const retryStorageProfile = async () => {
    const result = await window.electronAPI?.retryStorageProfile?.()
    if (!result) {
      pushToastRef.current('storage retry is only available in the desktop app.', 'warning')
      return
    }
    handleStorageProfileResult(result, 'storage profile reloaded.')
  }

  const restoreStorageRecoverySnapshot = async () => {
    const result = await window.electronAPI?.restoreStorageRecoverySnapshot?.()
    if (!result) {
      pushToastRef.current('storage recovery is only available in the desktop app.', 'warning')
      return
    }
    handleStorageProfileResult(result, 'latest recovery snapshot restored.')
  }

  return {
    storageProfileStatus,
    chooseStorageFolder,
    moveStorageProfile,
    revealStorageProfile,
    retryStorageProfile,
    restoreStorageRecoverySnapshot,
  }
}
