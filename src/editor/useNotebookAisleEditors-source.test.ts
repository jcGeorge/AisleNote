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

  it('keeps lifecycle display-restoration guards while user and snapshot commits read live markdown', () => {
    expect(source).toContain('displayRestoreReady: boolean')
    expect(source).toContain("type NotebookEditorMarkdownCommitSource = 'user' | 'programmatic' | 'lifecycle'")
    expect(source).toContain('const DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS = 8')
    expect(source).toContain('const restoreEditorDisplayWhenReady = useCallback')
    expect(source).toContain('if (result.displayReady) {')
    expect(source).toContain('window.requestAnimationFrame(() => {')
    expect(source).toContain('remainingFrameAttempts - 1')

    const commitIndex = source.indexOf('const commitEditorMarkdown = useCallback')
    const snapshotIndex = source.indexOf('const getMountedEditorMarkdownSnapshots = useCallback')
    const commitBody = source.slice(commitIndex, snapshotIndex)
    const snapshotBody = source.slice(snapshotIndex, source.indexOf('const commitMountedEditorMarkdownNow', snapshotIndex))

    expect(commitBody).toContain("source: NotebookEditorMarkdownCommitSource = 'user'")
    expect(commitBody).toContain("source === 'lifecycle' && !meta.displayRestoreReady")
    expect(commitBody).toContain("source === 'programmatic'")
    expect(commitBody).toContain('!meta.userEditedSinceProgrammaticUpdate')
    expect(commitBody).toContain('getEditorMarkdownForPersistence(editor)')
    expect(snapshotBody).toContain('reconcileMountedEditorsFromExternalState()')
    expect(snapshotBody).toContain('!meta.userEditedSinceProgrammaticUpdate')
    expect(snapshotBody).toContain('const markdown = useCachedMarkdown ? meta.markdown : getEditorMarkdownForPersistence(meta.editor)')
    expect(snapshotBody).toContain('revision: meta.revision')
    expect(snapshotBody).toContain('active: meta.aisleId === activeEditorAisleIdRef.current')
    expect(source).toContain("commitEditorMarkdown(meta, meta.editor, 'lifecycle')")
    expect(source).toContain('programmaticMarkdownUpdatePending: true')
  })

  it('replaces mounted editor content when external state reloads change aisle markdown', () => {
    expect(source).toContain('const previouslyRenderedMarkdown = renderedMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId)')
    expect(source).toContain('const stateMarkdownChanged = previouslyRenderedMarkdown !== undefined && previouslyRenderedMarkdown !== aisle.markdown')
    expect(source).toContain('const cachedMarkdown = lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown')
    expect(source).toContain('if (stateMarkdownChanged) {')
    expect(source).toContain('const localStateEcho = takeMatchingLocalStateEcho(aisle.aisleBodyId, aisle.markdown)')
    expect(source).toContain('lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)')
    expect(source).toContain('const existingMarkdownMatchesLocalState =')
    expect(source).toContain('normalizeMarkdownForPersistence(existing.markdown) === aisle.markdown')
    expect(source).toContain('if (localStateEcho && existingMarkdownMatchesLocalState) {')
    expect(source).toContain('replaceMountedEditorMarkdown(editorKey, existing, aisle.markdown, revision)')
  })

  it('acknowledges local state echoes without rewriting the mounted source editor', () => {
    expect(source).toContain('type NotebookEditorLocalStateEcho = {')
    expect(source).toContain('const localStateEchoByAisleBodyRef = useRef<Map<string, NotebookEditorLocalStateEcho>>(new Map())')
    expect(source).toContain('const markLocalStateEchoForAisleBody = useCallback')
    expect(source).toContain('canonicalMarkdown: normalizeMarkdownForPersistence(markdown)')
    expect(source).toContain('externalStateLoadVersion: externalStateLoadVersionRef.current')
    expect(source).toContain('const takeMatchingLocalStateEcho = useCallback')
    expect(source).toContain('echo.externalStateLoadVersion !== externalStateLoadVersionRef.current')
    expect(source).toContain('(echo.markdown !== markdown && echo.canonicalMarkdown !== markdown)')
    expect(source).toContain('localStateEchoByAisleBodyRef.current.delete(aisleBodyId)')

    const helperStart = source.indexOf('const commitEditorOriginatedAisleMarkdown = useCallback')
    const helperEnd = source.indexOf('const markEditorUserEditIntent = useCallback', helperStart)
    const helperBody = source.slice(helperStart, helperEnd)
    expect(helperBody).toContain('markLocalStateEchoForAisleBody(aisleBodyId, markdown, revision)')
    expect(helperBody).toContain('commitAisleMarkdown(aisleBodyId, markdown)')
    expect(helperBody.indexOf('markLocalStateEchoForAisleBody')).toBeLessThan(helperBody.indexOf('commitAisleMarkdown'))

    const renderStart = source.indexOf('if (stateMarkdownChanged) {')
    const renderEnd = source.indexOf('} else if (cachedMarkdown !== aisle.markdown', renderStart)
    const renderBranch = source.slice(renderStart, renderEnd)
    expect(renderBranch).toContain('const localStateEcho = takeMatchingLocalStateEcho(aisle.aisleBodyId, aisle.markdown)')
    expect(renderBranch).toContain('const existingMarkdownMatchesLocalState =')
    expect(renderBranch).toContain('normalizeMarkdownForPersistence(existing.markdown) === aisle.markdown')
    expect(renderBranch).toContain('if (localStateEcho && existingMarkdownMatchesLocalState) {')
    expect(renderBranch).toContain('return')
    expect(renderBranch).toContain('replaceMountedEditorMarkdown(editorKey, existing, aisle.markdown, revision)')
    expect(renderBranch.indexOf('return')).toBeLessThan(renderBranch.indexOf('replaceMountedEditorMarkdown'))
  })

  it('propagates user edits from one mounted synced aisle mirror to stale mirrors of the same body', () => {
    expect(source).toContain('revision: number')
    expect(source).toContain('programmaticMarkdownUpdatePending: boolean')
    expect(source).toContain('userEditedSinceProgrammaticUpdate: boolean')
    expect(source).toContain('const revisionByAisleBodyRef = useRef<Map<string, number>>(new Map())')
    expect(source).toContain('const externalStateLoadVersionRef = useRef(externalStateLoadVersion)')
    expect(source).toContain('const externalReconciledVersionByAisleBodyRef = useRef<Map<string, number>>(new Map())')
    expect(source).toContain('const userEditedExternalVersionByAisleBodyRef = useRef<Map<string, number>>(new Map())')
    expect(source).toContain('const editorMarkdownRevisionRef = useRef(0)')
    expect(source).toContain('const syncMountedEditorsForAisleBody = useCallback')
    expect(source).toContain('if (meta === sourceMeta || meta.aisleBodyId !== sourceMeta.aisleBodyId) return')
    expect(source).toContain('replaceMountedEditorMarkdown(editorKey, meta, markdown, revision)')
    expect(source).toContain('syncMountedEditorsForAisleBody(meta, nextMarkdown, revision)')
    expect(source).toContain('cachedMarkdown !== aisle.markdown && existing.markdown !== cachedMarkdown')
    expect(source).toContain('cachedMarkdown === aisle.markdown && existing.markdown !== aisle.markdown')
    expect(source).toContain('collapseNotebookEditorMarkdownSnapshots(getMountedEditorMarkdownSnapshots()).forEach((snapshot) => {')
    expect(source).toContain('markLocalStateEchoForAisleBody(snapshot.aisleBodyId, snapshot.markdown, snapshot.revision ?? 0)')
    expect(source).toContain('revision: revisionByAisleBodyRef.current.get(aisle.aisleBodyId) ?? 0')
    expect(source).toContain('revisionByAisleBodyRef.current.set(meta.aisleBodyId, revision)')
    expect(source).toContain('syncMountedEditorsForAisleBody(meta, meta.markdown, revision)')
  })

  it('does not let pending programmatic mirror refreshes hide later user edits', () => {
    expect(source).toContain('const markEditorUserEditIntent = useCallback')
    expect(source).toContain('meta.userEditedSinceProgrammaticUpdate = true')
    expect(source).toContain('const markEditorUserEditIntentForEditor = useCallback')
    expect(source).toContain('markEditorUserEditIntent(editorKey)')
    expect(source).toContain("meta.programmaticMarkdownUpdatePending && !meta.userEditedSinceProgrammaticUpdate\n                  ? 'programmatic'\n                  : 'user'")
    expect(source).toContain('markEditorUserEditIntentForEditor(editor)')
    expect(source).toContain('meta.userEditedSinceProgrammaticUpdate = false')
  })

  it('reconciles mounted editors from externally loaded app state before snapshots can overwrite it', () => {
    expect(source).toContain('externalStateLoadVersion: number')
    expect(source).toContain('externalStateLoadVersionRef.current = externalStateLoadVersion')
    expect(source).toContain('const reconcileMountedEditorsFromExternalState = useCallback')
    expect(source).toContain('const appState = getAppState?.()')
    expect(source).toContain('appState.noteAisleBodies.map((body) => [body.id, body.markdown ?? \'\'])')
    expect(source).toContain('const authoritativeMarkdown = markdownByAisleBodyId.get(meta.aisleBodyId)')
    expect(source).toContain('if (meta.markdown === authoritativeMarkdown) {')
    expect(source).toContain('const userEditVersion = userEditedExternalVersionByAisleBodyRef.current.get(meta.aisleBodyId) ?? -1')
    expect(source).toContain('const reconciledVersion = externalReconciledVersionByAisleBodyRef.current.get(meta.aisleBodyId) ?? -1')
    expect(source).toContain('userEditVersion >= externalVersion && reconciledVersion < externalVersion')
    expect(source).toContain('replaceMountedEditorMarkdown(editorKey, meta, authoritativeMarkdown, revision)')
    expect(source).toContain('syncMountedEditorsForAisleBody(meta, authoritativeMarkdown, revision)')
    expect(source).toContain('externalReconciledVersionByAisleBodyRef.current.set(meta.aisleBodyId, externalVersion)')
  })

  it('clears the external reload fence when a real user edit becomes canonical', () => {
    expect(source).toContain('const markUserEditedAisleBodyAtCurrentExternalVersion = useCallback')
    expect(source).toContain('userEditedExternalVersionByAisleBodyRef.current.set(aisleBodyId, externalVersion)')
    expect(source).toContain('externalReconciledVersionByAisleBodyRef.current.set(aisleBodyId, externalVersion)')
    expect(source).toContain("if (source === 'user') markUserEditedAisleBodyAtCurrentExternalVersion(meta.aisleBodyId)")
    expect(source).toContain('markUserEditedAisleBodyAtCurrentExternalVersion(meta.aisleBodyId)')
  })

  it('replaces mounted editor content through the shared markdown helper', () => {
    expect(source).toContain('const replaceMountedEditorMarkdown = useCallback')
    expect(source).toContain('meta.displayRestoreReady = false')
    expect(source).toContain('meta.programmaticMarkdownUpdatePending = true')
    expect(source).toContain('meta.userEditedSinceProgrammaticUpdate = false')
    expect(source).toContain('setEditorMarkdownForDisplay(meta.editor, markdown, false)')
    expect(source).toContain('restoreEditorDisplayWhenReady(editorKey, meta, markdown)')
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
