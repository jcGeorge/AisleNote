export const TIP_IDS = ['task-undo', 'tab-create-after-rename'] as const

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
]

const TIP_ID_SET = new Set<string>(TIP_IDS)

export type TabCreateTipRenameType = 'tab' | 'subtab'

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
  event: { type: TabCreateTipRenameType; wasPendingCreated: boolean; wasRenamedFromDefault: boolean },
): { sequence: TabCreateTipSequence | null; shouldShowTip: boolean } {
  if (!event.wasPendingCreated || !event.wasRenamedFromDefault) {
    return { sequence: null, shouldShowTip: false }
  }

  const count = previous?.type === event.type ? previous.count + 1 : 1
  return {
    sequence: { type: event.type, count },
    shouldShowTip: count === 2,
  }
}
