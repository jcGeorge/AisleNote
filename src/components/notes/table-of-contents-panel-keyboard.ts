export type TableOfContentsPanelKeyboardAction =
  | { type: 'none' }
  | { type: 'close' }
  | { type: 'highlight'; index: number }
  | { type: 'run'; index: number }

export type TableOfContentsPanelKeyboardInput = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export function isTableOfContentsPanelKeyboardKey(input: TableOfContentsPanelKeyboardInput): boolean {
  if (input.key === 'Escape') return true
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return false
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(input.key)
}

export function getTableOfContentsPanelKeyboardAction(
  input: TableOfContentsPanelKeyboardInput,
  activeIndex: number,
  itemCount: number,
): TableOfContentsPanelKeyboardAction {
  if (input.key === 'Escape') return { type: 'close' }
  if (!isTableOfContentsPanelKeyboardKey(input)) return { type: 'none' }

  const boundedCount = Math.max(0, itemCount)
  if (boundedCount === 0) return { type: 'none' }
  const normalizedActiveIndex = Math.max(0, Math.min(boundedCount - 1, activeIndex))

  if (input.key === 'ArrowDown' || input.key === 'ArrowRight') {
    return { type: 'highlight', index: (normalizedActiveIndex + 1) % boundedCount }
  }
  if (input.key === 'ArrowUp' || input.key === 'ArrowLeft') {
    return { type: 'highlight', index: (normalizedActiveIndex - 1 + boundedCount) % boundedCount }
  }
  if (input.key === 'Home') return { type: 'highlight', index: 0 }
  if (input.key === 'End') return { type: 'highlight', index: boundedCount - 1 }
  if (input.key === 'Enter' || input.key === ' ') return { type: 'run', index: normalizedActiveIndex }

  return { type: 'none' }
}
