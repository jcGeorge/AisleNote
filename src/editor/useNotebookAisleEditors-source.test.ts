import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./useNotebookAisleEditors.ts', import.meta.url), 'utf8')

describe('notebook aisle editor task checkbox wiring', () => {
  it('registers raw inline span support with Toast UI', () => {
    expect(source).toContain("import { AISLENOTE_TOAST_HTML_RENDERER } from './toast-inline-html-renderer'")
    expect(source).toContain('customHTMLRenderer: AISLENOTE_TOAST_HTML_RENDERER')
  })

  it('fails closed after a Toast UI editor mount error for the same aisle revision', () => {
    expect(source).toContain('type NotebookAisleEditorMountFailure = {')
    expect(source).toContain('const failedEditorMountsRef = useRef<Map<string, NotebookAisleEditorMountFailure>>(new Map())')
    expect(source).toContain('const [failedEditorMountAisleIds, setFailedEditorMountAisleIds] = useState<Set<string>>(() => new Set())')
    expect(source).toContain('const hasMatchingEditorMountFailure = useCallback')
    expect(source).toContain('failure.markdown === aisle.markdown')
    expect(source).toContain('const recordEditorMountFailure = useCallback')
    expect(source).toContain('if (hasMatchingEditorMountFailure(editorKey, aisle)) return')
    expect(source).toContain('recordEditorMountFailure(editorKey, aisle)')
    expect(source).toContain('failedEditorMountAisleIds,')
  })

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

  it('keeps lifecycle display-restoration guards while snapshots use dirty-only live reads', () => {
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
    expect(source).toContain('const getMarkdownSnapshotForMeta = useCallback')
    expect(source).toContain('const shouldReadLiveMarkdown =')
    expect(source).toContain('meta.aisleId === activeEditorAisleIdRef.current || meta.userEditedSinceProgrammaticUpdate')
    expect(source).toContain('const markdown = shouldReadLiveMarkdown ? getEditorMarkdownForPersistence(meta.editor) : meta.markdown')
    expect(snapshotBody).toContain('const snapshotMarkdown = getMarkdownSnapshotForMeta(meta)')
    expect(snapshotBody).toContain('revision: snapshotMarkdown.revision')
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

  it('schedules user markdown commits to app state and exposes an explicit flush', () => {
    expect(source).toContain('const EDITOR_APP_STATE_COMMIT_DEBOUNCE_MS = 300')
    expect(source).toContain('const EDITOR_APP_STATE_COMMIT_MAX_WAIT_MS = 1200')
    expect(source).toContain('const pendingAppStateCommitRevisionsByAisleBodyRef = useRef<Map<string, number>>(new Map())')
    expect(source).toContain('const flushPendingEditorAppStateCommit = useCallback')
    expect(source).toContain('const schedulePendingEditorAppStateCommit = useCallback')
    expect(source).toContain('const scheduleEditorOriginatedAisleMarkdownCommit = useCallback')
    expect(source).toContain('pendingAppStateCommitRevisionsByAisleBodyRef.current.set(aisleBodyId, revision)')
    expect(source).toContain('scheduleEditorOriginatedAisleMarkdownCommit(meta.aisleBodyId, revision)')
    expect(source).toContain('if (pendingAppStateCommitRevisionsByAisleBodyRef.current.has(meta.aisleBodyId)) return')
    expect(source).toContain('flushPendingEditorAppStateCommit,')

    const commitIndex = source.indexOf('const commitEditorMarkdown = useCallback')
    const snapshotIndex = source.indexOf('const commitActiveEditorMarkdownNow = useCallback', commitIndex)
    const commitBody = source.slice(commitIndex, snapshotIndex)
    expect(commitBody).toContain("if (source === 'user') {")
    expect(commitBody).toContain('scheduleEditorOriginatedAisleMarkdownCommit(meta.aisleBodyId, revision)')
    expect(commitBody).not.toContain('commitEditorOriginatedAisleMarkdown(meta.aisleBodyId, nextMarkdown, revision)')

    const mountedCommitIndex = source.indexOf('const commitMountedEditorMarkdownNow = useCallback')
    const replaceIndex = source.indexOf('const replaceActiveEditorMarkdown = useCallback', mountedCommitIndex)
    const mountedCommitBody = source.slice(mountedCommitIndex, replaceIndex)
    expect(mountedCommitBody).toContain('clearScheduledEditorAppStateCommit()')
    expect(mountedCommitBody).toContain('pendingAppStateCommitRevisionsByAisleBodyRef.current.delete(aisleBodyId)')
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

  it('refreshes tag autocomplete when editor query state can change', () => {
    expect(source).toContain('onTagAutocompleteQueryChange?: () => void')
    expect(source).toContain('const onTagAutocompleteQueryChangeRef = useRef(onTagAutocompleteQueryChange)')
    expect(source).toContain('onTagAutocompleteQueryChangeRef.current = onTagAutocompleteQueryChange')
    expect(source).toContain('const handleEditorQueryProbe = () => {')
    expect(source).toContain('onTagAutocompleteQueryChangeRef.current?.()')
    expect(source).toContain("root.addEventListener('keyup', handleEditorQueryProbe)")
    expect(source).toContain("root.addEventListener('mouseup', handleEditorQueryProbe)")
    expect(source).toContain("root.removeEventListener('keyup', handleEditorQueryProbe)")
    expect(source).toContain("root.removeEventListener('mouseup', handleEditorQueryProbe)")
    expect(source.match(/onTagAutocompleteQueryChangeRef\.current\?\.\(\)/g) ?? []).toHaveLength(2)
  })

  it('exposes range scrolling for find result navigation', () => {
    expect(source).toContain('const scrollToAisleRange = useCallback')
    expect(source).toContain('return meta ? scrollToRange(meta.editor, from, to) : false')
    expect(source).toContain('scrollToAisleRange,')
  })

  it('routes internal note reference insertions through a note-aware ProseMirror path', () => {
    expect(source).toContain("import {\n  insertMarkdownNoteReferenceTokenIntoView,")
    expect(source).toContain('const insertNoteReferenceAtSelection = useCallback')
    expect(source).toContain('insertMarkdownNoteReferenceTokenIntoView(view, token, range)')
    expect(source).toContain('finishEditorOperation(editorOperationRuntime, editor, { commitMode: \'deferred\', syncToolbar: true })')
    expect(source).toContain('notifyNoteMentionQueryChange(editor)')
    expect(source).toContain('insertNoteReferenceAtSelection,')
  })

  it('resolves active editor internal note-link clicks before external URL handling', () => {
    expect(source).toContain('export function resolveEditorInternalNoteLinkTarget')
    expect(source).toContain('const getAppStateRef = useRef(getAppState)')
    expect(source).toContain('const onOpenNoteReferenceRef = useRef(onOpenNoteReference)')
    expect(source).toContain('const noteTarget = isPlainPrimaryEditorClick(event)')
    expect(source).toContain('resolveEditorInternalNoteLinkTarget(getAppStateRef.current?.() ?? null, href, anchor.textContent ?? \'\')')
    expect(source).toContain('onOpenNoteReferenceRef.current(noteTarget)')

    const clickHandlerStart = source.indexOf('const handleLinkClick = (event: MouseEvent) => {')
    const clickHandlerEnd = source.indexOf('root.addEventListener(\'focusin\', handleFocus)', clickHandlerStart)
    const clickHandler = source.slice(clickHandlerStart, clickHandlerEnd)
    expect(clickHandler.indexOf('resolveEditorInternalNoteLinkTarget')).toBeLessThan(clickHandler.indexOf('openExternalWebUrl(href)'))
  })

  it('handles frontmatter clipboard paste before normal editor content paste', () => {
    expect(source).toContain("from '../frontmatter/frontmatter-clipboard'")
    expect(source).toContain('onFrontmatterPaste?: (payload: FrontmatterClipboardPayload, aisleId: string) => boolean')
    expect(source).toContain('const onFrontmatterPasteRef = useRef(onFrontmatterPaste)')
    expect(source).toContain('onFrontmatterPasteRef.current = onFrontmatterPaste')
    expect(source).toContain('readFrontmatterClipboardPayloadFromDataTransfer(event.clipboardData, {')
    expect(source).toContain('allowYamlFallback: false')
    expect(source).toContain('onFrontmatterPasteRef.current?.(frontmatterPayload, aisle.id)')
    expect(source).toContain('readFrontmatterClipboardPayloadFromNavigator(undefined, {')
    expect(source).toContain('onFrontmatterPasteRef.current?.(frontmatterPayload, targetAisleId)')

    const pasteHandlerStart = source.indexOf('const handlePaste = (event: ClipboardEvent) => {')
    const pasteHandlerEnd = source.indexOf('const handleKeyDown = (event: KeyboardEvent) => {', pasteHandlerStart)
    const pasteHandler = source.slice(pasteHandlerStart, pasteHandlerEnd)
    expect(pasteHandler.indexOf('readFrontmatterClipboardPayloadFromDataTransfer')).toBeLessThan(
      pasteHandler.indexOf('readNotebookStructureClipboardPayloadFromDataTransfer'),
    )
  })
})

describe('notebook aisle editor heading collapse wiring', () => {
  it('installs the heading collapse plugin with persisted collapse state', () => {
    expect(source).toContain("import { headingCollapsePlugin } from './heading-collapse-plugin'")
    expect(source).toContain("import { getCollapsedHeadingKeysForAisle } from './heading-collapse-state'")
    expect(source).toContain('headingCollapseState: HeadingCollapseState')
    expect(source).toContain('onToggleHeadingCollapse: (noteBodyId: string, aisleId: string, headingKey: string) => void')
    expect(source).toContain('onExpandHeadingCollapse: (noteBodyId: string, aisleId: string, headingKey: string) => void')
    expect(source).toContain('const headingCollapseStateRef = useRef(headingCollapseState)')
    expect(source).toContain('headingCollapseStateRef.current = headingCollapseState')
    expect(source).toContain('headingCollapsePlugin(context, {')
    expect(source).toContain('getCollapsedHeadingKeysForAisle(headingCollapseStateRef.current, noteBodyIdRef.current, targetAisleId)')
    expect(source).toContain('getMarkdown: getMarkdownForAisle')
    expect(source).toContain('onToggleHeadingCollapse(noteBodyIdRef.current, targetAisleId, headingKey)')
    expect(source).toContain('onExpandHeadingCollapse(noteBodyIdRef.current, targetAisleId, headingKey)')
  })

  it('refreshes mounted editor decorations after heading collapse state changes', () => {
    expect(source).toMatch(
      /useEffect\(\(\) => {\s*if \(viewMode !== 'main' \|\| !noteBodyId\) return\s*editorMetaRef\.current\.forEach\(\(meta\) => {\s*const view = getWysiwygView\(meta\.editor\)/,
    )
    expect(source).toContain("view.dispatch(view.state.tr.setMeta('headingCollapseRefresh', true).setMeta('addToHistory', false))")
    expect(source).toContain('}, [viewMode, noteBodyId, headingCollapseState])')
  })
})
