import type { ToolbarFormatKey } from '../components/editor/toolbar-state'
import type { NewlineOperationId } from '../types/app'
import type {
  EditorPageMovement,
  MultiLineCursorMovement,
  MultiLineEditInput,
} from './multiline-edit'
import type { TableBoundaryDirection, TableCellNavigationDirection } from './table-editing'

export type EditorArrowDirection = 'left' | 'right' | 'up' | 'down'

export type EditorNavigationIntent =
  | { type: 'none' }
  | { type: 'native'; reason: 'paragraph-boundary' }
  | { type: 'plain-arrow'; direction: EditorArrowDirection }
  | {
      type: 'line-boundary'
      direction: 'start' | 'end'
      extendSelection: boolean
      blockIndentMode: 'line-start' | 'word-boundary'
    }
  | { type: 'document-boundary'; direction: 'start' | 'end'; extendSelection: boolean }
  | { type: 'page-movement'; movement: EditorPageMovement; extendSelection: boolean }

export type EditorNavigationIntentInput = {
  key: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isMacPlatform: boolean
  hasFnModifier?: boolean
}

export type EditorInputIntent =
  | { type: 'none' }
  | { type: 'toolbar-format'; format: ToolbarFormatKey }
  | { type: 'history'; direction: 'undo' | 'redo' }
  | { type: 'newline-operation'; operation: NewlineOperationId }
  | { type: 'open-operations-menu' }
  | { type: 'delete-active-image' }
  | { type: 'document-boundary-selection'; direction: 'start' | 'end'; extendSelection: boolean }
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
  navigationIntent: EditorNavigationIntent
  tableBoundaryDirection: TableBoundaryDirection | null
  multiLineSelectionDirection: 'up' | 'down' | null
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

function hasKey(input: { key?: string; code?: string }, key: string, legacyKey?: string): boolean {
  return input.key === key || input.code === key || (legacyKey ? input.key === legacyKey : false)
}

function getPlainArrowDirection(input: { key?: string; code?: string }): EditorArrowDirection | null {
  if (hasKey(input, 'ArrowLeft', 'Left')) return 'left'
  if (hasKey(input, 'ArrowRight', 'Right')) return 'right'
  if (hasKey(input, 'ArrowUp', 'Up')) return 'up'
  if (hasKey(input, 'ArrowDown', 'Down')) return 'down'
  return null
}

export function getEditorNavigationIntentInputForEvent(
  event: KeyboardEvent,
  isMacPlatform: boolean,
): EditorNavigationIntentInput {
  return {
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    isMacPlatform,
    hasFnModifier: typeof event.getModifierState === 'function' && event.getModifierState('Fn'),
  }
}

export function resolveEditorNavigationIntent(input: EditorNavigationIntentInput): EditorNavigationIntent {
  const arrowDirection = getPlainArrowDirection(input)
  const extendSelection = Boolean(input.shiftKey)
  const hasNonShiftModifier = Boolean(input.altKey || input.ctrlKey || input.metaKey)

  if (
    input.isMacPlatform &&
    input.metaKey &&
    !input.altKey &&
    !input.ctrlKey &&
    (arrowDirection === 'up' || arrowDirection === 'down')
  ) {
    return {
      type: 'document-boundary',
      direction: arrowDirection === 'up' ? 'start' : 'end',
      extendSelection,
    }
  }

  if (!hasNonShiftModifier) {
    if (hasKey(input, 'PageUp')) {
      return { type: 'page-movement', movement: 'page-up', extendSelection }
    }
    if (hasKey(input, 'PageDown')) {
      return { type: 'page-movement', movement: 'page-down', extendSelection }
    }
    if (input.hasFnModifier && arrowDirection === 'up') {
      return { type: 'page-movement', movement: 'page-up', extendSelection }
    }
    if (input.hasFnModifier && arrowDirection === 'down') {
      return { type: 'page-movement', movement: 'page-down', extendSelection }
    }
  }

  if (!input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey) {
    if (hasKey(input, 'Home')) {
      return {
        type: 'line-boundary',
        direction: 'start',
        extendSelection: false,
        blockIndentMode: 'line-start',
      }
    }
    if (hasKey(input, 'End')) {
      return {
        type: 'line-boundary',
        direction: 'end',
        extendSelection: false,
        blockIndentMode: 'line-start',
      }
    }
  }

  if (!input.altKey && !input.shiftKey && (input.metaKey || input.ctrlKey)) {
    if (arrowDirection === 'left') {
      return {
        type: 'line-boundary',
        direction: 'start',
        extendSelection: false,
        blockIndentMode: 'word-boundary',
      }
    }
    if (arrowDirection === 'right') {
      return {
        type: 'line-boundary',
        direction: 'end',
        extendSelection: false,
        blockIndentMode: 'word-boundary',
      }
    }
  }

  if (input.altKey && !input.metaKey && !input.ctrlKey && !input.shiftKey && (arrowDirection === 'up' || arrowDirection === 'down')) {
    return { type: 'native', reason: 'paragraph-boundary' }
  }

  if (!input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey && arrowDirection) {
    return { type: 'plain-arrow', direction: arrowDirection }
  }

  return { type: 'none' }
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
  if (
    !input.isTextInputTarget &&
    !input.hasMultiLineEdit &&
    input.navigationIntent.type === 'document-boundary'
  ) {
    return {
      type: 'document-boundary-selection',
      direction: input.navigationIntent.direction,
      extendSelection: input.navigationIntent.extendSelection,
    }
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
    if (input.navigationIntent.type === 'page-movement') {
      return {
        type: 'multiline-move',
        movement: input.navigationIntent.movement,
        extendSelection: input.navigationIntent.extendSelection,
      }
    }
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
  if (!input.isTextInputTarget && input.navigationIntent.type === 'page-movement') {
    return {
      type: 'page-movement',
      movement: input.navigationIntent.movement,
      extendSelection: input.navigationIntent.extendSelection,
    }
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
