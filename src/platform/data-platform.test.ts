import { describe, expect, it } from 'vitest'
import {
  BROWSER_DATA_CAPABILITIES,
  DESKTOP_DATA_CAPABILITIES,
  MOBILE_DATA_CAPABILITIES,
  getDataPlatformCapabilities,
} from './data-platform'

describe('data platform capabilities', () => {
  it('treats Electron as the full filesystem platform', () => {
    expect(getDataPlatformCapabilities({ hasElectron: true, isNativeCapacitor: true })).toBe(
      DESKTOP_DATA_CAPABILITIES,
    )
    expect(DESKTOP_DATA_CAPABILITIES.vaultFolders).toBe(true)
    expect(DESKTOP_DATA_CAPABILITIES.settingsFolders).toBe(true)
    expect(DESKTOP_DATA_CAPABILITIES.liveFilesystemReload).toBe(true)
  })

  it('treats Capacitor native as app-private storage', () => {
    const capabilities = getDataPlatformCapabilities({ hasElectron: false, isNativeCapacitor: true })

    expect(capabilities).toBe(MOBILE_DATA_CAPABILITIES)
    expect(capabilities.appPrivateVault).toBe(true)
    expect(capabilities.userSettingsFiles).toBe(true)
    expect(capabilities.vaultFolders).toBe(false)
    expect(capabilities.settingsFolders).toBe(false)
    expect(capabilities.liveFilesystemReload).toBe(false)
  })

  it('treats plain web as local browser storage', () => {
    const capabilities = getDataPlatformCapabilities({ hasElectron: false, isNativeCapacitor: false })

    expect(capabilities).toBe(BROWSER_DATA_CAPABILITIES)
    expect(capabilities.vaultFolders).toBe(false)
    expect(capabilities.settingsFolders).toBe(false)
  })
})
