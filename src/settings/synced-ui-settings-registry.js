export const SYNCED_UI_SIMPLE_SETTING_DEFINITIONS = Object.freeze([
  { key: 'lastLinkInsertMode', kind: 'enum', defaultValue: 'note-link', values: ['url', 'note-link', 'note-preview'] },
  { key: 'lastNoteCopyMode', kind: 'enum', defaultValue: 'independent', values: ['independent', 'synced'] },
  { key: 'findCaseSensitive', kind: 'boolean', defaultValue: false },
  { key: 'findWholeWord', kind: 'boolean', defaultValue: false },
  { key: 'findRegex', kind: 'boolean', defaultValue: false },
  { key: 'findReplaceMode', kind: 'enum', defaultValue: 'find', values: ['find', 'replace'] },
  { key: 'findReplaceScope', kind: 'enum', defaultValue: 'note', values: ['note', 'folder', 'notebook'] },
  { key: 'removeNoteReferencesOnTrash', kind: 'boolean', defaultValue: true },
  { key: 'noteMentionCopyRequiresConfirmation', kind: 'boolean', defaultValue: true },
  { key: 'scratchpadNewAisleSide', kind: 'enum', defaultValue: 'left', values: ['left', 'right'] },
  {
    key: 'tabRenameEnterBehavior',
    kind: 'enum',
    defaultValue: 'goes-to-note',
    values: ['goes-to-note', 'creates-another-tab'],
  },
  { key: 'decoupledItemsKeepData', kind: 'boolean', defaultValue: true },
  { key: 'trashDeleteForRealRequiresConfirmation', kind: 'boolean', defaultValue: true },
  { key: 'tableAddTargetMode', kind: 'enum', defaultValue: 'bottom-right', values: ['bottom-right', 'active-cell'] },
  { key: 'tableDeleteTargetMode', kind: 'enum', defaultValue: 'bottom-right', values: ['bottom-right', 'active-cell'] },
  { key: 'tableOfContentsScope', kind: 'enum', defaultValue: 'all-aisles', values: ['all-aisles', 'focused-aisle'] },
  { key: 'toolbarEditorShowNames', kind: 'boolean', defaultValue: false },
])

const SIMPLE_SETTING_BY_KEY = new Map(SYNCED_UI_SIMPLE_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]))

export const SYNCED_UI_BOOLEAN_SETTING_KEYS = Object.freeze(
  SYNCED_UI_SIMPLE_SETTING_DEFINITIONS
    .filter((definition) => definition.kind === 'boolean')
    .map((definition) => definition.key),
)

export const DEFAULT_SIMPLE_SYNCED_UI_SETTINGS = Object.freeze(
  Object.fromEntries(
    SYNCED_UI_SIMPLE_SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue]),
  ),
)

export const MISC_SYNCED_UI_BOOLEAN_SETTINGS = Object.freeze([
  {
    key: 'removeNoteReferencesOnTrash',
    label: "remove all links to a note when it's trashed",
    ariaLabel: "remove all links to a note when it's trashed",
  },
  {
    key: 'noteMentionCopyRequiresConfirmation',
    label: '@ menu requires confirmation for replacing aisle with synced or independent copy',
    ariaLabel: '@ menu requires confirmation for replacing aisle with synced or independent copy',
  },
])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeRegisteredSyncedUiSetting(key, value) {
  const definition = SIMPLE_SETTING_BY_KEY.get(key)
  if (!definition) return undefined
  const normalizedValue =
    key === 'lastLinkInsertMode' && value === 'note'
      ? 'note-link'
      : key === 'lastNoteCopyMode' && value === 'linked'
        ? 'synced'
        : value
  if (definition.kind === 'boolean') {
    return typeof normalizedValue === 'boolean' ? normalizedValue : definition.defaultValue
  }
  return definition.values.includes(normalizedValue) ? normalizedValue : definition.defaultValue
}

export function normalizeRegisteredSyncedUiSettings(rawUi) {
  const ui = isRecord(rawUi) ? rawUi : {}
  return Object.fromEntries(
    SYNCED_UI_SIMPLE_SETTING_DEFINITIONS.map((definition) => [
      definition.key,
      normalizeRegisteredSyncedUiSetting(definition.key, ui[definition.key]),
    ]),
  )
}

export function pickRegisteredSyncedUiSettings(source) {
  const ui = isRecord(source) ? source : {}
  return Object.fromEntries(
    SYNCED_UI_SIMPLE_SETTING_DEFINITIONS.map((definition) => [
      definition.key,
      normalizeRegisteredSyncedUiSetting(definition.key, ui[definition.key]),
    ]),
  )
}

export function getSyncedUiBooleanSettings(rawUi) {
  const ui = isRecord(rawUi) ? rawUi : {}
  return Object.fromEntries(
    SYNCED_UI_BOOLEAN_SETTING_KEYS.map((key) => [key, normalizeRegisteredSyncedUiSetting(key, ui[key])]),
  )
}
