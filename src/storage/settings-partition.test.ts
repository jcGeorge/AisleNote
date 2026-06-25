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
    theme: 'cheese',
    hotkeys: {
      shortcuts: {
        openSettings: 'Ctrl+,',
        newNote: 'Ctrl+Alt+N',
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
      theme: 'dark',
      hotkeys: {
        shortcuts: {
          openSettings: 'Mod+,',
          toggleNotesTrash: 'Mod+T',
          toggleNotesScratchpad: 'Mod+S',
          toggleNotesFilter: '',
          newNote: 'Mod+N',
          newFolder: 'Mod+Shift+N',
          closeCurrentNote: 'Mod+W',
          cyclePinnedNoteTabNext: 'Ctrl+Tab',
          cyclePinnedNoteTabPrev: 'Ctrl+Shift+Tab',
          reopenClosedNoteTab: 'Mod+Shift+T',
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
  })

  it('accepts current exported app-settings json for explicit imports', () => {
    const result = parseStrictPortableAppSettingsJson(currentSettingsJson())

    expect(result).toMatchObject({
      ok: true,
      settings: {
        theme: 'cheese',
        hotkeys: {
          shortcuts: {
            openSettings: 'Ctrl+,',
            newNote: 'Ctrl+Alt+N',
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
      theme: 'cheese',
      hotkeys: {},
      ui: {
        noteFilter: {
          active: true,
          kind: 'synced',
          tags: { selectedKeys: ['tag'], sortMode: 'occurrences' },
          synced: { selectedKeys: ['synced-note:body-1'] },
          frontmatter: { selectedKeys: ['fm-property:status'] },
          media: { selectedKeys: ['media:image:aislenote-asset:///assets/photo.png'] },
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
            media: { selectedKeys: ['media:image:aislenote-asset:///assets/photo.png'] },
          },
        },
      },
    })
  })

  it('drops removed theme palette slots from portable settings', () => {
    const settings = parsePortableAppSettingsJson(JSON.stringify({
      theme: 'cheese',
      hotkeys: {},
      ui: {
        themePalettes: {
          custom1: {
            primary: '#123456',
            secondary: '#112233',
            tooltipPrimary: '#ccddee',
            tooltipSecondary: '#667788',
            sidebarAccent: '#abcdef',
          },
        },
      },
    }))

    expect(settings).toMatchObject({
      ok: true,
      settings: {
        themePalettes: {
          custom1: {
            primary: '#123456',
          },
        },
      },
    })
    if (settings.ok) {
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('secondary')
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('tooltipPrimary')
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('tooltipSecondary')
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('sidebarAccent')
    }
  })

  it('rejects files that do not match the current app-settings structure', () => {
    const invalidSamples = [
      '',
      '[]',
      JSON.stringify({ foo: 'bar' }),
      JSON.stringify({ theme: 'cheese', hotkeys: {}, settings: {} }),
      JSON.stringify({
        type: 'aislenote.app-settings',
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
        theme: 'dark',
      },
    })
  })

  it('fills missing command shortcuts when only newline shortcuts are present', () => {
    const settings = parsePortableAppSettingsJson(JSON.stringify({
      theme: 'cheese',
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
            toggleNotesScratchpad: 'Mod+S',
            toggleNotesFilter: '',
            newNote: 'Mod+N',
            newFolder: 'Mod+Shift+N',
            closeCurrentNote: 'Mod+W',
            cyclePinnedNoteTabNext: 'Ctrl+Tab',
            cyclePinnedNoteTabPrev: 'Ctrl+Shift+Tab',
            reopenClosedNoteTab: 'Mod+Shift+T',
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

  it('normalizes split-file hotkeys before hydrating app state', () => {
    const syncedSettings = buildSyncedSettingsFromSplitFiles({
      appSettings: {
        theme: 'cheese',
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
    expect(syncedSettings.hotkeys.shortcuts.toggleNotesScratchpad).toBe('Mod+S')
    expect(syncedSettings.hotkeys.shortcuts.toggleNotesFilter).toBe('')
    expect(syncedSettings.hotkeys.shortcuts.newNote).toBe('Mod+N')
    expect(syncedSettings.hotkeys.shortcuts.newFolder).toBe('Mod+Shift+N')
    expect(syncedSettings.hotkeys.shortcuts.closeCurrentNote).toBe('Mod+W')
    expect(syncedSettings.hotkeys.shortcuts.cyclePinnedNoteTabNext).toBe('Ctrl+Tab')
    expect(syncedSettings.hotkeys.shortcuts.cyclePinnedNoteTabPrev).toBe('Ctrl+Shift+Tab')
    expect(syncedSettings.hotkeys.shortcuts.reopenClosedNoteTab).toBe('Mod+Shift+T')
    expect(syncedSettings.hotkeys.shortcuts.cycleAisleNext).toBe('Alt+]')
    expect(syncedSettings.hotkeys.newlineShortcuts.menuOperations).toEqual(['blockQuote', 'strikethrough'])
  })

  it('keeps table of contents in split-file newline shortcut settings', () => {
    const syncedSettings = buildSyncedSettingsFromSplitFiles({
      appSettings: {
        hotkeys: {
          newlineShortcuts: {
            shortcuts: {
              controlEnter: 'tableOfContents',
            },
            menuOperations: ['tableOfContents', 'tableOfContents', 'blockQuote'],
          },
        },
      },
    })

    expect(syncedSettings.hotkeys.newlineShortcuts.shortcuts.controlEnter).toBe('tableOfContents')
    expect(syncedSettings.hotkeys.newlineShortcuts.menuOperations).toEqual([
      'tableOfContents',
      'blockQuote',
      'strikethrough',
    ])
  })
})
