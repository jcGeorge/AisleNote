import type { AppState } from '../types/app'

export type SimpleSyncedUiSettingKey =
  | 'showParentHomeTab'
  | 'stageManagerOpenDestinationAfterApply'
  | 'lastLinkInsertMode'
  | 'lastNoteCopyMode'
  | 'findCaseSensitive'
  | 'findWholeWord'
  | 'findRegex'
  | 'findReplaceMode'
  | 'removeNoteReferencesOnTrash'
  | 'noteMentionCopyRequiresConfirmation'
  | 'deleteSubtabShortcutEnabled'
  | 'scratchpadDeleteAisleShortcutEnabled'
  | 'scratchpadNewAisleSide'
  | 'decoupledItemsKeepData'
  | 'tableAddTargetMode'
  | 'tableDeleteTargetMode'
  | 'tableOfContentsScope'
  | 'newAislePlacement'
  | 'toolbarEditorShowNames'

export type SyncedUiBooleanSettingKey =
  | 'showParentHomeTab'
  | 'stageManagerOpenDestinationAfterApply'
  | 'findCaseSensitive'
  | 'findWholeWord'
  | 'findRegex'
  | 'removeNoteReferencesOnTrash'
  | 'noteMentionCopyRequiresConfirmation'
  | 'deleteSubtabShortcutEnabled'
  | 'scratchpadDeleteAisleShortcutEnabled'
  | 'decoupledItemsKeepData'
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
  key: 'showParentHomeTab',
  value: unknown,
): AppState['ui']['showParentHomeTab']
export function normalizeRegisteredSyncedUiSetting(
  key: 'stageManagerOpenDestinationAfterApply',
  value: unknown,
): AppState['ui']['stageManagerOpenDestinationAfterApply']
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
export function normalizeRegisteredSyncedUiSetting(key: 'removeNoteReferencesOnTrash', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'noteMentionCopyRequiresConfirmation', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'deleteSubtabShortcutEnabled', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: 'scratchpadDeleteAisleShortcutEnabled', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(
  key: 'scratchpadNewAisleSide',
  value: unknown,
): NonNullable<AppState['ui']['scratchpadNewAisleSide']>
export function normalizeRegisteredSyncedUiSetting(key: 'decoupledItemsKeepData', value: unknown): boolean
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
  key: 'newAislePlacement',
  value: unknown,
): NonNullable<AppState['ui']['newAislePlacement']>
export function normalizeRegisteredSyncedUiSetting(key: 'toolbarEditorShowNames', value: unknown): boolean
export function normalizeRegisteredSyncedUiSetting(key: SimpleSyncedUiSettingKey, value: unknown): unknown

export function normalizeRegisteredSyncedUiSettings(rawUi: unknown): SimpleSyncedUiSettings
export function pickRegisteredSyncedUiSettings(source: unknown): SimpleSyncedUiSettings
export function getSyncedUiBooleanSettings(rawUi: unknown): SyncedUiBooleanSettings
