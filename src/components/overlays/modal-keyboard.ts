import type { ModalState } from '../../types/app'

export type InsertNoteReferenceEnterSubmitInput = {
  modalType: ModalState['type'] | null
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  targetTagName?: string
  targetInputType?: string
}

export function shouldSubmitInsertNoteReferenceOnEnter(input: InsertNoteReferenceEnterSubmitInput): boolean {
  if (input.modalType !== 'insert-note-reference') return false
  if (input.key !== 'Enter') return false
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey || input.isComposing) return false
  if (input.targetTagName?.toLowerCase() !== 'input') return false
  const inputType = (input.targetInputType || 'text').toLowerCase()
  return inputType === 'text' || inputType === 'url' || inputType === 'search'
}
