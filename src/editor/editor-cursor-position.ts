export type EditorLogicalCursorEndpoint = {
  blockIndex: number
  offset: number
}

export type EditorCursorTextBlock = {
  blockIndex: number
  start: number
  end: number
  text: string
}

const TRAILING_HORIZONTAL_WHITESPACE_RE = /[ \t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min
  return Math.max(min, Math.min(max, numeric))
}

export function getMeaningfulCursorTextLength(text: string): number {
  return String(text ?? '').replace(TRAILING_HORIZONTAL_WHITESPACE_RE, '').length
}

export function normalizeLogicalCursorEndpoint(raw: unknown): EditorLogicalCursorEndpoint | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.blockIndex !== 'number' || typeof candidate.offset !== 'number') return null
  if (!Number.isFinite(candidate.blockIndex) || !Number.isFinite(candidate.offset)) return null
  if (candidate.blockIndex < 0 || candidate.offset < 0) return null
  return {
    blockIndex: Math.floor(candidate.blockIndex),
    offset: Math.floor(candidate.offset),
  }
}

export function clampLogicalCursorEndpoint(endpoint: unknown): EditorLogicalCursorEndpoint | undefined {
  const normalized = normalizeLogicalCursorEndpoint(endpoint)
  return normalized ?? undefined
}

export function getLogicalEndpointForPosition(
  blocks: EditorCursorTextBlock[],
  position: number,
  docSize: number,
): EditorLogicalCursorEndpoint | null {
  if (blocks.length === 0) return null
  const safePosition = clampInteger(position, 0, Math.max(0, docSize))
  const containingBlock = blocks.find((block) => safePosition >= block.start && safePosition <= block.end)
  const block =
    containingBlock ??
    blocks.reduce((closest, candidate) => {
      const closestDistance = safePosition < closest.start
        ? closest.start - safePosition
        : safePosition > closest.end
          ? safePosition - closest.end
          : 0
      const candidateDistance = safePosition < candidate.start
        ? candidate.start - safePosition
        : safePosition > candidate.end
          ? safePosition - candidate.end
          : 0
      return candidateDistance < closestDistance ? candidate : closest
    }, blocks[0])
  const meaningfulLength = getMeaningfulCursorTextLength(block.text)
  return {
    blockIndex: block.blockIndex,
    offset: clampInteger(safePosition - block.start, 0, meaningfulLength),
  }
}

export function resolveLogicalEndpointPosition(
  blocks: EditorCursorTextBlock[],
  endpoint: unknown,
  docSize: number,
): number | null {
  const normalized = normalizeLogicalCursorEndpoint(endpoint)
  if (!normalized || blocks.length === 0) return null
  const blockIndex = clampInteger(normalized.blockIndex, 0, blocks.length - 1)
  const block = blocks[blockIndex]
  const offset = clampInteger(normalized.offset, 0, Math.max(0, block.end - block.start))
  return clampInteger(block.start + offset, 0, Math.max(0, docSize))
}
