export const DEFAULT_SCRATCHPAD_AISLE_LIMIT = 16
export const MIN_SCRATCHPAD_AISLE_LIMIT = 8
export const MAX_SCRATCHPAD_AISLE_LIMIT = 40

export function clampScratchpadAisleLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SCRATCHPAD_AISLE_LIMIT
  return Math.min(MAX_SCRATCHPAD_AISLE_LIMIT, Math.max(MIN_SCRATCHPAD_AISLE_LIMIT, Math.floor(parsed)))
}
