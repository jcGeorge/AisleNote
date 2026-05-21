import { DEFAULT_TOOLBAR_LAYOUT_ID } from '../editor/toolbar-layouts'

export const DEVICE_SETTINGS_STORAGE_KEY = 'tabs:device-settings:v1'

export type DeviceSettings = {
  activeToolbarLayoutId: string
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  activeToolbarLayoutId: DEFAULT_TOOLBAR_LAYOUT_ID,
}

function normalizeDeviceSettingsValue(raw: unknown): DeviceSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_DEVICE_SETTINGS
  const obj = raw as Record<string, unknown>
  return {
    activeToolbarLayoutId:
      typeof obj.activeToolbarLayoutId === 'string' && obj.activeToolbarLayoutId.trim()
        ? obj.activeToolbarLayoutId.trim()
        : DEFAULT_DEVICE_SETTINGS.activeToolbarLayoutId,
  }
}

export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (!raw) return DEFAULT_DEVICE_SETTINGS
  try {
    return normalizeDeviceSettingsValue(JSON.parse(raw))
  } catch {
    return DEFAULT_DEVICE_SETTINGS
  }
}

export function loadDeviceSettings(storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage): DeviceSettings {
  try {
    return parseDeviceSettings(storage?.getItem(DEVICE_SETTINGS_STORAGE_KEY) ?? null)
  } catch {
    return DEFAULT_DEVICE_SETTINGS
  }
}

export function saveDeviceSettings(
  settings: DeviceSettings,
  storage: Pick<Storage, 'setItem'> | null | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeDeviceSettingsValue(settings)))
  } catch {
    // Device-local settings should never make app startup or settings changes fail.
  }
}

export function loadActiveToolbarLayoutId(): string {
  return loadDeviceSettings().activeToolbarLayoutId
}

export function saveActiveToolbarLayoutId(activeToolbarLayoutId: string): void {
  saveDeviceSettings({ activeToolbarLayoutId })
}
