import { Capacitor } from '@capacitor/core'

export type DataRuntimeKind = 'desktop' | 'mobile' | 'browser'

export type DataPlatformCapabilities = {
  runtime: DataRuntimeKind
  vaultFolders: boolean
  settingsFolders: boolean
  liveFilesystemReload: boolean
  appPrivateVault: boolean
  userSettingsFiles: boolean
}

export type DataPlatformEnvironment = {
  hasElectron: boolean
  isNativeCapacitor: boolean
}

export const DESKTOP_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'desktop',
  vaultFolders: true,
  settingsFolders: true,
  liveFilesystemReload: true,
  appPrivateVault: false,
  userSettingsFiles: true,
}

export const MOBILE_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'mobile',
  vaultFolders: false,
  settingsFolders: false,
  liveFilesystemReload: false,
  appPrivateVault: true,
  userSettingsFiles: true,
}

export const BROWSER_DATA_CAPABILITIES: DataPlatformCapabilities = {
  runtime: 'browser',
  vaultFolders: false,
  settingsFolders: false,
  liveFilesystemReload: false,
  appPrivateVault: false,
  userSettingsFiles: true,
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
