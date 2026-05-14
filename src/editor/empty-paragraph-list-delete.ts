export type EmptyParagraphListBoundaryDirection = 'backward' | 'forward'

export function isEmptyEditorTextBlock(node: any): boolean {
  return String(node?.textContent ?? '').replace(/\u200b/g, '').trim().length === 0
}

export function isEditorListNode(node: any): boolean {
  return node?.type?.name === 'bulletList' || node?.type?.name === 'orderedList'
}

export function shouldDeleteEmptyParagraphAtListBoundary({
  currentNode,
  previousNode,
  nextNode,
  parentOffset,
  direction,
}: {
  currentNode: any
  previousNode?: any
  nextNode?: any
  parentOffset: number
  direction: EmptyParagraphListBoundaryDirection
}): boolean {
  if (currentNode?.type?.name !== 'paragraph') return false
  if (!isEmptyEditorTextBlock(currentNode)) return false
  if (direction === 'backward') return parentOffset === 0 && isEditorListNode(previousNode)
  return parentOffset === (currentNode.content?.size ?? 0) && isEditorListNode(nextNode)
}
