import { useEffect, useRef, useState } from 'react'
import type { StorageProfileStatus, ToastTone } from '../types/app'

type StorageProfileActionResult =
  | { canceled: true; status: StorageProfileStatus }
  | { ok: true; status: StorageProfileStatus; warning?: string }
  | { ok: false; error?: string; status: StorageProfileStatus }

type CreateNotebookPayload = {
  name: string
  locationPath: string
}

type NotebookSelectorPayload = {
  notebookId?: string
  notebookPath?: string
}

type RenameNotebookPayload = NotebookSelectorPayload & {
  name: string
}

type NotebookDeletePayload = NotebookSelectorPayload & {
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
  if (nextStatus.status === 'setup-required' || nextStatus.event === 'notebook-setup-required') return null
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

export function hasActiveNotebookForStorageAction(status: StorageProfileStatus | null | undefined): boolean {
  return Boolean(
    status &&
      status.status === 'ready' &&
      status.canWrite &&
      status.activeNotebookId &&
      status.notebookPath,
  )
}

export function notebookSelectorTargetsActiveNotebook(
  status: StorageProfileStatus | null | undefined,
  selector: NotebookSelectorPayload = {},
): boolean {
  if (!hasActiveNotebookForStorageAction(status)) return false
  const notebookId = typeof selector.notebookId === 'string' ? selector.notebookId.trim() : ''
  const notebookPath = typeof selector.notebookPath === 'string' ? selector.notebookPath.trim() : ''
  if (!notebookId && !notebookPath) return true
  return notebookId === status?.activeNotebookId || notebookPath === status?.notebookPath
}

export function useStorageProfileController({ pushToast, beforeStorageAction }: UseStorageProfileControllerParams) {
  const [storageProfileStatus, setStorageProfileStatus] = useState<StorageProfileStatus | null>(null)
  const storageProfileStatusRef = useRef<StorageProfileStatus | null>(null)
  const pushToastRef = useRef(pushToast)
  const beforeStorageActionRef = useRef(beforeStorageAction)

  storageProfileStatusRef.current = storageProfileStatus
  pushToastRef.current = pushToast
  beforeStorageActionRef.current = beforeStorageAction

  useEffect(() => {
    let disposed = false
    const applyStorageProfileStatus = (nextStatus: StorageProfileStatus) => {
      storageProfileStatusRef.current = nextStatus
      setStorageProfileStatus(nextStatus)
      const toast = getStorageProfileStatusToast(nextStatus)
      if (toast) pushToastRef.current(toast.message, toast.tone, toast.durationMs)
    }

    void window.electronAPI?.getStorageProfileStatus?.().then((status) => {
      if (!disposed && status) {
        storageProfileStatusRef.current = status
        setStorageProfileStatus(status)
      }
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
      storageProfileStatusRef.current = result.status
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

  const commitActiveNotebookBeforeStorageAction = async (selector?: NotebookSelectorPayload) => {
    const status = storageProfileStatusRef.current
    const shouldCommit = selector
      ? notebookSelectorTargetsActiveNotebook(status, selector)
      : hasActiveNotebookForStorageAction(status)
    if (shouldCommit) await beforeStorageActionRef.current?.()
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

  const createNotebook = async (payload: CreateNotebookPayload) => {
    await commitActiveNotebookBeforeStorageAction()
    const result = await window.electronAPI?.createNotebook?.(payload)
    if (!result) {
      pushToastRef.current('New notebook is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'New notebook created.')
  }

  const renameNotebook = async (name: string, selector: NotebookSelectorPayload) => {
    await commitActiveNotebookBeforeStorageAction(selector)
    const result = await window.electronAPI?.renameNotebook?.({ ...selector, name } satisfies RenameNotebookPayload)
    if (!result) {
      pushToastRef.current('Notebook rename is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook renamed.')
  }

  const openNotebook = async () => {
    await commitActiveNotebookBeforeStorageAction()
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
    await commitActiveNotebookBeforeStorageAction()
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
    await commitActiveNotebookBeforeStorageAction(payload)
    const result = await window.electronAPI?.deleteNotebook?.(payload)
    if (!result) {
      pushToastRef.current('Notebook deletion is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Notebook deleted.')
  }

  const moveStorageProfile = async () => {
    await commitActiveNotebookBeforeStorageAction()
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
    await commitActiveNotebookBeforeStorageAction()
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
    createNotebook,
    renameNotebook,
    openNotebook,
    switchNotebook,
    forgetNotebook,
    deleteNotebook,
    moveStorageProfile,
    revealStorageProfile,
    revealRecoveredNotebookLocation,
    retryStorageProfile,
  }
}
