export const TIP_IDS = ['task-undo', 'delete-subtab-shortcut'] as const

export type TipId = (typeof TIP_IDS)[number]

export type TipDefinition = {
  id: TipId
  label: string
  message: string
}

type TipDefinitionOptions = {
  isMacPlatform?: boolean
}

export const TIP_DEFINITIONS: TipDefinition[] = [
  {
    id: 'task-undo',
    label: 'task undo',
    message:
      'Tip: Clicking a completed task will delete it. Click & hold the checkbox for half a second to toggle it off.',
  },
  {
    id: 'delete-subtab-shortcut',
    label: 'delete subtab shortcut',
    message: 'Tip: You can enable command/control+w to delete subtabs in the misc tab of the settings.',
  },
]

const TIP_ID_SET = new Set<string>(TIP_IDS)

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

function getDeleteSubtabShortcutTipMessage(isMacPlatform: boolean | undefined) {
  return `You can enable ${isMacPlatform ? 'command' : 'control'}+w to delete subtabs in the misc tab of the settings.`
}

export function getTipDefinition(tipId: TipId, options: TipDefinitionOptions = {}): TipDefinition {
  const tip = TIP_DEFINITIONS.find((candidate) => candidate.id === tipId) ?? TIP_DEFINITIONS[0]
  if (tip.id !== 'delete-subtab-shortcut') return tip
  return {
    ...tip,
    message: getDeleteSubtabShortcutTipMessage(options.isMacPlatform),
  }
}
