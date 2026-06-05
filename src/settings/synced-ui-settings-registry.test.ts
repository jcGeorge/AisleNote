import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIMPLE_SYNCED_UI_SETTINGS,
  MISC_SYNCED_UI_BOOLEAN_SETTINGS,
  getSyncedUiBooleanSettings,
  normalizeRegisteredSyncedUiSetting,
  normalizeRegisteredSyncedUiSettings,
  pickRegisteredSyncedUiSettings,
} from './synced-ui-settings-registry.js'

describe('synced UI settings registry', () => {
  it('exposes defaults for simple synced UI settings', () => {
    expect(DEFAULT_SIMPLE_SYNCED_UI_SETTINGS).toMatchObject({
      lastLinkInsertMode: 'note',
      lastNoteCopyMode: 'independent',
      toggleTabsTarget: 'trash',
      findCaseSensitive: false,
      findWholeWord: false,
      findRegex: false,
      findReplaceMode: 'find',
      removeNoteReferencesOnTrash: true,
      noteMentionCopyRequiresConfirmation: true,
      deleteActiveAisleShortcutEnabled: false,
      tabRenameEnterBehavior: 'goes-to-note',
      decoupledItemsKeepData: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tableOfContentsScope: 'all-aisles',
      toolbarEditorShowNames: false,
    })
    expect(DEFAULT_SIMPLE_SYNCED_UI_SETTINGS).not.toHaveProperty('newAislePlacement')
  })

  it('normalizes booleans and enum values with invalid-value fallbacks', () => {
    const normalized = normalizeRegisteredSyncedUiSettings({
      toggleTabsTarget: 'messages',
      findRegex: true,
      findReplaceMode: 'replace',
      lastLinkInsertMode: 'url',
      lastNoteCopyMode: 'linked',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'not-real',
      tableOfContentsScope: 'focused-aisle',
      tabRenameEnterBehavior: 'creates-another-tab',
      newAislePlacement: 'left-of-focus',
      removeNoteReferencesOnTrash: 'false',
      deleteActiveAisleShortcutEnabled: true,
    })

    expect(normalized).toMatchObject({
      toggleTabsTarget: 'messages',
      findRegex: true,
      findReplaceMode: 'replace',
      lastLinkInsertMode: 'url',
      lastNoteCopyMode: 'linked',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'bottom-right',
      tableOfContentsScope: 'focused-aisle',
      tabRenameEnterBehavior: 'creates-another-tab',
      removeNoteReferencesOnTrash: true,
      deleteActiveAisleShortcutEnabled: true,
    })
    expect(normalized).not.toHaveProperty('newAislePlacement')
    expect(normalized).not.toHaveProperty('showParentHomeTab')
    expect(normalizeRegisteredSyncedUiSetting('findReplaceMode', 'bad')).toBe('find')
    expect(normalizeRegisteredSyncedUiSetting('toggleTabsTarget', 'bad')).toBe('trash')
    expect(normalizeRegisteredSyncedUiSetting('tabRenameEnterBehavior', 'bad')).toBe('goes-to-note')
  })

  it('picks registered settings and boolean drafts from a source object', () => {
    expect(pickRegisteredSyncedUiSettings({ findCaseSensitive: true, alwaysShowSpaces: true })).toMatchObject({
      findCaseSensitive: true,
      findWholeWord: false,
    })
    expect(getSyncedUiBooleanSettings({ noteMentionCopyRequiresConfirmation: false })).toMatchObject({
      noteMentionCopyRequiresConfirmation: false,
      removeNoteReferencesOnTrash: true,
      deleteActiveAisleShortcutEnabled: false,
    })
  })

  it('defines misc boolean switch descriptors in render order', () => {
    expect(MISC_SYNCED_UI_BOOLEAN_SETTINGS.map((setting) => setting.key)).toEqual([
      'removeNoteReferencesOnTrash',
      'noteMentionCopyRequiresConfirmation',
      'deleteActiveAisleShortcutEnabled',
    ])
  })
})
