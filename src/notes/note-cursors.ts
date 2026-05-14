import type { NoteCursorEndpoint, NoteCursorLocation, NoteCursorSelection, NoteLocation } from '../types/app'

export const MAX_NOTE_CURSOR_LOCATIONS = 500

export function buildNoteCursorLocationKey(location: NoteLocation): string {
  return [location.domainId, location.spaceId, location.tabId, location.subTabId ?? '__home__'].join('::')
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function clampNoteCursorSelection(
  selection: Pick<NoteCursorSelection, 'anchor' | 'head' | 'updatedAt'> &
    Partial<Pick<NoteCursorSelection, 'anchorBlock' | 'headBlock'>>,
  maxPosition: number,
): NoteCursorSelection {
  const safeMax = Number.isFinite(maxPosition) ? Math.max(0, Math.floor(maxPosition)) : 0
  const clamp = (value: number) => Math.max(0, Math.min(safeMax, Math.floor(value)))
  return {
    anchor: clamp(selection.anchor),
    head: clamp(selection.head),
    ...(selection.anchorBlock ? { anchorBlock: selection.anchorBlock } : {}),
    ...(selection.headBlock ? { headBlock: selection.headBlock } : {}),
    updatedAt: normalizeTimestamp(selection.updatedAt),
  }
}

function normalizeNoteCursorEndpoint(raw: unknown): NoteCursorEndpoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.blockIndex !== 'number' || typeof candidate.offset !== 'number') return undefined
  if (!Number.isFinite(candidate.blockIndex) || !Number.isFinite(candidate.offset)) return undefined
  if (candidate.blockIndex < 0 || candidate.offset < 0) return undefined
  return {
    blockIndex: Math.floor(candidate.blockIndex),
    offset: Math.floor(candidate.offset),
  }
}

export function normalizeNoteCursorSelection(raw: unknown): NoteCursorSelection | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.anchor !== 'number' || typeof candidate.head !== 'number') return null
  if (!Number.isFinite(candidate.anchor) || !Number.isFinite(candidate.head)) return null
  if (candidate.anchor < 0 || candidate.head < 0) return null
  const anchorBlock = normalizeNoteCursorEndpoint(candidate.anchorBlock)
  const headBlock = normalizeNoteCursorEndpoint(candidate.headBlock)
  return {
    anchor: Math.floor(candidate.anchor),
    head: Math.floor(candidate.head),
    ...(anchorBlock ? { anchorBlock } : {}),
    ...(headBlock ? { headBlock } : {}),
    updatedAt: normalizeTimestamp(candidate.updatedAt),
  }
}

function noteCursorEndpointEqual(left: NoteCursorEndpoint | undefined, right: NoteCursorEndpoint | undefined): boolean {
  if (!left || !right) return left === right
  return left.blockIndex === right.blockIndex && left.offset === right.offset
}

export function noteCursorSelectionsEqual(
  left: NoteCursorSelection | null | undefined,
  right: NoteCursorSelection | null | undefined,
): boolean {
  if (!left || !right) return left === right
  return (
    left.anchor === right.anchor &&
    left.head === right.head &&
    noteCursorEndpointEqual(left.anchorBlock, right.anchorBlock) &&
    noteCursorEndpointEqual(left.headBlock, right.headBlock)
  )
}

export function pruneNoteCursorLocations(
  locations: Record<string, NoteCursorLocation>,
  maxEntries = MAX_NOTE_CURSOR_LOCATIONS,
): Record<string, NoteCursorLocation> {
  const entries = Object.entries(locations)
  if (entries.length <= maxEntries) return locations

  return Object.fromEntries(
    entries
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, maxEntries),
  )
}

export function normalizeNoteCursorLocations(raw: unknown): Record<string, NoteCursorLocation> {
  if (!raw || typeof raw !== 'object') return {}
  const normalized: Record<string, NoteCursorLocation> = {}

  for (const [locationKey, rawLocation] of Object.entries(raw as Record<string, unknown>)) {
    if (!locationKey || !rawLocation || typeof rawLocation !== 'object') continue
    const candidate = rawLocation as Record<string, unknown>
    const activeAisleId = typeof candidate.activeAisleId === 'string' ? candidate.activeAisleId : ''
    const rawAisles = candidate.aisles && typeof candidate.aisles === 'object'
      ? (candidate.aisles as Record<string, unknown>)
      : {}
    const aisles: Record<string, NoteCursorSelection> = {}

    for (const [aisleId, rawSelection] of Object.entries(rawAisles)) {
      if (!aisleId) continue
      const selection = normalizeNoteCursorSelection(rawSelection)
      if (selection) aisles[aisleId] = selection
    }

    const updatedAt = Math.max(
      normalizeTimestamp(candidate.updatedAt),
      ...Object.values(aisles).map((selection) => selection.updatedAt),
    )
    if (!activeAisleId && Object.keys(aisles).length === 0) continue

    normalized[locationKey] = {
      activeAisleId,
      aisles,
      updatedAt,
    }
  }

  return pruneNoteCursorLocations(normalized)
}
