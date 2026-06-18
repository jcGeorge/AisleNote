import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../theme/notebook-themes'
import { parseThemeSettingsImport, serializeThemeSettings } from './theme-transfer'

describe('theme transfer helpers', () => {
  it('serializes the active theme palette as plain json', () => {
    const serialized = serializeThemeSettings({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#123456',
    })
    const parsed = JSON.parse(serialized) as Record<string, unknown>

    expect(parsed).toMatchObject({ primary: '#123456' })
    expect(parsed).not.toHaveProperty('type')
    expect(parsed).not.toHaveProperty('theme')
    expect(parsed).not.toHaveProperty('palette')
  })

  it('rejects wrapped theme json', () => {
    const result = parseThemeSettingsImport(
      JSON.stringify({
        type: 'tabs.theme-settings',
        version: 1,
        theme: 'custom1',
        palette: {
          ...DEFAULT_CUSTOM_THEME_PALETTE,
          primary: '#abcdef',
        },
      }),
      DEFAULT_CUSTOM_THEME_PALETTE,
    )

    expect(result).toEqual({ ok: false, error: 'No theme colors found.' })
  })

  it('imports a partial plain palette object into the current palette', () => {
    const result = parseThemeSettingsImport(JSON.stringify({
      primary: 'abc',
      secondary: '#112233',
      tagBg: '#ddeeff',
      tooltipPrimary: '#ccddee',
      tooltipSecondary: '#667788',
    }), DEFAULT_CUSTOM_THEME_PALETTE)

    expect(result).toEqual({
      ok: true,
      palette: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        primary: '#aabbcc',
        secondary: '#112233',
        tagBg: '#ddeeff',
        tooltipPrimary: '#ccddee',
        tooltipSecondary: '#667788',
      },
      importedSlots: ['primary', 'secondary', 'tagBg', 'tooltipPrimary', 'tooltipSecondary'],
    })
  })

  it('rejects a palette nested in app state ui settings', () => {
    const result = parseThemeSettingsImport(JSON.stringify({
      theme: 'dawn',
      ui: {
        themePalettes: {
          dawn: {
            ...DEFAULT_CUSTOM_THEME_PALETTE,
            primary: '#654321',
          },
        },
      },
    }), DEFAULT_CUSTOM_THEME_PALETTE)

    expect(result).toEqual({ ok: false, error: 'No theme colors found.' })
  })

  it('rejects invalid palette json', () => {
    expect(parseThemeSettingsImport('{', DEFAULT_CUSTOM_THEME_PALETTE)).toEqual({ ok: false, error: 'Invalid JSON.' })
    expect(parseThemeSettingsImport(JSON.stringify({ palette: { primary: '#not-hex' } }), DEFAULT_CUSTOM_THEME_PALETTE)).toEqual({
      ok: false,
      error: 'No theme colors found.',
    })
    expect(parseThemeSettingsImport(JSON.stringify({ nope: '#123456' }), DEFAULT_CUSTOM_THEME_PALETTE)).toEqual({
      ok: false,
      error: 'No theme colors found.',
    })
  })
})
