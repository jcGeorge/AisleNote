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
      lastLinkInsertMode: 'note-link',
      lastNoteCopyMode: 'independent',
      findCaseSensitive: false,
      findWholeWord: false,
      findRegex: false,
      findReplaceMode: 'find',
      findReplaceScope: 'note',
      removeNoteReferencesOnTrash: true,
      noteMentionCopyRequiresConfirmation: true,
      tabRenameEnterBehavior: 'goes-to-note',
      decoupledItemsKeepData: true,
      trashDeleteForRealRequiresConfirmation: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tableOfContentsScope: 'all-aisles',
      toolbarEditorShowNames: false,
    })
    expect(DEFAULT_SIMPLE_SYNCED_UI_SETTINGS).not.toHaveProperty('newAislePlacement')
  })

  it('normalizes booleans and enum values with invalid-value fallbacks', () => {
    const normalized = normalizeRegisteredSyncedUiSettings({
      findRegex: true,
      findReplaceMode: 'replace',
      findReplaceScope: 'folder',
      lastLinkInsertMode: 'note-preview',
      lastNoteCopyMode: 'synced',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'not-real',
      tableOfContentsScope: 'focused-aisle',
      tabRenameEnterBehavior: 'creates-another-tab',
      newAislePlacement: 'left-of-focus',
      removeNoteReferencesOnTrash: 'false',
      trashDeleteForRealRequiresConfirmation: false,
    })

    expect(normalized).toMatchObject({
      findRegex: true,
      findReplaceMode: 'replace',
      findReplaceScope: 'folder',
      lastLinkInsertMode: 'note-preview',
      lastNoteCopyMode: 'synced',
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'bottom-right',
      tableOfContentsScope: 'focused-aisle',
      tabRenameEnterBehavior: 'creates-another-tab',
      removeNoteReferencesOnTrash: true,
      trashDeleteForRealRequiresConfirmation: false,
    })
    expect(normalized).not.toHaveProperty('newAislePlacement')
    expect(normalized).not.toHaveProperty('showParentHomeTab')
    expect(normalizeRegisteredSyncedUiSetting('findReplaceMode', 'bad')).toBe('find')
    expect(normalizeRegisteredSyncedUiSetting('findReplaceScope', 'bad')).toBe('note')
    expect(normalizeRegisteredSyncedUiSetting('findReplaceScope', 'notebook')).toBe('notebook')
    expect(normalizeRegisteredSyncedUiSetting('lastLinkInsertMode', 'note')).toBe('note-link')
    expect(normalizeRegisteredSyncedUiSetting('lastNoteCopyMode', 'linked')).toBe('synced')
    expect(normalizeRegisteredSyncedUiSetting('tabRenameEnterBehavior', 'bad')).toBe('goes-to-note')
    expect(normalizeRegisteredSyncedUiSetting('trashDeleteForRealRequiresConfirmation', 'bad')).toBe(true)
  })

  it('picks registered settings and boolean drafts from a source object', () => {
    const picked = pickRegisteredSyncedUiSettings({
      findCaseSensitive: true,
      unknownBoolean: true,
    })
    expect(picked).toMatchObject({
      findCaseSensitive: true,
      findWholeWord: false,
    })
    expect(getSyncedUiBooleanSettings({ noteMentionCopyRequiresConfirmation: false })).toMatchObject({
      noteMentionCopyRequiresConfirmation: false,
      removeNoteReferencesOnTrash: true,
      trashDeleteForRealRequiresConfirmation: true,
    })
  })

  it('defines misc boolean switch descriptors in render order', () => {
    expect(MISC_SYNCED_UI_BOOLEAN_SETTINGS.map((setting) => setting.key)).toEqual([
      'removeNoteReferencesOnTrash',
      'noteMentionCopyRequiresConfirmation',
    ])
  })
})
