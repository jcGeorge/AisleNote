import type { ToolbarFormatKey } from '../components/editor/toolbar-state'
import type { NewlineOperationId } from '../types/app'
import type {
  EditorPageMovement,
  MultiLineCursorMovement,
  MultiLineEditInput,
} from './multiline-edit'
import type { TableBoundaryDirection, TableCellNavigationDirection } from './table-editing'

export type EditorInputIntent =
  | { type: 'none' }
  | { type: 'toolbar-format'; format: ToolbarFormatKey }
  | { type: 'history'; direction: 'undo' | 'redo' }
  | { type: 'newline-operation'; operation: NewlineOperationId }
  | { type: 'open-operations-menu' }
  | { type: 'delete-active-image' }
  | { type: 'table-boundary-caret'; direction: TableBoundaryDirection }
  | { type: 'table-cell-navigation'; direction: TableCellNavigationDirection }
  | { type: 'multiline-selection'; direction: 'up' | 'down' }
  | { type: 'multiline-cancel' }
  | { type: 'multiline-edit'; input: MultiLineEditInput }
  | { type: 'multiline-tab'; shiftKey: boolean }
  | { type: 'multiline-space' }
  | { type: 'multiline-inline-text'; text: string }
  | { type: 'multiline-move'; movement: MultiLineCursorMovement; extendSelection?: boolean }
  | { type: 'paragraph-space-shortcut' }
  | { type: 'page-movement'; movement: EditorPageMovement; extendSelection?: boolean }
  | { type: 'tab-indent'; outdent: boolean }

export type EditorKeyDownIntentInput = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isTextInputTarget: boolean
  hasActiveImage: boolean
  hasActiveTableCell: boolean
  hasMultiLineEdit: boolean
  toolbarFormatShortcut: ToolbarFormatKey | null
  editorHistoryDirection: 'undo' | 'redo' | null
  newlineOperation: NewlineOperationId | null
  tableBoundaryDirection: TableBoundaryDirection | null
  multiLineSelectionDirection: 'up' | 'down' | null
  pageMovement: EditorPageMovement | null
}

export type EditorBeforeInputIntentInput = {
  inputType: string
  data?: string | null
  isComposing?: boolean
  hasMultiLineEdit: boolean
}

function hasCommandModifier(input: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  return Boolean(input.altKey || input.ctrlKey || input.metaKey)
}

function getMultiLineDeleteInput(input: EditorKeyDownIntentInput): MultiLineEditInput | null {
  if (input.key === 'Backspace') {
    if (input.metaKey) return { type: 'delete-to-line-start' }
    if (input.altKey) return { type: 'delete-word-backward' }
    return { type: 'backspace' }
  }
  if (input.key === 'Delete') {
    if (input.metaKey) return { type: 'delete-to-line-end' }
    if (input.altKey) return { type: 'delete-word-forward' }
    return { type: 'delete' }
  }
  return null
}

export function getMultiLineBeforeInputEdit(inputType: string): MultiLineEditInput | null {
  if (inputType === 'deleteContentForward') return { type: 'delete' }
  if (inputType === 'deleteContentBackward') return { type: 'backspace' }
  return null
}

export function resolveEditorKeyDownIntent(input: EditorKeyDownIntentInput): EditorInputIntent {
  if (input.toolbarFormatShortcut) return { type: 'toolbar-format', format: input.toolbarFormatShortcut }
  if (input.editorHistoryDirection) return { type: 'history', direction: input.editorHistoryDirection }
  if (!input.isTextInputTarget && input.newlineOperation) {
    return input.newlineOperation === 'operationsMenu'
      ? { type: 'open-operations-menu' }
      : { type: 'newline-operation', operation: input.newlineOperation }
  }
  if (!input.isTextInputTarget && (input.key === 'Backspace' || input.key === 'Delete') && input.hasActiveImage) {
    return { type: 'delete-active-image' }
  }
  if (!input.isTextInputTarget && input.tableBoundaryDirection) {
    return { type: 'table-boundary-caret', direction: input.tableBoundaryDirection }
  }
  if (
    !input.isTextInputTarget &&
    input.hasActiveTableCell &&
    input.key === 'Tab' &&
    !hasCommandModifier(input)
  ) {
    return { type: 'table-cell-navigation', direction: input.shiftKey ? 'backward' : 'forward' }
  }
  if (input.multiLineSelectionDirection) {
    return { type: 'multiline-selection', direction: input.multiLineSelectionDirection }
  }
  if (input.hasMultiLineEdit) {
    const deleteInput = getMultiLineDeleteInput(input)
    if (deleteInput) return { type: 'multiline-edit', input: deleteInput }
    if (input.key === 'Enter') return { type: 'multiline-edit', input: { type: 'split-line' } }
    if (input.key === 'Escape') return { type: 'multiline-cancel' }
    if (input.key === 'Tab' && !hasCommandModifier(input)) return { type: 'multiline-tab', shiftKey: Boolean(input.shiftKey) }
    if ((input.key === ' ' || input.key === 'Spacebar') && !hasCommandModifier(input)) return { type: 'multiline-space' }
    if (input.key === 'ArrowLeft') {
      return {
        type: 'multiline-move',
        movement: input.altKey ? 'word-left' : input.metaKey || input.ctrlKey ? 'line-start' : 'left',
        extendSelection: input.shiftKey,
      }
    }
    if (input.key === 'ArrowRight') {
      return {
        type: 'multiline-move',
        movement: input.altKey ? 'word-right' : input.metaKey || input.ctrlKey ? 'line-end' : 'right',
        extendSelection: input.shiftKey,
      }
    }
    if (input.pageMovement) return { type: 'multiline-move', movement: input.pageMovement, extendSelection: input.shiftKey }
    if (input.key === 'ArrowUp') return { type: 'multiline-move', movement: 'up' }
    if (input.key === 'ArrowDown') return { type: 'multiline-move', movement: 'down' }
    if (input.key === 'Home') return { type: 'multiline-move', movement: 'line-start', extendSelection: input.shiftKey }
    if (input.key === 'End') return { type: 'multiline-move', movement: 'line-end', extendSelection: input.shiftKey }
    if (input.key.length === 1 && !hasCommandModifier(input)) return { type: 'multiline-inline-text', text: input.key }
  }
  if (
    !input.isTextInputTarget &&
    (input.key === ' ' || input.key === 'Spacebar') &&
    !hasCommandModifier(input)
  ) {
    return { type: 'paragraph-space-shortcut' }
  }
  if (!input.isTextInputTarget && input.pageMovement) {
    return { type: 'page-movement', movement: input.pageMovement, extendSelection: input.shiftKey }
  }
  if (!input.isTextInputTarget && input.key === 'Tab' && !input.altKey && !input.ctrlKey && !input.metaKey) {
    return { type: 'tab-indent', outdent: Boolean(input.shiftKey) }
  }
  return { type: 'none' }
}

export function resolveEditorBeforeInputIntent(input: EditorBeforeInputIntentInput): EditorInputIntent {
  if (input.inputType === 'historyUndo') return { type: 'history', direction: 'undo' }
  if (input.inputType === 'historyRedo') return { type: 'history', direction: 'redo' }
  if (input.isComposing) return { type: 'none' }
  if (!input.hasMultiLineEdit) {
    if (input.inputType === 'insertText' && input.data === ' ') return { type: 'paragraph-space-shortcut' }
    return { type: 'none' }
  }
  const deleteInput = getMultiLineBeforeInputEdit(input.inputType)
  if (deleteInput) return { type: 'multiline-edit', input: deleteInput }
  if (input.inputType === 'insertText' || input.inputType === 'insertCompositionText') {
    const text = input.data ?? ''
    if (!text) return { type: 'none' }
    return text === ' ' ? { type: 'multiline-space' } : { type: 'multiline-inline-text', text }
  }
  return { type: 'none' }
}
