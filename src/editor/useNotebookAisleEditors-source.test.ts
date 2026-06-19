import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./useNotebookAisleEditors.ts', import.meta.url), 'utf8')

describe('notebook aisle editor task checkbox wiring', () => {
  it('installs completed-task checkbox behavior for each mounted editor root', () => {
    expect(source).toContain("import { installCompletedTaskCheckboxBehavior } from './task-behavior'")
    expect(source).toContain(
      'cleanupFns.push(installCompletedTaskCheckboxBehavior(root, () => mountedEditor, undefined, commitActiveEditorMarkdownNow))',
    )
    expect(source).toContain('commitActiveEditorMarkdownNow,')
  })

  it('places the caret from pointer activation coordinates instead of restoring the old selection', () => {
    expect(source).toContain('placeEditorCaretAtClientPoint')
    expect(source).toContain('focusAtClientPoint?: { clientX: number; clientY: number }')
    expect(source).toContain('placeEditorCaretAtClientPoint(editor ?? null, options.focusAtClientPoint)')
  })
})
