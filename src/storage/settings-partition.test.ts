import { describe, expect, it } from 'vitest'
import {
  parsePortableAppSettingsJson,
  parseStrictPortableAppSettingsJson,
  stringifyPortableAppSettings,
} from './settings-partition.js'

function currentSettingsJson() {
  return stringifyPortableAppSettings({
    theme: 'dawn',
    hotkeys: {
      shortcuts: {
        newTab: 'Ctrl+Alt+N',
      },
    },
    ui: {
      settingsSection: 'data',
      dataSettingsSection: 'settings',
      toolbarLayouts: [],
      selectedCustomTheme: 'custom1',
      themePalettes: {},
    },
  })
}

describe('portable app settings parsing', () => {
  it('accepts current exported app-settings json for explicit imports', () => {
    const result = parseStrictPortableAppSettingsJson(currentSettingsJson())

    expect(result).toMatchObject({
      ok: true,
      settings: {
        theme: 'dawn',
        hotkeys: {
          shortcuts: {
            newTab: 'Ctrl+Alt+N',
          },
        },
        ui: {
          settingsSection: 'data',
          dataSettingsSection: 'settings',
        },
      },
    })
  })

  it('rejects files that do not match the current app-settings structure', () => {
    const invalidSamples = [
      '',
      '[]',
      JSON.stringify({ foo: 'bar' }),
      JSON.stringify({ theme: 'dawn', hotkeys: {}, settings: {} }),
      JSON.stringify({
        type: 'tabs.app-settings',
        settings: JSON.parse(currentSettingsJson()),
      }),
    ]

    invalidSamples.forEach((sample) => {
      expect(parseStrictPortableAppSettingsJson(sample)).toEqual({
        ok: false,
        error: 'Settings file does not match app-settings.json structure.',
      })
    })
  })

  it('keeps regular storage settings parsing forgiving', () => {
    expect(parsePortableAppSettingsJson(JSON.stringify({ foo: 'bar' }))).toMatchObject({
      ok: true,
      settings: {
        theme: 'dawn',
      },
    })
  })
})
