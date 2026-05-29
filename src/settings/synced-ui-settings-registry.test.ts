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
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      lastLinkInsertMode: 'note',
      lastNoteCopyMode: 'independent',
      findCaseSensitive: false,
      findWholeWord: false,
      findRegex: false,
      findReplaceMode: 'find',
      removeNoteReferencesOnTrash: true,
      noteMentionCopyRequiresConfirmation: true,
      deleteSubtabShortcutEnabled: false,
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
      showParentHomeTab: false,
      findRegex: true,
      findReplaceMode: 'replace',
      lastLinkInsertMode: 'url',
      lastNoteCopyMode: 'linked',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'not-real',
      tableOfContentsScope: 'focused-aisle',
      newAislePlacement: 'left-of-focus',
      removeNoteReferencesOnTrash: 'false',
      deleteSubtabShortcutEnabled: true,
    })

    expect(normalized).toMatchObject({
      showParentHomeTab: false,
      findRegex: true,
      findReplaceMode: 'replace',
      lastLinkInsertMode: 'url',
      lastNoteCopyMode: 'linked',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'bottom-right',
      tableOfContentsScope: 'focused-aisle',
      removeNoteReferencesOnTrash: true,
      deleteSubtabShortcutEnabled: true,
    })
    expect(normalized).not.toHaveProperty('newAislePlacement')
    expect(normalizeRegisteredSyncedUiSetting('findReplaceMode', 'bad')).toBe('find')
  })

  it('picks registered settings and boolean drafts from a source object', () => {
    expect(pickRegisteredSyncedUiSettings({ findCaseSensitive: true, alwaysShowSpaces: true })).toMatchObject({
      findCaseSensitive: true,
      findWholeWord: false,
    })
    expect(getSyncedUiBooleanSettings({ noteMentionCopyRequiresConfirmation: false })).toMatchObject({
      noteMentionCopyRequiresConfirmation: false,
      removeNoteReferencesOnTrash: true,
      deleteSubtabShortcutEnabled: false,
    })
  })

  it('defines misc boolean switch descriptors in render order', () => {
    expect(MISC_SYNCED_UI_BOOLEAN_SETTINGS.map((setting) => setting.key)).toEqual([
      'removeNoteReferencesOnTrash',
      'noteMentionCopyRequiresConfirmation',
      'deleteSubtabShortcutEnabled',
      'scratchpadDeleteAisleShortcutEnabled',
    ])
  })
})
