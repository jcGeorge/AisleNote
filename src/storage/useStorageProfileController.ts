import { useEffect, useRef, useState } from 'react'
import type { StorageProfileStatus, ToastTone } from '../types/app'

type StorageProfileActionResult =
  | { canceled: true; status: StorageProfileStatus }
  | { ok: true; status: StorageProfileStatus; warning?: string }
  | { ok: false; error?: string; status: StorageProfileStatus }

type CreateVaultPayload = {
  name: string
  locationPath: string
}

type VaultSelectorPayload = {
  vaultId?: string
  vaultPath?: string
}

type RenameVaultPayload = VaultSelectorPayload & {
  name: string
}

type VaultDeletePayload = VaultSelectorPayload & {
  skipConfirmation?: boolean
}

type RevealRecoveredVaultLocationPayload = {
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
  if (nextStatus.status === 'setup-required' || nextStatus.event === 'vault-setup-required') return null
  if (nextStatus.event === 'external-loaded') {
    return { message: 'External vault folder changes loaded.', tone: 'success' }
  }
  if (nextStatus.event === 'vault-auto-recovered') return null
  if (nextStatus.status === 'error') {
    return {
      message: nextStatus.error ?? 'Vault folder could not be loaded. Saves are paused.',
      tone: 'error',
      durationMs: STORAGE_ERROR_TOAST_DURATION_MS,
    }
  }
  return null
}

export function hasActiveVaultForStorageAction(status: StorageProfileStatus | null | undefined): boolean {
  return Boolean(
    status &&
      status.status === 'ready' &&
      status.canWrite &&
      status.activeVaultId &&
      status.vaultPath,
  )
}

export function vaultSelectorTargetsActiveVault(
  status: StorageProfileStatus | null | undefined,
  selector: VaultSelectorPayload = {},
): boolean {
  if (!hasActiveVaultForStorageAction(status)) return false
  const vaultId = typeof selector.vaultId === 'string' ? selector.vaultId.trim() : ''
  const vaultPath = typeof selector.vaultPath === 'string' ? selector.vaultPath.trim() : ''
  if (!vaultId && !vaultPath) return true
  return vaultId === status?.activeVaultId || vaultPath === status?.vaultPath
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
      'ok' in result ? result.error ?? 'Vault folder action failed.' : 'Vault folder action failed.',
      'error',
      STORAGE_ERROR_TOAST_DURATION_MS,
    )
    return false
  }

  const commitActiveVaultBeforeStorageAction = async (selector?: VaultSelectorPayload) => {
    const status = storageProfileStatusRef.current
    const shouldCommit = selector
      ? vaultSelectorTargetsActiveVault(status, selector)
      : hasActiveVaultForStorageAction(status)
    if (shouldCommit) await beforeStorageActionRef.current?.()
  }

  const chooseVaultLocation = async () => {
    const result = await window.electronAPI?.chooseVaultLocation?.()
    if (!result) {
      pushToastRef.current('Vault location selection is only available in the desktop app.', 'warning')
      return null
    }
    if ('canceled' in result && result.canceled) return null
    if ('ok' in result && result.ok) return result.locationPath
    pushToastRef.current(
      'ok' in result ? result.error ?? 'Vault location selection failed.' : 'Vault location selection failed.',
      'error',
      STORAGE_ERROR_TOAST_DURATION_MS,
    )
    return null
  }

  const createVault = async (payload: CreateVaultPayload) => {
    await commitActiveVaultBeforeStorageAction()
    const result = await window.electronAPI?.createVault?.(payload)
    if (!result) {
      pushToastRef.current('New vault is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'New vault created.')
  }

  const renameVault = async (name: string, selector: VaultSelectorPayload) => {
    await commitActiveVaultBeforeStorageAction(selector)
    const result = await window.electronAPI?.renameVault?.({ ...selector, name } satisfies RenameVaultPayload)
    if (!result) {
      pushToastRef.current('Vault rename is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault renamed.')
  }

  const openVault = async () => {
    await commitActiveVaultBeforeStorageAction()
    const result = await window.electronAPI?.openVault?.()
    if (!result) {
      pushToastRef.current('Vault opening is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault opened.')
  }

  const normalizeVaultSelector = (selector: string | VaultSelectorPayload): VaultSelectorPayload =>
    typeof selector === 'string' ? { vaultPath: selector } : selector

  const switchVault = async (selector: string | VaultSelectorPayload) => {
    await commitActiveVaultBeforeStorageAction()
    const result = await window.electronAPI?.switchVault?.(normalizeVaultSelector(selector))
    if (!result) {
      pushToastRef.current('Vault switching is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault switched.')
  }

  const forgetVault = async (selector: string | VaultSelectorPayload) => {
    const result = await window.electronAPI?.forgetVault?.(normalizeVaultSelector(selector))
    if (!result) {
      pushToastRef.current('Vault list management is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault removed from list.')
  }

  const deleteVault = async (payload: VaultDeletePayload = {}) => {
    await commitActiveVaultBeforeStorageAction(payload)
    const result = await window.electronAPI?.deleteVault?.(payload)
    if (!result) {
      pushToastRef.current('Vault deletion is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault deleted.')
  }

  const moveStorageProfile = async () => {
    await commitActiveVaultBeforeStorageAction()
    const result = await window.electronAPI?.moveStorageProfile?.()
    if (!result) {
      pushToastRef.current('Vault folder migration is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault folder moved.')
  }

  const revealStorageProfile = async () => {
    const result = await window.electronAPI?.revealStorageProfile?.()
    if (!result) {
      pushToastRef.current('Reveal folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', STORAGE_ERROR_TOAST_DURATION_MS)
  }

  const revealRecoveredVaultLocation = async (payload: RevealRecoveredVaultLocationPayload = {}) => {
    const result = await window.electronAPI?.revealRecoveredVaultLocation?.(payload)
    if (!result) {
      pushToastRef.current('Reveal folder is only available in the desktop app.', 'warning')
      return
    }
    if (!result.ok) pushToastRef.current(result.error, 'error', STORAGE_ERROR_TOAST_DURATION_MS)
  }

  const retryStorageProfile = async () => {
    await commitActiveVaultBeforeStorageAction()
    const result = await window.electronAPI?.retryStorageProfile?.()
    if (!result) {
      pushToastRef.current('Vault folder reload is only available in the desktop app.', 'warning')
      return false
    }
    return handleStorageProfileResult(result, 'Vault folder reloaded.')
  }

  return {
    storageProfileStatus,
    chooseVaultLocation,
    createVault,
    renameVault,
    openVault,
    switchVault,
    forgetVault,
    deleteVault,
    moveStorageProfile,
    revealStorageProfile,
    revealRecoveredVaultLocation,
    retryStorageProfile,
  }
}
