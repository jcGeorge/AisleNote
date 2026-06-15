import type { AppState, NoteBody } from '../types/app'
import { listNotebookNotes } from '../state/notebook'
import { buildNoteLocationKey } from './note-locations'

export type AisleWidthsByLocation = Record<string, Record<string, number>>

export const MIN_AISLE_WIDTH_PX = 160
export const MAX_AISLE_WIDTH_PX = 1200

export function clampAisleWidth(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return null
  return Math.min(MAX_AISLE_WIDTH_PX, Math.max(MIN_AISLE_WIDTH_PX, Math.round(parsed)))
}

function aisleWidthsEqual(left: AisleWidthsByLocation, right: AisleWidthsByLocation): boolean {
  const leftLocations = Object.keys(left)
  const rightLocations = Object.keys(right)
  if (leftLocations.length !== rightLocations.length) return false

  return leftLocations.every((locationKey) => {
    const leftAisles = left[locationKey] ?? {}
    const rightAisles = right[locationKey]
    if (!rightAisles) return false
    const leftAisleIds = Object.keys(leftAisles)
    const rightAisleIds = Object.keys(rightAisles)
    return (
      leftAisleIds.length === rightAisleIds.length &&
      leftAisleIds.every((aisleId) => leftAisles[aisleId] === rightAisles[aisleId])
    )
  })
}

export function normalizeAisleWidths(raw: unknown): AisleWidthsByLocation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const normalized: AisleWidthsByLocation = {}
  Object.entries(raw as Record<string, unknown>).forEach(([locationKey, rawAisles]) => {
    const trimmedLocationKey = locationKey.trim()
    if (!trimmedLocationKey || !rawAisles || typeof rawAisles !== 'object' || Array.isArray(rawAisles)) return

    const aisleWidths: Record<string, number> = {}
    Object.entries(rawAisles as Record<string, unknown>).forEach(([aisleId, rawWidth]) => {
      const trimmedAisleId = aisleId.trim()
      const width = clampAisleWidth(rawWidth)
      if (!trimmedAisleId || width === null) return
      aisleWidths[trimmedAisleId] = width
    })

    if (Object.keys(aisleWidths).length > 0) {
      normalized[trimmedLocationKey] = aisleWidths
    }
  })

  return normalized
}

function getBodyById(appState: AppState): Map<string, NoteBody> {
  return new Map(appState.noteBodies.map((body) => [body.id, body]))
}

function addLocationAisleIds(
  result: Map<string, Set<string>>,
  locationKey: string,
  body: NoteBody | null | undefined,
) {
  if (!locationKey || !body || body.aisles.length <= 1) return
  result.set(locationKey, new Set(body.aisles.map((aisle) => aisle.id)))
}

export function buildLiveAisleWidthLocationMap(appState: AppState): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  const bodiesById = getBodyById(appState)

  listNotebookNotes(appState.notebook.items).forEach(({ note }) => {
    addLocationAisleIds(result, buildNoteLocationKey({ noteId: note.id }), bodiesById.get(note.noteBodyId))
  })

  const scratchpadBodyId = appState.scratchpad?.noteBodyId
  if (scratchpadBodyId) {
    addLocationAisleIds(result, 'scratchpad', bodiesById.get(scratchpadBodyId))
  }

  return result
}

export function pruneAisleWidthsForAppState(
  rawWidths: unknown,
  appState: AppState,
): AisleWidthsByLocation {
  const widths = normalizeAisleWidths(rawWidths)
  const source =
    rawWidths && typeof rawWidths === 'object' && !Array.isArray(rawWidths) &&
    aisleWidthsEqual(rawWidths as AisleWidthsByLocation, widths)
      ? (rawWidths as AisleWidthsByLocation)
      : widths
  const liveLocations = buildLiveAisleWidthLocationMap(appState)
  const pruned: AisleWidthsByLocation = {}

  Object.entries(widths).forEach(([locationKey, aisleWidths]) => {
    const liveAisleIds = liveLocations.get(locationKey)
    if (!liveAisleIds) return

    const nextAisleWidths: Record<string, number> = {}
    Object.entries(aisleWidths).forEach(([aisleId, width]) => {
      if (liveAisleIds.has(aisleId)) {
        nextAisleWidths[aisleId] = width
      }
    })
    if (Object.keys(nextAisleWidths).length > 0) {
      pruned[locationKey] = nextAisleWidths
    }
  })

  return aisleWidthsEqual(source, pruned) ? source : pruned
}

export function setAisleWidthForLocation(
  widths: AisleWidthsByLocation,
  locationKey: string,
  aisleId: string,
  width: unknown,
): AisleWidthsByLocation {
  const nextWidth = clampAisleWidth(width)
  if (!locationKey || !aisleId || nextWidth === null) return normalizeAisleWidths(widths)

  const normalized = normalizeAisleWidths(widths)
  const source = aisleWidthsEqual(widths, normalized) ? widths : normalized
  if (normalized[locationKey]?.[aisleId] === nextWidth) return source

  return {
    ...source,
    [locationKey]: {
      ...(source[locationKey] ?? {}),
      [aisleId]: nextWidth,
    },
  }
}

export function resetAisleWidthForLocation(
  widths: AisleWidthsByLocation,
  locationKey: string,
  aisleId: string,
): AisleWidthsByLocation {
  if (!locationKey || !aisleId) return normalizeAisleWidths(widths)

  const normalized = normalizeAisleWidths(widths)
  const source = aisleWidthsEqual(widths, normalized) ? widths : normalized
  const locationWidths = normalized[locationKey]
  if (!locationWidths || !(aisleId in locationWidths)) return source

  const nextLocationWidths = Object.fromEntries(
    Object.entries(locationWidths).filter(([candidateAisleId]) => candidateAisleId !== aisleId),
  ) as Record<string, number>
  if (Object.keys(nextLocationWidths).length === 0) {
    const nextWidths = Object.fromEntries(
      Object.entries(source).filter(([candidateLocationKey]) => candidateLocationKey !== locationKey),
    ) as AisleWidthsByLocation
    return nextWidths
  }

  return {
    ...source,
    [locationKey]: nextLocationWidths,
  }
}
