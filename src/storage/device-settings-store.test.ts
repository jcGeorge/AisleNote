import { describe, expect, it, vi } from 'vitest'
import {
  applyDeviceSettingsToAppState,
  DEFAULT_DEVICE_SETTINGS,
  DEVICE_SETTINGS_STORAGE_KEY,
  extractDeviceSettingsFromAppState,
  loadDeviceSettings,
  loadDeviceSettingsRecord,
  mergeLoadedSettings,
  parseDeviceSettings,
  saveDeviceSettings,
} from './device-settings-store'
import { parseSavedState } from '../state/app-state'

function parseModernState(raw: Record<string, unknown>) {
  const space = {
    id: 'space-a',
    name: 'A',
    data: {
      activeTabId: 'tab-a',
      tabs: [{ id: 'tab-a', title: 'A', noteBodyId: 'body-a', activeSubTabId: null, subTabs: [] }],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  return parseSavedState(JSON.stringify({
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [{ id: 'domain-a', name: 'A', activeSpaceId: 'space-a', spaces: [space] }],
    spaces: [space],
    ...raw,
  }))
}

describe('device settings store', () => {
  it('normalizes missing and malformed device-local settings', () => {
    expect(parseDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings('{bad')).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings(JSON.stringify({ activeToolbarLayoutId: '' }))).toEqual(DEFAULT_DEVICE_SETTINGS)
    expect(parseDeviceSettings(JSON.stringify({ activeToolbarLayoutId: 'desktop-toolbar' }))).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      activeToolbarLayoutId: 'desktop-toolbar',
    })
    expect(parseDeviceSettings(JSON.stringify({ lastFindQuery: 'bear' }))).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      lastFindQuery: 'bear',
    })
    expect(parseDeviceSettings(JSON.stringify({ dataSettingsSection: 'trash' }))).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      dataSettingsSection: 'trash',
    })
    expect(parseDeviceSettings(JSON.stringify({ dataSettingsSection: 'sync' })).dataSettingsSection).toBe('cloud')
    expect(parseDeviceSettings(JSON.stringify({ tooltipScale: 9 })).tooltipScale).toBe(1.6)
    expect(parseDeviceSettings(JSON.stringify({ lastFindQuery: 123 })).lastFindQuery).toBe('')
  })

  it('loads and saves active toolbar layout id separately from app state', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
    }

    saveDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS, activeToolbarLayoutId: 'tablet' }, storage)

    expect(storage.setItem).toHaveBeenCalledWith(
      DEVICE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_DEVICE_SETTINGS, activeToolbarLayoutId: 'tablet' }),
    )
    expect(loadDeviceSettings(storage)).toEqual({ ...DEFAULT_DEVICE_SETTINGS, activeToolbarLayoutId: 'tablet' })
    expect(values.has('tabs:app-state-cache:v1')).toBe(false)
  })

  it('applies device-local settings after synced state is parsed', () => {
    const state = parseSavedState(
      JSON.stringify({
        activeDomainId: 'domain-a',
        domains: [
          {
            id: 'domain-a',
            name: 'A',
            activeSpaceId: 'space-a',
            spaces: [
              {
                id: 'space-a',
                name: 'A',
                data: {
                  activeTabId: 'tab-a',
                  tabs: [
                    { id: 'tab-a', title: 'A', activeSubTabId: null, subTabs: [] },
                    { id: 'tab-b', title: 'B', activeSubTabId: null, subTabs: [{ id: 'sub-b', title: 'B' }] },
                  ],
                  deletedTabs: [],
                  deletedSubTabs: [],
                },
              },
            ],
          },
        ],
        ui: {
          settingsSection: 'hotkeys',
          tabButtonScale: 1,
          noteFontScale: 1,
          seenTipIds: [],
        },
      }),
    )

    const merged = applyDeviceSettingsToAppState(state, {
      ...DEFAULT_DEVICE_SETTINGS,
      lastOpened: {
        domainId: 'domain-a',
        spaceId: 'space-a',
        primeTabId: 'tab-b',
        subTabId: 'sub-b',
        viewMode: 'main',
      },
      settingsSection: 'visuals',
      dataSettingsSection: 'import',
      visualsSettingsSection: 'otherVisuals',
      seenTipIds: ['task-undo'],
      tabButtonScale: 1.3,
      noteFontScale: 1.2,
      tooltipScale: 1.25,
    })

    expect(merged.spaces[0]?.data.activeTabId).toBe('tab-b')
    expect(merged.spaces[0]?.data.tabs[1]?.activeSubTabId).toBe('sub-b')
    expect(merged.ui.settingsSection).toBe('visuals')
    expect(merged.ui.dataSettingsSection).toBe('import')
    expect(merged.ui.visualsSettingsSection).toBe('otherVisuals')
    expect(merged.ui.seenTipIds).toEqual(['task-undo'])
    expect(merged.ui.tabButtonScale).toBe(1.3)
    expect(merged.ui.noteFontScale).toBe(1.2)
    expect(merged.ui.tooltipScale).toBe(1.25)
  })

  it('leaves legacy cloud local-ish values in place until device settings exist', () => {
    const state = parseModernState({
      ui: { settingsSection: 'visuals', dataSettingsSection: 'export', visualsSettingsSection: 'otherVisuals', tabButtonScale: 1.2 },
    })

    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: false }).ui.settingsSection).toBe('visuals')
    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: false }).ui.dataSettingsSection).toBe('export')
    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: false }).ui.visualsSettingsSection).toBe('otherVisuals')
    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: true }).ui.settingsSection).toBe('hotkeys')
    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: true }).ui.dataSettingsSection).toBe('cloud')
    expect(mergeLoadedSettings(state, { settings: DEFAULT_DEVICE_SETTINGS, hasStoredSettings: true }).ui.visualsSettingsSection).toBe('theming')
  })

  it('extracts device-local settings from app state without synced settings', () => {
    const state = parseModernState({
        ui: {
          settingsSection: 'tips',
          dataSettingsSection: 'trash',
          visualsSettingsSection: 'otherVisuals',
          seenTipIds: ['task-undo'],
          disabledTipIds: ['tab-create-after-rename'],
          tabButtonScale: 1.1,
          noteFontScale: 1.15,
          tooltipScale: 1.2,
        },
      })

    expect(extractDeviceSettingsFromAppState(state).settingsSection).toBe('tips')
    expect(extractDeviceSettingsFromAppState(state).dataSettingsSection).toBe('trash')
    expect(extractDeviceSettingsFromAppState(state).visualsSettingsSection).toBe('otherVisuals')
    expect(extractDeviceSettingsFromAppState(state).seenTipIds).toEqual(['task-undo'])
    expect(extractDeviceSettingsFromAppState(state).tooltipScale).toBe(1.2)
    expect(extractDeviceSettingsFromAppState(state, { ...DEFAULT_DEVICE_SETTINGS, lastFindQuery: 'bear' }).lastFindQuery).toBe(
      'bear',
    )
    expect(extractDeviceSettingsFromAppState(state)).not.toHaveProperty('disabledTipIds')
  })

  it('normalizes nested visuals settings and legacy top-level theming', () => {
    expect(parseDeviceSettings(JSON.stringify({ visualsSettingsSection: 'otherVisuals' })).visualsSettingsSection).toBe('otherVisuals')
    expect(parseDeviceSettings(JSON.stringify({ visualsSettingsSection: 'colors' })).visualsSettingsSection).toBe('theming')
    expect(parseDeviceSettings(JSON.stringify({ settingsSection: 'theming' }))).toMatchObject({
      settingsSection: 'visuals',
      visualsSettingsSection: 'theming',
    })
  })

  it('reports whether device-local settings already existed', () => {
    const storage = {
      getItem: vi.fn(() => null),
    }

    expect(loadDeviceSettingsRecord(storage).hasStoredSettings).toBe(false)
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
    expect(() => saveDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS, activeToolbarLayoutId: 'desktop' }, storage)).not.toThrow()
  })
})
