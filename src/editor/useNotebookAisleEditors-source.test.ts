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
    expect(source).toContain('focusAtClientPoint?: { clientX: number; clientY: number }')
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
})
