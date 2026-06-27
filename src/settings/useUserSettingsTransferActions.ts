import { savePortableTextFile } from '../platform/portable-file-service'
import type { AppState, ToastTone } from '../types/app'
import {
  applyPortableAppSettings,
  createDefaultPortableAppSettings,
  parseStrictPortableAppSettingsJson,
  stringifyPortableAppSettings,
} from '../storage/settings-partition.js'
import { dataTransferMessages } from './data-transfer-messages'

type UseUserSettingsTransferActionsParams = {
  getLatestState: () => AppState
  commitAppStateNow: (nextState: AppState) => Promise<unknown> | unknown
  setExportStatus: (status: string) => void
  setImportStatus: (status: string) => void
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

function chooseUserSettingsWithBrowserInput(): Promise<{ canceled: true } | { canceled: false; contents: string }> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      if (!file) {
        cleanup()
        resolve({ canceled: true })
        return
      }
      file.text()
        .then((contents) => resolve({ canceled: false, contents }))
        .catch(() => resolve({ canceled: true }))
        .finally(cleanup)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function downloadTextFile(defaultPath: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = defaultPath
  anchor.click()
  URL.revokeObjectURL(url)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export function useUserSettingsTransferActions({
  getLatestState,
  commitAppStateNow,
  setExportStatus,
  setImportStatus,
  pushToast,
}: UseUserSettingsTransferActionsParams) {
  const exportUserSettings = async () => {
    setExportStatus(dataTransferMessages.userSettingsExportBuilding)
    try {
      const contents = stringifyPortableAppSettings(getLatestState())
      const defaultPath = 'app-settings.json'
      const saveUserSettingsFile = window.electronAPI?.saveUserSettingsFile
      if (saveUserSettingsFile) {
        const result = await saveUserSettingsFile({ defaultPath, contents })
        if (result.canceled) {
          setExportStatus(dataTransferMessages.userSettingsExportCanceled)
          return
        }
        if (result.error) {
          setExportStatus(dataTransferMessages.userSettingsExportFailed(result.error))
          return
        }
        setExportStatus(dataTransferMessages.userSettingsExported)
        return
      }

      const portableSave = await savePortableTextFile({
        defaultPath,
        contents,
        title: 'Export user settings',
      })
      if (portableSave.handled) {
        if (portableSave.error) {
          setExportStatus(dataTransferMessages.userSettingsExportFailed(portableSave.error))
          return
        }
        setExportStatus(dataTransferMessages.userSettingsShared)
        return
      }

      downloadTextFile(defaultPath, contents, 'application/json')
      setExportStatus(dataTransferMessages.userSettingsExported)
    } catch (error) {
      setExportStatus(dataTransferMessages.userSettingsExportFailed(getErrorMessage(error)))
    }
  }

  const resetUserSettingsToDefaults = async () => {
    if (!window.confirm(dataTransferMessages.userSettingsResetConfirm)) {
      setImportStatus(dataTransferMessages.userSettingsResetCanceled)
      return
    }

    const resetDesktopSettings = window.electronAPI?.resetUserSettingsToDefaults
    if (resetDesktopSettings) {
      const result = await resetDesktopSettings()
      if (!result.ok) {
        setImportStatus(dataTransferMessages.userSettingsResetFailed(result.error))
        return
      }
      setImportStatus(dataTransferMessages.userSettingsResetToDefaults)
      return
    }

    const latestState = getLatestState()
    await commitAppStateNow(applyPortableAppSettings(latestState, createDefaultPortableAppSettings()))
    setImportStatus(dataTransferMessages.userSettingsResetToDefaults)
  }

  const importUserSettings = async () => {
    setImportStatus(dataTransferMessages.userSettingsImportChooseFile)
    try {
      const desktopOpen = window.electronAPI?.openUserSettingsFile
      const openResult = desktopOpen ? await desktopOpen() : await chooseUserSettingsWithBrowserInput()
      if (openResult.canceled) {
        setImportStatus(dataTransferMessages.userSettingsImportCanceled)
        return
      }
      if ('ok' in openResult && !openResult.ok) {
        setImportStatus(dataTransferMessages.userSettingsImportFailed(openResult.error))
        return
      }
      const contents = 'contents' in openResult ? openResult.contents : ''
      const parsedSettings = parseStrictPortableAppSettingsJson(contents)
      if (!parsedSettings.ok) {
        setImportStatus(dataTransferMessages.userSettingsFileStructureError)
        return
      }
      if (!window.confirm(dataTransferMessages.userSettingsOverwriteConfirm)) {
        setImportStatus(dataTransferMessages.userSettingsImportCanceled)
        return
      }

      const latestState = getLatestState()
      await commitAppStateNow(applyPortableAppSettings(latestState, parsedSettings.settings))
      setImportStatus(dataTransferMessages.userSettingsImported)
    } catch (error) {
      setImportStatus(dataTransferMessages.userSettingsImportFailed(getErrorMessage(error)))
    }
  }

  const importUserSettingsFromVaultFolder = async () => {
    const openFromVaultFolder = window.electronAPI?.openUserSettingsFromVaultFolder
    if (!openFromVaultFolder) {
      setImportStatus(dataTransferMessages.userSettingsFolderImportDesktopOnly)
      return
    }

    setImportStatus(dataTransferMessages.userSettingsImportChooseVaultFolder)
    try {
      const openResult = await openFromVaultFolder()
      if (openResult.canceled) {
        setImportStatus(dataTransferMessages.userSettingsImportCanceled)
        return
      }
      if (!openResult.ok) {
        setImportStatus(dataTransferMessages.userSettingsFolderStructureError)
        pushToast(dataTransferMessages.userSettingsFolderImportHint, 'warning', 6000)
        return
      }

      const parsedSettings = parseStrictPortableAppSettingsJson(openResult.contents)
      if (!parsedSettings.ok) {
        setImportStatus(dataTransferMessages.userSettingsFolderStructureError)
        pushToast(dataTransferMessages.userSettingsFolderImportHint, 'warning', 6000)
        return
      }
      if (!window.confirm(dataTransferMessages.userSettingsOverwriteConfirm)) {
        setImportStatus(dataTransferMessages.userSettingsImportCanceled)
        return
      }

      const latestState = getLatestState()
      await commitAppStateNow(applyPortableAppSettings(latestState, parsedSettings.settings))
      setImportStatus(dataTransferMessages.userSettingsImportedFromVaultFolder)
    } catch (error) {
      setImportStatus(dataTransferMessages.userSettingsImportFailed(getErrorMessage(error)))
    }
  }

  return {
    exportUserSettings,
    resetUserSettingsToDefaults,
    importUserSettings,
    importUserSettingsFromVaultFolder,
  }
}
