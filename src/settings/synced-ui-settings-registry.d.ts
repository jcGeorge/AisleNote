import type { AppState } from '../types/app'

export type SimpleSyncedUiSettingKey =
  | 'lastLinkInsertMode'
  | 'lastNoteCopyMode'
  | 'findCaseSensitive'
  | 'findWholeWord'
  | 'findRegex'
  | 'findReplaceMode'
  | 'findReplaceScope'
  | 'removeNoteReferencesOnTrash'
  | 'noteMentionCopyRequiresConfirmation'
  | 'scratchpadNewAisleSide'
  | 'tabRenameEnterBehavior'
  | 'decoupledItemsKeepData'
  | 'trashDeleteForRealRequiresConfirmation'
  | 'tableAddTargetMode'
  | 'tableDeleteTargetMode'
  | 'tableOfContentsScope'
  | 'tabColorIndicatorPlacement'
  | 'toolbarEditorShowNames'

export type SyncedUiBooleanSettingKey =
  | 'findCaseSensitive'
  | 'findWholeWord'
  | 'findRegex'
  | 'removeNoteReferencesOnTrash'
  | 'noteMentionCopyRequiresConfirmation'
  | 'decoupledItemsKeepData'
  | 'trashDeleteForRealRequiresConfirmation'
  | 'toolbarEditorShowNames'

export type SimpleSyncedUiSettings = Pick<AppState['ui'], SimpleSyncedUiSettingKey>
export type SyncedUiBooleanSettings = Record<SyncedUiBooleanSettingKey, boolean>

export type SyncedUiBooleanSettingDescriptor = {
  key: SyncedUiBooleanSettingKey
  label: string
  ariaLabel: string
}

export type SyncedUiBooleanSettingView = SyncedUiBooleanSettingDescriptor & {
  checked: boolean
}

export const SYNCED_UI_SIMPLE_SETTING_DEFINITIONS: readonly {
  key: SimpleSyncedUiSettingKey
  kind: 'boolean' | 'enum'
  defaultValue: SimpleSyncedUiSettings[SimpleSyncedUiSettingKey]
  values?: readonly string[]
}[]

export const SYNCED_UI_BOOLEAN_SETTING_KEYS: readonly SyncedUiBooleanSettingKey[]
export const DEFAULT_SIMPLE_SYNCED_UI_SETTINGS: SimpleSyncedUiSettings
export const MISC_SYNCED_UI_BOOLEAN_SETTINGS: readonly SyncedUiBooleanSettingDescriptor[]

export function normalizeRegisteredSyncedUiSetting(
  key: 'lastLinkInsertMode',
  value: unknown,
): NonNullable<AppState['ui']['lastLinkInsertMode']>
export function normalizeRegisteredSyncedUiSetting(
  key: 'lastNoteCopyMode',
  value: unknown,
): NonNullable<AppState['ui']['lastNoteCopyMode']>
export function normalizeRegisteredSyncedUiSetting(key: 'findCaseSensitive', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'findWholeWord', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'findRegex', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(
  key: 'findReplaceMode',
  value: unknown,
): NonNullable<AppState['ui']['findReplaceMode']>
export function normalizeRegisteredSyncedUiSetting(
  key: 'findReplaceScope',
  value: unknown,
): NonNullable<AppState['ui']['findReplaceScope']>
export function normalizeRegisteredSyncedUiSetting(key: 'removeNoteReferencesOnTrash', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'noteMentionCopyRequiresConfirmation', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(
  key: 'scratchpadNewAisleSide',
  value: unknown,
): NonNullable<AppState['ui']['scratchpadNewAisleSide']>
export function normalizeRegisteredSyncedUiSetting(
  key: 'tabRenameEnterBehavior',
  value: unknown,
): NonNullable<AppState['ui']['tabRenameEnterBehavior']>
export function normalizeRegisteredSyncedUiSetting(key: 'decoupledItemsKeepData', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(
  key: 'trashDeleteForRealRequiresConfirmation',
  value: unknown,
): boolean
export function normalizeRegisteredSyncedUiSetting(
  key: 'tableAddTargetMode',
  value: unknown,
): AppState['ui']['tableAddTargetMode']
export function normalizeRegisteredSyncedUiSetting(
  key: 'tableDeleteTargetMode',
  value: unknown,
): AppState['ui']['tableDeleteTargetMode']
export function normalizeRegisteredSyncedUiSetting(
  key: 'tableOfContentsScope',
  value: unknown,
): NonNullable<AppState['ui']['tableOfContentsScope']>
export function normalizeRegisteredSyncedUiSetting(
  key: 'tabColorIndicatorPlacement',
  value: unknown,
): NonNullable<AppState['ui']['tabColorIndicatorPlacement']>
export function normalizeRegisteredSyncedUiSetting(key: 'toolbarEditorShowNames', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: SimpleSyncedUiSettingKey, value: unknown): unknown

export function normalizeRegisteredSyncedUiSettings(rawUi: unknown): SimpleSyncedUiSettings
export function pickRegisteredSyncedUiSettings(source: unknown): SimpleSyncedUiSettings
export function getSyncedUiBooleanSettings(rawUi: unknown): SyncedUiBooleanSettings
