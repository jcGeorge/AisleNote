export type NewlineMenuKeyboardAction =
  | { type: 'none' }
  | { type: 'close' }
  | { type: 'highlight'; index: number }
  | { type: 'run'; index: number }

export type NewlineMenuKeyboardInput = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export function getNewlineMenuNumberIndex(key: string): number | null {
  if (key >= '1' && key <= '9') return Number(key) - 1
  if (key === '0') return 9
  return null
}

export function isNewlineMenuKeyboardKey(input: NewlineMenuKeyboardInput): boolean {
  if (input.key === 'Escape') return true
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return false
  if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(input.key)) return true
  return getNewlineMenuNumberIndex(input.key) !== null
}

export function getNewlineMenuKeyboardAction(
  input: NewlineMenuKeyboardInput,
  activeIndex: number,
  itemCount: number,
): NewlineMenuKeyboardAction {
  if (input.key === 'Escape') return { type: 'close' }
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return { type: 'none' }

  const boundedCount = Math.max(0, itemCount)
  if (boundedCount === 0) return { type: 'none' }
  const normalizedActiveIndex = Math.max(0, Math.min(boundedCount - 1, activeIndex))

  if (input.key === 'ArrowDown') return { type: 'highlight', index: (normalizedActiveIndex + 1) % boundedCount }
  if (input.key === 'ArrowUp') {
    return { type: 'highlight', index: (normalizedActiveIndex - 1 + boundedCount) % boundedCount }
  }
  if (input.key === 'Home') return { type: 'highlight', index: 0 }
  if (input.key === 'End') return { type: 'highlight', index: boundedCount - 1 }
  if (input.key === 'Enter') return { type: 'run', index: normalizedActiveIndex }

  const numberIndex = getNewlineMenuNumberIndex(input.key)
  if (numberIndex === null || numberIndex >= boundedCount) return { type: 'none' }
  return { type: 'run', index: numberIndex }
}
