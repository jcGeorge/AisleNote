import type { StorageAlert } from '../components/overlays/StorageAlertHost'
import type { AppMessage, ViewMode } from '../types/app'

export const DUPLICATE_AUTO_DECOUPLED_MESSAGE_TYPE = 'duplicate-auto-decoupled'
export const STORAGE_VAULT_RECOVERED_MESSAGE_TYPE = 'storage-vault-recovered'

export function shouldShowTipOverlays(viewMode: ViewMode) {
  return viewMode === 'main' || viewMode === 'trash'
}

export function shouldShowStorageAlerts(viewMode: ViewMode) {
  return viewMode === 'main'
}

export function buildStorageAlerts(messages: AppMessage[], dismissedStorageAlertSignatures: string[] = []): StorageAlert[] {
  const dismissed = new Set(dismissedStorageAlertSignatures)
  return messages.flatMap((message) => {
    const signature = message.signature || message.id
    if (message.status !== 'unread' || dismissed.has(signature)) return []
    if (message.type === DUPLICATE_AUTO_DECOUPLED_MESSAGE_TYPE) {
      return [{
        signature,
        label: 'duplicate files de-coupled',
        message: 'Duplicate files were edited differently. Some copies were de-coupled.',
        detail: message.body,
        actionLabel: 'open settings --> messages --> inbox',
      }]
    }
    if (message.type === STORAGE_VAULT_RECOVERED_MESSAGE_TYPE) {
      const localVaultWasTheFailedFolder =
        message.recoveryMode === 'reset-default' &&
        (message.activeVaultPath === undefined ||
          (message.failedVaultPath !== undefined && message.failedVaultPath === message.activeVaultPath))
      return [{
        signature,
        label: 'vault recovered',
        message: 'AisleNote reset the vault because the folder could not be loaded.',
        actionLabel: message.failedVaultPath && message.failedVaultAvailable !== false
          ? localVaultWasTheFailedFolder
            ? 'open vault folder'
            : 'open previous vault folder'
          : undefined,
      }]
    }
    return []
  })
}
