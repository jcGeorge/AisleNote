import type { StorageAlert } from '../components/overlays/StorageAlertHost'
import type { AppMessage, ViewMode } from '../types/app'

export const DUPLICATE_AUTO_DECOUPLED_MESSAGE_TYPE = 'duplicate-auto-decoupled'
export const STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE = 'storage-notebook-recovered'

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
    if (message.type === STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE) {
      const localNotebookWasTheFailedFolder =
        message.recoveryMode === 'reset-default' &&
        (message.activeNotebookPath === undefined ||
          (message.failedNotebookPath !== undefined && message.failedNotebookPath === message.activeNotebookPath))
      return [{
        signature,
        label: 'notebook recovered',
        message: 'AisleNote reset the notebook because the folder could not be loaded.',
        actionLabel: message.failedNotebookPath && message.failedNotebookAvailable !== false
          ? localNotebookWasTheFailedFolder
            ? 'open notebook folder'
            : 'open previous notebook folder'
          : undefined,
      }]
    }
    return []
  })
}
