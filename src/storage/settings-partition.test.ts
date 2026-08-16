import { describe, expect, it } from 'vitest'
import {
  applyPortableAppSettings,
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
          newNote: 'Mod+N',
          newFolder: 'Mod+Shift+N',
          closeCurrentNote: 'Mod+W',
          cyclePinnedNoteTabNext: 'Ctrl+Tab',
          cyclePinnedNoteTabPrev: 'Ctrl+Shift+Tab',
          reopenClosedNoteTab: 'Mod+Shift+T',
          formatHighlight: 'Mod+Shift+H',
          pastePlainText: 'Mod+Shift+V',
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
        noteDropAutoExpandsFolders: false,
        tableAddTargetMode: 'bottom-right',
        tableDeleteTargetMode: 'bottom-right',
        tabRenameEnterBehavior: 'goes-to-note',
        tabColorIndicatorPlacement: 'bottom',
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
          tabColorIndicatorPlacement: 'bottom',
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
            panel: '#010203',
            raised: '#040506',
            button: '#070809',
            primary: '#123456',
            surface: '#111111',
            surfaceRaised: '#222222',
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
            panel: '#010203',
            raised: '#040506',
            button: '#070809',
            primary: '#123456',
          },
        },
      },
    })
    if (settings.ok) {
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('surface')
      expect(settings.settings.themePalettes.custom1).not.toHaveProperty('surfaceRaised')
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
            newNote: 'Mod+N',
            newFolder: 'Mod+Shift+N',
            closeCurrentNote: 'Mod+W',
            cyclePinnedNoteTabNext: 'Ctrl+Tab',
            cyclePinnedNoteTabPrev: 'Ctrl+Shift+Tab',
            reopenClosedNoteTab: 'Mod+Shift+T',
            formatHighlight: 'Mod+Shift+H',
            pastePlainText: 'Mod+Shift+V',
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
    expect(syncedSettings.hotkeys.shortcuts.newNote).toBe('Mod+N')
    expect(syncedSettings.hotkeys.shortcuts.newFolder).toBe('Mod+Shift+N')
    expect(syncedSettings.hotkeys.shortcuts.closeCurrentNote).toBe('Mod+W')
    expect(syncedSettings.hotkeys.shortcuts.cyclePinnedNoteTabNext).toBe('Ctrl+Tab')
    expect(syncedSettings.hotkeys.shortcuts.cyclePinnedNoteTabPrev).toBe('Ctrl+Shift+Tab')
    expect(syncedSettings.hotkeys.shortcuts.reopenClosedNoteTab).toBe('Mod+Shift+T')
    expect(syncedSettings.hotkeys.shortcuts.formatHighlight).toBe('Mod+Shift+H')
    expect(syncedSettings.hotkeys.shortcuts.pastePlainText).toBe('Mod+Shift+V')
    expect(syncedSettings.hotkeys.shortcuts.cycleAislePrev).toBe('Mod+Alt+ArrowLeft')
    expect(syncedSettings.hotkeys.shortcuts.cycleAisleNext).toBe('Mod+Alt+ArrowRight')
    expect(syncedSettings.hotkeys.newlineShortcuts.menuOperations).toEqual(['blockQuote', 'strikethrough'])
  })

  it('migrates split-file legacy aisle default shortcuts', () => {
    const syncedSettings = buildSyncedSettingsFromSplitFiles({
      appSettings: {
        hotkeys: {
          shortcuts: {
            cycleAislePrev: 'Alt+[',
            cycleAisleNext: 'mod+ctrl+arrowright',
            closeCurrentNote: 'Ctrl+Alt+W',
          },
        },
      },
    })

    expect(syncedSettings.hotkeys.shortcuts.cycleAislePrev).toBe('Mod+Alt+ArrowLeft')
    expect(syncedSettings.hotkeys.shortcuts.cycleAisleNext).toBe('Mod+Alt+ArrowRight')
    expect(syncedSettings.hotkeys.shortcuts.closeCurrentNote).toBe('Ctrl+Alt+W')
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

  it('uses editor-state, not portable app settings, for vault-local editor locations', () => {
    const syncedSettings = buildSyncedSettingsFromSplitFiles({
      appSettings: {
        theme: 'light',
        hotkeys: {},
        ui: {
          settingsSection: 'visuals',
          noteCursorLocations: {
            rogue: { activeAisleId: 'rogue', aisles: {}, updatedAt: 1 },
          },
          headingCollapseState: {
            rogue: { rogue: ['Rogue'] },
          },
          aisleWidths: {
            rogue: { rogue: 999 },
          },
        },
      },
      editorState: {
        noteCursorLocations: {
          'note-live': { activeAisleId: 'aisle-live', aisles: {}, updatedAt: 20 },
        },
        headingCollapseState: {
          'body-live': { 'aisle-live': ['Heading'] },
        },
        aisleWidths: {
          'note-live': { 'aisle-live': 320 },
        },
      },
    })

    expect(syncedSettings.theme).toBe('light')
    expect(syncedSettings.ui.settingsSection).toBe('visuals')
    expect(syncedSettings.ui.noteCursorLocations).toEqual({
      'note-live': { activeAisleId: 'aisle-live', aisles: {}, updatedAt: 20 },
    })
    expect(syncedSettings.ui.headingCollapseState).toEqual({
      'body-live': { 'aisle-live': ['Heading'] },
    })
    expect(syncedSettings.ui.aisleWidths).toEqual({
      'note-live': { 'aisle-live': 320 },
    })
  })

  it('does not overwrite existing vault-local editor locations when applying portable settings', () => {
    const currentState = {
      theme: 'dark',
      hotkeys: {
        shortcuts: {},
        newlineShortcuts: { shortcuts: {}, menuOperations: [] },
      },
      frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
      vault: {
        activeNoteId: 'note-live',
        items: [{ type: 'note', id: 'note-live', title: 'Live', noteBodyId: 'body-live' }],
        deletedItems: [],
        settings: { autoRemoveDeletedDays: 7 },
      },
      noteBodies: [{ id: 'body-live', aisles: [{ id: 'aisle-live', aisleBodyId: 'aisle-body-live' }] }],
      noteAisleBodies: [{ id: 'aisle-body-live', markdown: '', tags: [], frontmatter: null, frontmatterStatus: 'none' }],
      ui: {
        noteCursorLocations: {
          'note-live': { activeAisleId: 'aisle-live', aisles: {}, updatedAt: 20 },
        },
        headingCollapseState: {
          'body-live': { 'aisle-live': ['Heading'] },
        },
        aisleWidths: {
          'note-live': { 'aisle-live': 320 },
        },
      },
    }

    const nextState = applyPortableAppSettings(currentState, {
      theme: 'custom1',
      hotkeys: { shortcuts: { openSettings: 'Ctrl+,' } },
      ui: {
        settingsSection: 'toolbar',
        noteCursorLocations: {
          rogue: { activeAisleId: 'rogue', aisles: {}, updatedAt: 1 },
        },
        headingCollapseState: {
          rogue: { rogue: ['Rogue'] },
        },
        aisleWidths: {
          rogue: { rogue: 999 },
        },
      },
    })

    expect(nextState.theme).toBe('custom1')
    expect(nextState.hotkeys.shortcuts.openSettings).toBe('Ctrl+,')
    expect(nextState.ui.settingsSection).toBe('toolbar')
    expect(nextState.ui.noteCursorLocations).toEqual(currentState.ui.noteCursorLocations)
    expect(nextState.ui.headingCollapseState).toEqual(currentState.ui.headingCollapseState)
    expect(nextState.ui.aisleWidths).toEqual(currentState.ui.aisleWidths)
  })
})
