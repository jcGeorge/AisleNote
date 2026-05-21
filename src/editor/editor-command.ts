import type { EditorFocusIntent } from './focus-intent'
import type { WysiwygHistoryDirection, WysiwygHistoryResult } from './prosemirror-utils'

export type EditorCommandResult = {
  handled: boolean
  commit: boolean
  preserveSelection: boolean
  focusIntent: EditorFocusIntent
  historyResult?: WysiwygHistoryResult | 'structural'
}

export function createEditorCommandResult(
  options: Partial<EditorCommandResult> & { handled: boolean },
): EditorCommandResult {
  return {
    commit: false,
    preserveSelection: false,
    focusIntent: 'none',
    ...options,
  }
}

export function runEditorHistoryCommand({
  direction,
  onRunStructuralHistory,
  onRunEditorHistory,
}: {
  direction: WysiwygHistoryDirection
  onRunStructuralHistory: (direction: WysiwygHistoryDirection) => boolean
  onRunEditorHistory: (direction: WysiwygHistoryDirection) => WysiwygHistoryResult
}): EditorCommandResult {
  const result = onRunEditorHistory(direction)
  if (result !== 'unavailable') {
    return createEditorCommandResult({
      handled: true,
      commit: result === 'applied',
      focusIntent: result === 'applied' ? 'toolbar-command' : 'none',
      historyResult: result,
    })
  }
  if (onRunStructuralHistory(direction)) {
    return createEditorCommandResult({
      handled: true,
      commit: false,
      focusIntent: 'structural-history',
      historyResult: 'structural',
    })
  }
  return createEditorCommandResult({ handled: false, historyResult: result })
}
