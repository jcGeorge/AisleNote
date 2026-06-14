import { useEffect, useRef, useState } from 'react'
import type { StorageProfileStatus, ToastTone } from '../types/app'

type StorageProfileActionResult =
  | { canceled: true; status: StorageProfileStatus }
  | { ok: true; status: StorageProfileStatus; warning?: string }
  | { ok: false; error?: string; status: StorageProfileStatus }

type SerializedStateSource = string | (() => string)

type CreateNotebookPayload = {
  name: string
  locationPath: string
  serializedState: SerializedStateSource
}

type NotebookSelectorPayload = {
  notebookId?: string
  notebookPath?: string
}

type NotebookSyncTargetPayload = NotebookSelectorPayload & {
  syncTargetPath?: string
  locationPath?: string
}

type NotebookDeletePayload = NotebookSelectorPayload & {
  trashSyncTarget?: boolean
  skipConfirmation?: boolean
}

type RevealRecoveredNotebookLocationPayload = {
  messageId?: string
  signature?: string
}

type UseStorageProfileControllerParams = {
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
  beforeStorageAction?: () => Promise<void> | void
}

const STORAGE_ERROR_TOAST_DURATION_MS = 6000

export function getStorageProfileStatusToast(nextStatus: StorageProfileStatus): {
  message: string
  tone: ToastTone
  durationMs?: number
} | null {
  if (nextStatus.event === 'notebook-setup-required') return null
  if (nextStatus.event === 'external-loaded') {
    return { message: 'External notebook folder changes loaded.', tone: 'success' }
  }
  if (nextStatus.event === 'notebook-auto-recovered') return null
  if (nextStatus.status === 'error') {
    return {
      message: nextStatus.error ?? 'Notebook folder could not be loaded. Saves are paused.',
      tone: 'error',
      durationMs: STORAGE_ERROR_TOAST_DURATION_MS,
    }
  }
  return null
}

export function useStorageProfileController({ pushToast, beforeStorageAction }: UseStorageProfileControllerParams) {
  const [storageProfileStatus, setStorageProfileStatus] = useState<StorageProfileStatus | null>(null)
  const pushToastRef = useRef(pushToast)
  const beforeStorageActionRef = useRef(beforeStorageAction)

  pushToastRef.current = pushToast
  beforeStorageActionRef.current = beforeStorageAction

  useEffect(() => {
    let disposed = false
    const applyStorageProfileStatus = (nextStatus: StorageProfileStatus) => {
      setStorageProfileStatus(nextStatus)
      const toast = getStorageProfileStatusToast(nextStatus)
      if (toast) pushToastRef.current(toast.message, toast.tone, toast.durationMs)
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
    if ('canceled' in result && result.canceled) return false
    if ('ok' in result && result.ok) {
      pushToastRef.current(successMessage, 'success')
      if (result.warning) {
        pushToastRef.current(result.warning, 'warning', STORAGE_ERROR_TOAST_DURATION_MS)
      }
      return true
    }
    pushToastRef.current(
      'ok' in result ? result.error ?? 'Notebook folder action failed.' : 'Notebook folder action failed.',
      'error',
      STORAGE_ERROR_TOAST_DURATION_MS,
    )
    return false
  }

  const chooseNotebookLocation = async () => {
    const result = await window.electronAPI?.chooseNotebookLocation?.()
    if (!result) {
      pushToastRef.current('Notebook location selection is only available in the desktop app.', 'warning')
      return null
    }
    if ('canceled' in result && result.canceled) return null
    if ('ok' in result && result.ok) return result.locationPath
    pushToastRef.current(
      'ok' in result ? result.error ?? 'Notebook location selection failed.' : 'Notebook location selection failed.',
      'error',
      STORAGE_ERROR_TOAST_DURATION_MS,
    )
    return null
  }

  const chooseStorageFolder = async () => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.chooseStorageFolder?.()
    if (!result) {
      pushToastRef.current('Notebook folder selection is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook folder updated.')
  }

  const createNotebook = async ({ name, locationPath, serializedState: serializedStateSource }: CreateNotebookPayload) => {
    await beforeStorageActionRef.current?.()
    const serializedState =
      typeof serializedStateSource === 'function' ? serializedStateSource() : serializedStateSource
    const result = await window.electronAPI?.createNotebook?.({ name, locationPath, serializedState })
    if (!result) {
      pushToastRef.current('New notebook is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'New notebook created.')
  }

  const renameNotebook = async (name: string) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.renameNotebook?.({ name })
    if (!result) {
      pushToastRef.current('Notebook rename is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook renamed.')
  }

  const openNotebook = async () => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.openNotebook?.()
    if (!result) {
      pushToastRef.current('Notebook opening is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook opened.')
  }

  const normalizeNotebookSelector = (selector: string | NotebookSelectorPayload): NotebookSelectorPayload =>
    typeof selector === 'string' ? { notebookPath: selector } : selector

  const switchNotebook = async (selector: string | NotebookSelectorPayload) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.switchNotebook?.(normalizeNotebookSelector(selector))
    if (!result) {
      pushToastRef.current('Notebook switching is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook switched.')
  }

  const forgetNotebook = async (selector: string | NotebookSelectorPayload) => {
    const result = await window.electronAPI?.forgetNotebook?.(normalizeNotebookSelector(selector))
    if (!result) {
      pushToastRef.current('Notebook list management is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook removed from list.')
  }

  const deleteNotebook = async (payload: NotebookDeletePayload = {}) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.deleteNotebook?.(payload)
    if (!result) {
      pushToastRef.current('Notebook deletion is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook deleted.')
  }

  const attachNotebookSyncTarget = async (payload: NotebookSyncTargetPayload = {}) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.attachNotebookSyncTarget?.(payload)
    if (!result) {
      pushToastRef.current('Notebook sync folders are only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Sync folder attached.')
  }

  const detachNotebookSyncTarget = async (payload: NotebookSelectorPayload = {}) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.detachNotebookSyncTarget?.(payload)
    if (!result) {
      pushToastRef.current('Notebook sync folders are only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Sync folder detached.')
  }

  const reconnectNotebookSyncTarget = async (payload: NotebookSyncTargetPayload = {}) => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.reconnectNotebookSyncTarget?.(payload)
    if (!result) {
      pushToastRef.current('Notebook sync folders are only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Sync folder reconnected.')
  }

  const moveStorageProfile = async () => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.moveStorageProfile?.()
    if (!result) {
      pushToastRef.current('Notebook folder migration is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook folder moved.')
  }

  const revealStorageProfile = async () => {
    const result = await window.electronAPI?.revealStorageProfile?.()
    if (!result) {
      pushToastRef.current('Reveal folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', STORAGE_ERROR_TOAST_DURATION_MS)
  }

  const revealRecoveredNotebookLocation = async (payload: RevealRecoveredNotebookLocationPayload = {}) => {
    const result = await window.electronAPI?.revealRecoveredNotebookLocation?.(payload)
    if (!result) {
      pushToastRef.current('Reveal folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', STORAGE_ERROR_TOAST_DURATION_MS)
  }

  const retryStorageProfile = async () => {
    await beforeStorageActionRef.current?.()
    const result = await window.electronAPI?.retryStorageProfile?.()
    if (!result) {
      pushToastRef.current('Notebook folder reload is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook folder reloaded.')
  }

  return {
    storageProfileStatus,
    chooseNotebookLocation,
    chooseStorageFolder,
    createNotebook,
    renameNotebook,
    openNotebook,
    switchNotebook,
    forgetNotebook,
    deleteNotebook,
    attachNotebookSyncTarget,
    detachNotebookSyncTarget,
    reconnectNotebookSyncTarget,
    moveStorageProfile,
    revealStorageProfile,
    revealRecoveredNotebookLocation,
    retryStorageProfile,
  }
}
