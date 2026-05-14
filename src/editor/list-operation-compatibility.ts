import type { NewlineOperationId } from '../types/app'
import { getBulletListMarkerFromAttrs } from './list-markers'

const LIST_OPERATIONS = new Set<NewlineOperationId>(['task', 'dashList', 'bulletList', 'numberedList'])

export function isListNewlineOperation(operation: NewlineOperationId): boolean {
  return LIST_OPERATIONS.has(operation)
}

function listItemIsTask(node: any): boolean {
  return Boolean(node?.attrs?.task)
}

export function isCompatibleListNodeForOperation(node: any, operation: NewlineOperationId): boolean {
  if (!LIST_OPERATIONS.has(operation)) return false
  if (operation === 'numberedList') return node?.type?.name === 'orderedList'
  if (node?.type?.name !== 'bulletList') return false

  let hasTaskItem = false
  let hasPlainItem = false
  for (let index = 0; index < (node.childCount ?? 0); index += 1) {
    if (listItemIsTask(node.child(index))) {
      hasTaskItem = true
    } else {
      hasPlainItem = true
    }
  }

  if (operation === 'task') return hasTaskItem && !hasPlainItem
  if (hasTaskItem) return false
  const marker = getBulletListMarkerFromAttrs(node.attrs)
  return operation === 'dashList' ? marker === 'dash' : marker === 'bullet'
}
