import { Capacitor } from '@capacitor/core'

export type DataRuntimeKind = 'desktop' | 'mobile' | 'browser'

export type DataPlatformCapabilities = {
  runtime: DataRuntimeKind
  notebookFolders: boolean
  settingsFolders: boolean
  backups: boolean
  recoverySnapshots: boolean
  liveFilesystemReload: boolean
  appPrivateNotebook: boolean
  notebookArchives: boolean
  userSettingsFiles: boolean
  fileSharing: boolean
}

export type DataPlatformEnvironment = {
  hasElectron: boolean
  isNativeCapacitor: boolean
}

export const DESKTOP_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'desktop',
  notebookFolders: true,
  settingsFolders: true,
  backups: true,
  recoverySnapshots: true,
  liveFilesystemReload: true,
  appPrivateNotebook: false,
  notebookArchives: true,
  userSettingsFiles: true,
  fileSharing: true,
}

export const MOBILE_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'mobile',
  notebookFolders: false,
  settingsFolders: false,
  backups: false,
  recoverySnapshots: true,
  liveFilesystemReload: false,
  appPrivateNotebook: true,
  notebookArchives: true,
  userSettingsFiles: true,
  fileSharing: true,
}

export const BROWSER_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'browser',
  notebookFolders: false,
  settingsFolders: false,
  backups: false,
  recoverySnapshots: false,
  liveFilesystemReload: false,
  appPrivateNotebook: false,
  notebookArchives: true,
  userSettingsFiles: true,
  fileSharing: false,
}

export function getDataPlatformCapabilities(
  environment: DataPlatformEnvironment,
): DataPlatformCapabilities {
  if (environment.hasElectron) return DESKTOP_DATA_CAPABILITIES
  if (environment.isNativeCapacitor) return MOBILE_DATA_CAPABILITIES
  return BROWSER_DATA_CAPABILITIES
}

export function isNativeCapacitorRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function getRuntimeDataCapabilities(): DataPlatformCapabilities {
  return getDataPlatformCapabilities({
    hasElectron: typeof window !== 'undefined' && Boolean(window.electronAPI),
    isNativeCapacitor: isNativeCapacitorRuntime(),
  })
}
