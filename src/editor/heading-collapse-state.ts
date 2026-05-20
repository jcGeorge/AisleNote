import type { HeadingCollapseState } from '../types/app'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeId(value: string) {
  return value.trim()
}

function normalizeHeadingKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  )
}

export function normalizeHeadingCollapseState(raw: unknown): HeadingCollapseState {
  if (!isRecord(raw)) return {}

  const nextState: HeadingCollapseState = {}
  Object.entries(raw).forEach(([rawNoteBodyId, rawAisles]) => {
    const noteBodyId = normalizeId(rawNoteBodyId)
    if (!noteBodyId || !isRecord(rawAisles)) return

    const nextAisles: Record<string, string[]> = {}
    Object.entries(rawAisles).forEach(([rawAisleId, rawKeys]) => {
      const aisleId = normalizeId(rawAisleId)
      const keys = normalizeHeadingKeys(rawKeys)
      if (!aisleId || keys.length === 0) return
      nextAisles[aisleId] = keys
    })

    if (Object.keys(nextAisles).length > 0) {
      nextState[noteBodyId] = nextAisles
    }
  })

  return nextState
}

export function getCollapsedHeadingKeysForAisle(
  state: HeadingCollapseState,
  noteBodyId: string,
  aisleId: string,
): Set<string> {
  return new Set(state[noteBodyId]?.[aisleId] ?? [])
}

export function isHeadingCollapsed(
  state: HeadingCollapseState,
  noteBodyId: string,
  aisleId: string,
  headingKey: string,
): boolean {
  return Boolean(state[noteBodyId]?.[aisleId]?.includes(headingKey))
}

export function setHeadingCollapsed(
  state: HeadingCollapseState,
  noteBodyId: string,
  aisleId: string,
  headingKey: string,
  collapsed: boolean,
): HeadingCollapseState {
  const normalizedNoteBodyId = normalizeId(noteBodyId)
  const normalizedAisleId = normalizeId(aisleId)
  const normalizedHeadingKey = normalizeId(headingKey)
  if (!normalizedNoteBodyId || !normalizedAisleId || !normalizedHeadingKey) return state

  const currentNote = state[normalizedNoteBodyId] ?? {}
  const currentKeys = currentNote[normalizedAisleId] ?? []
  const currentSet = new Set(currentKeys)
  const alreadyCollapsed = currentSet.has(normalizedHeadingKey)
  if (alreadyCollapsed === collapsed) return state

  if (collapsed) {
    currentSet.add(normalizedHeadingKey)
  } else {
    currentSet.delete(normalizedHeadingKey)
  }

  const nextKeys = Array.from(currentSet)
  const nextNote = { ...currentNote }
  if (nextKeys.length > 0) {
    nextNote[normalizedAisleId] = nextKeys
  } else {
    delete nextNote[normalizedAisleId]
  }

  const nextState = { ...state }
  if (Object.keys(nextNote).length > 0) {
    nextState[normalizedNoteBodyId] = nextNote
  } else {
    delete nextState[normalizedNoteBodyId]
  }

  return nextState
}
