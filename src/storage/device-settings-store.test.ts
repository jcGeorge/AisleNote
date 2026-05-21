import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DEVICE_SETTINGS,
  DEVICE_SETTINGS_STORAGE_KEY,
  loadDeviceSettings,
  parseDeviceSettings,
  saveDeviceSettings,
} from './device-settings-store'

describe('device settings store', () => {
  it('normalizes missing and malformed device-local settings', () => {
    expect(parseDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings('{bad')).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings(JSON.stringify({ activeToolbarLayoutId: '' }))).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings(JSON.stringify({ activeToolbarLayoutId: 'desktop-toolbar' }))).toEqual({
      activeToolbarLayoutId: 'desktop-toolbar',
    })
  })

  it('loads and saves active toolbar layout id separately from app state', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
    }

    saveDeviceSettings({ activeToolbarLayoutId: 'tablet' }, storage)

    expect(storage.setItem).toHaveBeenCalledWith(
      DEVICE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ activeToolbarLayoutId: 'tablet' }),
    )
    expect(loadDeviceSettings(storage)).toEqual({ activeToolbarLayoutId: 'tablet' })
    expect(values.has('tabs:app-state-cache:v1')).toBe(false)
  })

  it('keeps storage failures non-fatal', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }

    expect(loadDeviceSettings(storage)).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(() => saveDeviceSettings({ activeToolbarLayoutId: 'desktop' }, storage)).not.toThrow()
  })
})
