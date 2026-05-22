export type NoteMentionKeyboardInput = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export function shouldDismissEmptyNoteMentionOnSpace(
  input: NoteMentionKeyboardInput,
  query: string,
): boolean {
  if (query.length > 0) return false
  if (input.altKey || input.ctrlKey || input.metaKey) return false
  return input.key === ' ' || input.key === 'Spacebar'
}
