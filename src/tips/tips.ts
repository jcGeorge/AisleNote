import type { NewlineShortcutId, NewlineShortcutSettings } from '../types/app'

export const TIP_IDS = ['task-undo', 'tab-create-after-rename', 'aisle-shortcut'] as const

export type TipId = (typeof TIP_IDS)[number]

export type TipDefinition = {
  id: TipId
  label: string
  message: string
}

export const TIP_DEFINITIONS: TipDefinition[] = [
  {
    id: 'task-undo',
    label: 'task undo',
    message:
      'Tip: If a task disappears after a quick click, press Cmd+Z to undo it. Hold the task checkbox for half a second to toggle it without deleting.',
  },
  {
    id: 'tab-create-after-rename',
    label: 'tab creation',
    message: 'Tip: When creating several tabs, press Tab after naming one to save it and immediately create the next one.',
  },
  {
    id: 'aisle-shortcut',
    label: 'aisle shortcut',
    message: getAisleShortcutTipMessage(null),
  },
]

const TIP_ID_SET = new Set<string>(TIP_IDS)
const NEWLINE_SHORTCUT_IDS: NewlineShortcutId[] = ['controlEnter', 'shiftEnter', 'commandEnter']

export type TabCreateTipRenameType = 'tab' | 'subtab'
export type AisleAddTipSource = 'ui' | 'shortcut'

export type TabCreateTipSequence = {
  type: TabCreateTipRenameType
  count: number
}

export function isTipId(value: unknown): value is TipId {
  return typeof value === 'string' && TIP_ID_SET.has(value)
}

export function normalizeTipIds(value: unknown): TipId[] {
  if (!Array.isArray(value)) return []
  const ids: TipId[] = []
  const seen = new Set<TipId>()
  value.forEach((entry) => {
    if (!isTipId(entry) || seen.has(entry)) return
    seen.add(entry)
    ids.push(entry)
  })
  return ids
}

export function getTipDefinition(tipId: TipId): TipDefinition {
  return TIP_DEFINITIONS.find((tip) => tip.id === tipId) ?? TIP_DEFINITIONS[0]
}

export function getNextTabCreateTipSequence(
  previous: TabCreateTipSequence | null,
  event: { type: TabCreateTipRenameType; wasPendingCreated: boolean },
): { sequence: TabCreateTipSequence | null; shouldShowTip: boolean } {
  if (!event.wasPendingCreated) {
    return { sequence: null, shouldShowTip: false }
  }

  const count = previous?.type === event.type ? previous.count + 1 : 1
  return {
    sequence: { type: event.type, count },
    shouldShowTip: count === 2,
  }
}

export function getNextAisleShortcutTipCount(
  previousCount: number,
  event: { source: AisleAddTipSource },
): { count: number; shouldShowTip: boolean } {
  if (event.source !== 'ui') return { count: 0, shouldShowTip: false }
  const count = previousCount + 1
  return { count, shouldShowTip: count === 2 }
}

function getShortcutMenuKeyForIndex(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

export function getAisleShortcutTipHotkeyLabel(
  newlineShortcuts: NewlineShortcutSettings,
  formatShortcut: (shortcutId: NewlineShortcutId) => string,
): string | null {
  const directShortcutId =
    NEWLINE_SHORTCUT_IDS.find((shortcutId) => newlineShortcuts.shortcuts[shortcutId] === 'aisle') ?? null
  if (directShortcutId) return formatShortcut(directShortcutId)

  const shortcutMenuId =
    NEWLINE_SHORTCUT_IDS.find((shortcutId) => newlineShortcuts.shortcuts[shortcutId] === 'operationsMenu') ?? null
  const aisleMenuIndex = newlineShortcuts.menuOperations.indexOf('aisle')
  if (!shortcutMenuId || aisleMenuIndex < 0) return null

  return `${formatShortcut(shortcutMenuId)}, then ${getShortcutMenuKeyForIndex(aisleMenuIndex)}`
}

export function getAisleShortcutTipMessage(hotkeyLabel: string | null): string {
  if (hotkeyLabel) {
    return `Tip: You added aisles twice in a row. Use ${hotkeyLabel} to add an aisle faster, or change it in settings > shortcuts.`
  }
  return 'Tip: You added aisles twice in a row. You can set an aisle shortcut in settings > shortcuts.'
}
