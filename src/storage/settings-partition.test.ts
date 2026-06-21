import { describe, expect, it } from 'vitest'
import {
  buildSyncedSettingsFromSplitFiles,
  createDefaultPortableAppSettings,
  parsePortableAppSettingsJson,
  parseStrictPortableAppSettingsJson,
  stringifyPortableAppSettings,
} from './settings-partition.js'

function currentSettingsJson() {
  return stringifyPortableAppSettings({
    theme: 'dawn',
    hotkeys: {
      shortcuts: {
        openSettings: 'Ctrl+,',
        newNote: 'Ctrl+Alt+N',
        newTab: 'Ctrl+Alt+N',
      },
    },
    ui: {
      settingsSection: 'data',
      dataSettingsSection: 'storage',
      toolbarLayouts: [],
      selectedCustomTheme: 'custom1',
      themePalettes: {},
    },
  })
}

describe('portable app settings parsing', () => {
  it('builds a current default app-settings shape', () => {
    expect(createDefaultPortableAppSettings()).toMatchObject({
      theme: 'dawn',
      hotkeys: {
        shortcuts: {
          openSettings: 'Mod+,',
          toggleNotesTrash: 'Mod+T',
          toggleNotesScratchpad: 'Mod+/',
          toggleNotesFilter: '',
          newNote: 'Mod+N',
          newFolder: 'Mod+Shift+N',
          newTab: 'Mod+Shift+N',
        },
        newlineShortcuts: {
          shortcuts: {
            controlEnter: 'operationsMenu',
            commandEnter: 'aisleRight',
          },
        },
      },
      ui: {
        settingsSection: 'hotkeys',
        dataSettingsSection: 'transfer',
        tabRenameEnterBehavior: 'goes-to-note',
        noteFilter: {
          active: false,
          kind: 'tags',
        },
        toolbarLayouts: [],
      },
    })
    expect(createDefaultPortableAppSettings().ui).not.toHaveProperty('toggleTabsTarget')
  })

  it('accepts current exported app-settings json for explicit imports', () => {
    const result = parseStrictPortableAppSettingsJson(currentSettingsJson())

    expect(result).toMatchObject({
      ok: true,
      settings: {
        theme: 'dawn',
        hotkeys: {
          shortcuts: {
            openSettings: 'Ctrl+,',
            newNote: 'Ctrl+Alt+N',
            newTab: 'Ctrl+Alt+N',
          },
        },
        ui: {
          settingsSection: 'data',
          dataSettingsSection: 'storage',
          tabRenameEnterBehavior: 'goes-to-note',
          noteFilter: {
            active: false,
            kind: 'tags',
          },
        },
      },
    })
  })

  it('round-trips portable note filter settings', () => {
    const settings = parsePortableAppSettingsJson(JSON.stringify({
      theme: 'dawn',
      hotkeys: {},
      ui: {
        noteFilter: {
          active: true,
          kind: 'synced',
          tags: { selectedKeys: ['tag'], sortMode: 'occurrences' },
          synced: { selectedKeys: ['synced-note:body-1'] },
          frontmatter: { selectedKeys: ['fm-property:status'] },
          media: { selectedKeys: ['media:image:tabs-asset:///assets/photo.png'] },
        },
      },
    }))

    expect(settings).toMatchObject({
      ok: true,
      settings: {
        ui: {
          noteFilter: {
            active: true,
            kind: 'synced',
            tags: { selectedKeys: ['tag'], sortMode: 'occurrences' },
            synced: { selectedKeys: ['synced-note:body-1'] },
            frontmatter: { selectedKeys: ['fm-property:status'] },
            media: { selectedKeys: ['media:image:tabs-asset:///assets/photo.png'] },
          },
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

  it('fills missing command shortcuts when only newline shortcuts are present', () => {
    const settings = parsePortableAppSettingsJson(JSON.stringify({
      theme: 'dawn',
      hotkeys: {
        newlineShortcuts: {
          shortcuts: {
            controlEnter: 'horizontalLine',
          },
        },
      },
      ui: {
        settingsSection: 'hotkeys',
      },
    }))

    expect(settings).toMatchObject({
      ok: true,
      settings: {
        hotkeys: {
          shortcuts: {
            openSettings: 'Mod+,',
            toggleNotesTrash: 'Mod+T',
            toggleNotesScratchpad: 'Mod+/',
            toggleNotesFilter: '',
            newNote: 'Mod+N',
            newFolder: 'Mod+Shift+N',
            newTab: 'Mod+Shift+N',
          },
          newlineShortcuts: {
            shortcuts: {
              controlEnter: 'horizontalLine',
              shiftEnter: 'task',
              commandEnter: 'aisleRight',
            },
          },
        },
      },
    })
  })

  it('migrates legacy toggle tabs shortcut settings to notes/trash', () => {
    const settings = parsePortableAppSettingsJson(JSON.stringify({
      theme: 'dawn',
      hotkeys: {
        shortcuts: {
          toggleTabsTarget: 'Ctrl+Alt+T',
        },
      },
      ui: {
        toggleTabsTarget: 'messages',
      },
    }))

    expect(settings).toMatchObject({
      ok: true,
      settings: {
        hotkeys: {
          shortcuts: {
            toggleNotesTrash: 'Ctrl+Alt+T',
          },
        },
      },
    })
    if (!settings.ok || !settings.settings) throw new Error(settings.error)
    expect(settings.settings.hotkeys.shortcuts).not.toHaveProperty('toggleTabsTarget')
    expect(settings.settings.ui).not.toHaveProperty('toggleTabsTarget')
  })

  it('normalizes split-file hotkeys before hydrating app state', () => {
    const syncedSettings = buildSyncedSettingsFromSplitFiles({
      appSettings: {
        theme: 'dawn',
        hotkeys: {
          newlineShortcuts: {
            menuOperations: ['blockQuote'],
          },
        },
        ui: {
          settingsSection: 'hotkeys',
        },
      },
    })

    expect(syncedSettings.hotkeys.shortcuts.toggleNotesTrash).toBe('Mod+T')
    expect(syncedSettings.hotkeys.shortcuts.openSettings).toBe('Mod+,')
    expect(syncedSettings.hotkeys.shortcuts.toggleNotesScratchpad).toBe('Mod+/')
    expect(syncedSettings.hotkeys.shortcuts.toggleNotesFilter).toBe('')
    expect(syncedSettings.hotkeys.shortcuts.newNote).toBe('Mod+N')
    expect(syncedSettings.hotkeys.shortcuts.newFolder).toBe('Mod+Shift+N')
    expect(syncedSettings.hotkeys.shortcuts.cycleAisleNext).toBe('Alt+]')
    expect(syncedSettings.hotkeys.newlineShortcuts.menuOperations).toEqual(['blockQuote', 'strikethrough'])
  })
})
