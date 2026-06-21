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

  it('installs image display metadata sync for each mounted editor root', () => {
    expect(source).toContain("import { installImageDisplayMetadataSync } from './image-dom-metadata'")
    expect(source).toContain('cleanupFns.push(installImageDisplayMetadataSync(root))')
  })

  it('places the caret from pointer activation coordinates instead of restoring the old selection', () => {
    expect(source).toContain('placeEditorCaretAtClientPoint')
    expect(source).toContain("focusAtClientPoint?: { clientX: number; clientY: number; mode: 'coordinate' | 'focus-only' }")
    expect(source).toContain("focusAtClientPoint?.mode === 'focus-only'")
    expect(source).toContain('focusEditorWithoutScrolling(editor ?? null)')
    expect(source).toContain('placeEditorCaretAtClientPoint(editor ?? null, options.focusAtClientPoint)')
  })

  it('guards lifecycle markdown commits until blank-line display restoration is ready', () => {
    expect(source).toContain('displayRestoreReady: boolean')
    expect(source).toContain('const DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS = 8')
    expect(source).toContain('const restoreEditorDisplayWhenReady = useCallback')
    expect(source).toContain('if (result.displayReady) {')
    expect(source).toContain('window.requestAnimationFrame(() => {')
    expect(source).toContain('remainingFrameAttempts - 1')

    const commitIndex = source.indexOf('const commitEditorMarkdown = useCallback')
    const snapshotIndex = source.indexOf('const getMountedEditorMarkdownSnapshots = useCallback')
    const commitBody = source.slice(commitIndex, snapshotIndex)
    const snapshotBody = source.slice(snapshotIndex, source.indexOf('const commitMountedEditorMarkdownNow', snapshotIndex))

    expect(commitBody).toContain(
      'const nextMarkdown = meta.displayRestoreReady ? getEditorMarkdownForPersistence(editor) : meta.markdown',
    )
    expect(snapshotBody).toContain(
      'const markdown = meta.displayRestoreReady ? getEditorMarkdownForPersistence(meta.editor) : meta.markdown',
    )
  })

  it('replaces mounted editor content when external state reloads change aisle markdown', () => {
    expect(source).toContain('const cachedMarkdown = lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown')
    expect(source).toContain('if (cachedMarkdown !== aisle.markdown && existing.markdown !== aisle.markdown) {')
    expect(source).toContain('existing.markdown = aisle.markdown')
    expect(source).toContain('existing.displayRestoreReady = false')
    expect(source).toContain('lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)')
    expect(source).toContain('setEditorMarkdownForDisplay(existing.editor, aisle.markdown, false)')
    expect(source).toContain('restoreEditorDisplayWhenReady(editorKey, existing, aisle.markdown)')
  })

  it('routes toolbar and native editor history through guarded ProseMirror history', () => {
    expect(source).toContain('runWysiwygHistory,')
    expect(source).toContain('const runGuardedEditorHistory = useCallback')
    expect(source).toContain('const historyDirection = getEditorKeyboardHistoryDirection(event, isMacPlatformRef.current)')
    expect(source).toContain('const historyDirection = getEditorBeforeInputHistoryDirection(event)')
    expect(source).toContain("root.addEventListener('beforeinput', handleBeforeInput, true)")
    expect(source).toContain("root.removeEventListener('beforeinput', handleBeforeInput, true)")

    const undoBranchStart = source.indexOf("if (command === 'undo' || command === 'redo') {")
    const undoBranchEnd = source.indexOf("if (command === 'bold'", undoBranchStart)
    const undoBranch = source.slice(undoBranchStart, undoBranchEnd)

    expect(undoBranchStart).toBeGreaterThan(-1)
    expect(undoBranchEnd).toBeGreaterThan(undoBranchStart)
    expect(undoBranch).toContain('return runGuardedEditorHistory(editor, command)')
    expect(undoBranch).not.toContain('runEditorCommandOperation')
  })
})
