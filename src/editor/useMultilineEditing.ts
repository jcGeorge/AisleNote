/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import { Selection, TextSelection } from 'prosemirror-state'
import {
  buildDeletedLineMultiLineState,
  buildForwardBoundaryDeletePlan,
  buildSelectedRowDeletePlan,
  buildSplitLineMultiLineState,
  cloneMultiLineEditState,
  findNextWordColumn,
  findPreviousWordColumn,
  getEmptyMultiLineBlockDeleteTargets,
  getMultiLineColumnOffset,
  getMultiLineHeadColumnOffset,
  getMultiLinePageMovementRowDelta,
  getMultiLineSelectionRange,
  getMultiLineSelectionRanges,
  getMultiLineSelectedBlockIndices,
  getMultiLineSplitPlan,
  moveMultiLineCursorState,
  shouldApplyMultiLineWholeSelectionBoundaryDelete,
  type MultiLineCursorMovement,
  type MultiLineEditInput,
} from './multiline-edit'
import {
  findEditorTextLineRangeIndex,
  getEditorTextLineRanges,
  isCodeBlockTextLineRange,
} from './multiline-ranges'
import {
  CODE_BLOCK_INDENT_TEXT,
  getCodeBlockOutdentRemoveLength,
} from './prosemirror-utils'
import { applyStructuralListIndent } from './list-marker-commands'
import {
  buildMultiLineListOperationPlan,
  getMultiLineListMarkerShortcut,
  type MultiLineListOperation,
} from './multiline-list-operations'
import {
  applyActiveInlineFormatsToStoredMarks,
  applyActiveInlineFormatsToInsertedText,
  buildMultiLineBlockQuoteOperationPlan,
  buildMultiLineBlockIndentOperationPlan,
  buildMultiLineCodeBlockOperationPlan,
  buildMultiLineHeadingOperationPlan,
  buildMultiLineInlineFormatPlan,
  buildMultiLineInlineMarkerOperationPlan,
  buildMultiLineRemoveBlockIndentOperationPlan,
  buildMultiLineRemoveBlockQuoteOperationPlan,
  buildSelectionBlockIndentOperationPlan,
  buildSelectionBlockQuoteOperationPlan,
  buildSelectionRemoveBlockIndentOperationPlan,
  buildSelectionRemoveBlockQuoteOperationPlan,
  getMultiLineBlockQuoteMarkerShortcut,
  getMultiLineHeadingMarkerShortcut,
  multiLineSelectionTouchesBlockQuoteRows,
  selectionTouchesBlockQuoteRows,
  type MultiLineHeadingLevel,
} from './multiline-format-operations'
import {
  getBlockIndentPrefixLength,
  getIndentPrefixLength,
  getTrailingIndentPrefixLength,
  INDENT_TOKEN,
  mergeLeadingIndentsFromWysiwyg,
  normalizeMarkdownForPersistence,
} from '../markdown/markdown-utils'
import type { MultiLineEditState, MultiLineInlineFormat } from '../types/app'

type MultiLineEditHistoryEntry = {
  noteKey: string
  beforeMarkdown: string
  afterMarkdown: string
  beforeState: MultiLineEditState
  afterState: MultiLineEditState
}

type EditorWithWysiwyg = Editor & {
  wwEditor?: {
    view?: any
  }
  setSelection?: (start: number, end: number) => void
}

type UseMultilineEditingOptions = {
  editorRef: MutableRefObject<Editor | null>
  lastEditorMarkdownRef: MutableRefObject<string>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
  isEditorView: boolean
  shortcutDependency: unknown
  getActiveNoteHistoryKey: () => string
  getNormalizedEditorMarkdown: (editor: Editor) => string
  scheduleContentCommit: (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
  ) => void
}

type ClearMultiLineEditOptions = {
  deferWidgetClear?: boolean
}

type MultiLineDecorationSnapshot = {
  cursors?: unknown
  selections?: unknown
}

type SetCursorWidgetOptions = {
  preserveSelection?: boolean
  skipEmptyClear?: boolean
}

export type MultiLineWidgetClearMode = 'none' | 'defer' | 'immediate'

export function getMultiLineWidgetClearMode(
  previous: MultiLineEditState | null,
  collapseToHead = false,
  options: ClearMultiLineEditOptions = {},
): MultiLineWidgetClearMode {
  if (!previous) return 'none'
  return !collapseToHead && options.deferWidgetClear ? 'defer' : 'immediate'
}

export function hasMultiLineDecorationState(state: unknown): boolean {
  const snapshot = state as MultiLineDecorationSnapshot | null | undefined
  return Boolean(
    (Array.isArray(snapshot?.cursors) && snapshot.cursors.length > 0) ||
      (Array.isArray(snapshot?.selections) && snapshot.selections.length > 0),
  )
}

export function getStructuralListIndentCommitMarkdown(
  editor: Editor,
  getNormalizedEditorMarkdown: (editor: Editor) => string,
): string {
  return getNormalizedEditorMarkdown(editor)
}

export function shouldApplyBlockIndentOperationForTab(options: {
  outdent: boolean
  isCollapsedSelection: boolean
  touchesBlockQuoteRows: boolean
}): boolean {
  return !options.outdent && !options.isCollapsedSelection && !options.touchesBlockQuoteRows
}

export function useMultilineEditing({
  editorRef,
  lastEditorMarkdownRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  isEditorView,
  shortcutDependency,
  getActiveNoteHistoryKey,
  getNormalizedEditorMarkdown,
  scheduleContentCommit,
}: UseMultilineEditingOptions) {
  const editStateRef = useRef<MultiLineEditState | null>(null)
  const pluginKeyRef = useRef<any>(null)
  const historyRef = useRef<MultiLineEditHistoryEntry[]>([])
  const deferredWidgetClearFrameRef = useRef<number | null>(null)
  const deferredWidgetClearTimeoutRef = useRef<number | null>(null)

  const getCurrentEditorAndView = () => {
    const currentEditor = editorRef.current as EditorWithWysiwyg | null
    const view = currentEditor?.wwEditor?.view
    return { currentEditor, view }
  }

  const commitMarkdown = (markdown: string) => {
    lastEditorMarkdownRef.current = markdown
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  const recordHistory = (
    beforeMarkdown: string,
    beforeState: MultiLineEditState,
    afterMarkdown: string,
    afterState: MultiLineEditState,
  ) => {
    if (beforeMarkdown === afterMarkdown) return
    historyRef.current = [
      ...historyRef.current.slice(-99),
      {
        noteKey: getActiveNoteHistoryKey(),
        beforeMarkdown,
        afterMarkdown,
        beforeState: cloneMultiLineEditState(beforeState),
        afterState: cloneMultiLineEditState(afterState),
      },
    ]
  }

  const getCursorWidgetState = (view: any) => {
    const pluginKey = pluginKeyRef.current
    if (!pluginKey || typeof pluginKey.getState !== 'function') return null
    return pluginKey.getState(view.state)
  }

  const setCursorWidgets = (
    view: any,
    positions: number[],
    selections: Array<{ from: number; to: number }> = [],
    options: SetCursorWidgetOptions = {},
  ) => {
    const pluginKey = pluginKeyRef.current
    if (!pluginKey) return
    if (
      options.skipEmptyClear &&
      positions.length === 0 &&
      selections.length === 0 &&
      !hasMultiLineDecorationState(getCursorWidgetState(view))
    ) {
      return
    }

    let transaction = view.state.tr.setMeta(pluginKey, { cursors: positions, selections }).setMeta('addToHistory', false)
    if (options.preserveSelection && view.state.selection) {
      transaction = transaction.setSelection(view.state.selection)
    }
    view.dispatch(transaction)
  }

  const cancelDeferredWidgetClear = () => {
    if (deferredWidgetClearFrameRef.current !== null) {
      window.cancelAnimationFrame(deferredWidgetClearFrameRef.current)
      deferredWidgetClearFrameRef.current = null
    }
    if (deferredWidgetClearTimeoutRef.current !== null) {
      window.clearTimeout(deferredWidgetClearTimeoutRef.current)
      deferredWidgetClearTimeoutRef.current = null
    }
  }

  const scheduleDeferredWidgetClear = (view: any) => {
    cancelDeferredWidgetClear()
    deferredWidgetClearFrameRef.current = window.requestAnimationFrame(() => {
      deferredWidgetClearFrameRef.current = null
      deferredWidgetClearTimeoutRef.current = window.setTimeout(() => {
        deferredWidgetClearTimeoutRef.current = null
        const { view: activeView } = getCurrentEditorAndView()
        if (activeView !== view || editStateRef.current) return
        setCursorWidgets(view, [], [], { preserveSelection: true, skipEmptyClear: true })
      }, 0)
    })
  }

  useEffect(() => () => cancelDeferredWidgetClear(), [])

  const clear = (collapseToHead = false, options: ClearMultiLineEditOptions = {}) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const previous = editStateRef.current
    const widgetClearMode = getMultiLineWidgetClearMode(previous, collapseToHead, options)
    if (widgetClearMode === 'none' || !previous) return

    editStateRef.current = null
    if (view) {
      if (widgetClearMode === 'defer') {
        scheduleDeferredWidgetClear(view)
      } else {
        cancelDeferredWidgetClear()
        setCursorWidgets(view, [], [], { preserveSelection: true, skipEmptyClear: true })
      }
    }
    if (!collapseToHead || !view) return

    const blockRanges = getEditorTextLineRanges(view)
    const clampedHeadIndex = Math.max(0, Math.min(blockRanges.length - 1, previous.headBlockIndex))
    const headRange = blockRanges[clampedHeadIndex]
    if (!headRange) return
    const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(previous, clampedHeadIndex, headRange))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return
    const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
    currentEditor?.focus()
  }

  const syncVisualSelection = () => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      editStateRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length === 0) {
      editStateRef.current = null
      setCursorWidgets(view, [])
      return false
    }

    const anchorIndex = selectedIndices.includes(multiLineEdit.anchorBlockIndex)
      ? multiLineEdit.anchorBlockIndex
      : selectedIndices[0]
    const headIndex = selectedIndices.includes(multiLineEdit.headBlockIndex)
      ? multiLineEdit.headBlockIndex
      : selectedIndices[selectedIndices.length - 1]
    const anchorRange = blockRanges[anchorIndex]
    const headRange = blockRanges[headIndex]
    if (!anchorRange || !headRange) {
      editStateRef.current = null
      return false
    }

    if (selectedIndices.length < 2) {
      editStateRef.current = null
      setCursorWidgets(view, [])
      const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(multiLineEdit, headIndex, headRange))
      const SelectionCtor = view.state.selection.constructor as {
        create?: (doc: unknown, anchor: number, head?: number) => unknown
      }
      if (typeof SelectionCtor.create !== 'function') return false
      const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
      let tr = view.state.tr.setSelection(nextSelection).scrollIntoView()
      tr = applyActiveInlineFormatsToStoredMarks(tr, view.state.schema, undefined)
      view.dispatch(tr)
      return false
    }

    const selectionAnchorOffsets = selectedIndices.reduce<Record<number, number>>((acc, blockIndex) => {
      const rawOffset = multiLineEdit.selectionAnchorOffsets?.[blockIndex]
      const range = blockRanges[blockIndex]
      if (typeof rawOffset === 'number' && range) {
        acc[blockIndex] = Math.max(0, Math.min(range.length, rawOffset))
      }
      return acc
    }, {})
    const normalizedMultiLineEdit: MultiLineEditState = {
      ...multiLineEdit,
      anchorBlockIndex: anchorIndex,
      headBlockIndex: headIndex,
      cursorBlockIndices: multiLineEdit.cursorBlockIndices ? selectedIndices : undefined,
      selectionAnchorOffsets: Object.keys(selectionAnchorOffsets).length > 0 ? selectionAnchorOffsets : undefined,
    }
    editStateRef.current = normalizedMultiLineEdit

    const headOffset = getMultiLineColumnOffset(normalizedMultiLineEdit, headIndex, headRange)
    const headPos = Math.min(headRange.end, headRange.start + headOffset)
    const cursorPositions = selectedIndices
      .map((blockIndex) => {
        const range = blockRanges[blockIndex]
        return range ? Math.min(range.end, range.start + getMultiLineColumnOffset(normalizedMultiLineEdit, blockIndex, range)) : null
      })
      .filter((pos): pos is number => typeof pos === 'number' && pos !== headPos)
    const selectionDecorations = getMultiLineSelectionRanges(normalizedMultiLineEdit, selectedIndices, blockRanges).map(
      ({ from, to }) => ({ from, to }),
    )

    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return false
    const nextSelection = SelectionCtor.create(view.state.doc, headPos, headPos)
    let tr = view.state.tr.setSelection(nextSelection).setMeta('addToHistory', false).scrollIntoView()
    tr = applyActiveInlineFormatsToStoredMarks(tr, view.state.schema, normalizedMultiLineEdit.activeInlineFormats)
    const pluginKey = pluginKeyRef.current
    if (pluginKey) {
      tr = tr.setMeta(pluginKey, { cursors: cursorPositions, selections: selectionDecorations })
    }
    view.dispatch(tr)
    currentEditor.focus()
    return true
  }

  const scheduleHistoryRestore = (direction: 'undo' | 'redo') => {
    const noteKey = getActiveNoteHistoryKey()
    window.requestAnimationFrame(() => {
      if (noteKey !== getActiveNoteHistoryKey()) return
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const markdown = getNormalizedEditorMarkdown(currentEditor)
      const entry = [...historyRef.current]
        .reverse()
        .find((candidate) =>
          candidate.noteKey === noteKey &&
          (direction === 'undo' ? candidate.beforeMarkdown === markdown : candidate.afterMarkdown === markdown),
        )
      if (!entry) return

      editStateRef.current = cloneMultiLineEditState(direction === 'undo' ? entry.beforeState : entry.afterState)
      syncVisualSelection()
    })
  }

  const getEditorHistoryDirection = (event: KeyboardEvent): 'undo' | 'redo' | null => {
    const key = event.key.toLowerCase()
    const isMacPlatform = navigator.platform.toLowerCase().includes('mac')
    const isMod = isMacPlatform ? event.metaKey : event.ctrlKey
    if (!isMod || event.altKey) return null
    if (key === 'z' && !event.shiftKey) return 'undo'
    if (key === 'z' && event.shiftKey) return 'redo'
    if (!isMacPlatform && key === 'y' && !event.shiftKey) return 'redo'
    return null
  }

  const tryApplyIndent = (outdent: boolean) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    if (!currentEditor || !view) return false

    const { state } = view
    const { from, to, $from } = state.selection
    const isCollapsedSelection = from === to
    const selectedText = state.doc.textBetween(from, to, '\n')
    const selectionFrom = Math.min(from, to)
    const selectionTo = Math.max(from, to)

    if (applyStructuralListIndent(currentEditor, outdent)) {
      const markdownAfterListIndent = getStructuralListIndentCommitMarkdown(currentEditor, getNormalizedEditorMarkdown)
      commitMarkdown(markdownAfterListIndent)
      window.requestAnimationFrame(() => {
        currentEditor.focus()
      })
      return true
    }

    const touchedLineRanges = getEditorTextLineRanges(view).filter((range) =>
      isCollapsedSelection
        ? selectionFrom >= range.start && selectionFrom <= range.end + 1
        : range.start <= selectionTo && range.end >= selectionFrom,
    )
    const codeBlockLineRanges = touchedLineRanges.filter(isCodeBlockTextLineRange)

    if (!isCollapsedSelection && codeBlockLineRanges.length > 1 && codeBlockLineRanges.length === touchedLineRanges.length) {
      const targets = codeBlockLineRanges
        .map((range) => ({
          pos: range.start,
          removeLength: outdent ? getCodeBlockOutdentRemoveLength(range.text) : 0,
        }))
        .filter((target) => !outdent || target.removeLength > 0)

      if (targets.length === 0) return false

      let tr: any = state.tr
      for (const target of [...targets].sort((a, b) => b.pos - a.pos)) {
        tr = outdent
          ? tr.delete(target.pos, target.pos + target.removeLength)
          : tr.insertText(CODE_BLOCK_INDENT_TEXT, target.pos)
      }

      const nextFrom = tr.mapping.map(from, outdent ? -1 : 1)
      const nextTo = tr.mapping.map(to, outdent ? -1 : 1)
      view.dispatch(tr)
      const markdownAfterCodeIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      commitMarkdown(markdownAfterCodeIndent)
      window.requestAnimationFrame(() => {
        currentEditor.setSelection?.(nextFrom, nextTo)
        currentEditor.focus()
      })
      return true
    }

    if (outdent) {
      const removedBlockIndent = tryRemoveBlockIndentOperation()
      if (removedBlockIndent) return true
    }

    if (
      shouldApplyBlockIndentOperationForTab({
        outdent,
        isCollapsedSelection,
        touchesBlockQuoteRows: selectionTouchesBlockQuoteRows(view),
      })
    ) {
      const appliedBlockIndent = tryApplyBlockIndentOperation()
      if (appliedBlockIndent) return true
    }

    if (!selectedText.includes('\n')) {
      let tr: any = state.tr
      let caretSource: number
      const parentText = $from.parent.textContent ?? ''
      const parentStart = $from.start()
      const offsetInParent = Math.max(0, from - parentStart)

      if (outdent) {
        const beforeCursor = parentText.slice(0, offsetInParent)
        const inlinePrefixLength = getTrailingIndentPrefixLength(beforeCursor)
        if (inlinePrefixLength > 0) {
          tr = tr.delete(from - inlinePrefixLength, from)
          caretSource = from
        } else {
          const blockIndentPrefixLength = getBlockIndentPrefixLength(parentText)
          const linePrefixLength = getIndentPrefixLength(parentText.slice(blockIndentPrefixLength))
          if (linePrefixLength <= 0) return false
          caretSource = parentStart + blockIndentPrefixLength
          tr = tr.delete(caretSource, caretSource + linePrefixLength)
        }
      } else {
        const blockIndentPrefixLength = getBlockIndentPrefixLength(parentText)
        const insertPos =
          blockIndentPrefixLength > 0 && offsetInParent <= blockIndentPrefixLength
            ? parentStart + blockIndentPrefixLength
            : from
        caretSource = insertPos
        tr = tr.insertText(INDENT_TOKEN, insertPos)
      }

      const nextCaret = tr.mapping.map(caretSource, 1)
      const nextFrom = tr.mapping.map(from, 1)
      const nextTo = tr.mapping.map(to, 1)
      view.dispatch(tr)
      const markdownAfterInlineIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      commitMarkdown(markdownAfterInlineIndent)
      window.requestAnimationFrame(() => {
        if (isCollapsedSelection) {
          currentEditor.setSelection?.(nextCaret, nextCaret)
        } else {
          currentEditor.setSelection?.(nextFrom, nextTo)
        }
        currentEditor.focus()
      })
      return true
    }

    const blockTargets: Array<{ pos: number; removeLength: number }> = []
    const seenBlockPositions = new Set<number>()
    const addBlockTarget = (node: any, contentStartPos: number) => {
      if (!node?.isTextblock || seenBlockPositions.has(contentStartPos)) return
      seenBlockPositions.add(contentStartPos)
      const text = node.textContent ?? ''
      const blockIndentPrefixLength = getBlockIndentPrefixLength(text)
      const pos = contentStartPos + blockIndentPrefixLength
      const removeLength = outdent ? getIndentPrefixLength(text.slice(blockIndentPrefixLength)) : 0
      if (!outdent || removeLength > 0) {
        blockTargets.push({ pos, removeLength })
      }
    }

    if (from === to) {
      addBlockTarget($from.parent, $from.start())
    } else {
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isTextblock) return
        addBlockTarget(node, pos + 1)
        return false
      })
      if (blockTargets.length === 0) {
        addBlockTarget($from.parent, $from.start())
      }
    }

    if (blockTargets.length === 0) return false

    let tr: any = state.tr
    for (const target of [...blockTargets].sort((a, b) => b.pos - a.pos)) {
      tr = outdent ? tr.delete(target.pos, target.pos + target.removeLength) : tr.insertText(INDENT_TOKEN, target.pos)
    }

    const nextFrom = tr.mapping.map(from, -1)
    const nextTo = tr.mapping.map(to, 1)
    const nextCaret = tr.mapping.map(from, outdent ? -1 : 1)
    view.dispatch(tr)
    const markdownAfterIndent = normalizeMarkdownForPersistence(
      mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
    )
    commitMarkdown(markdownAfterIndent)
    window.requestAnimationFrame(() => {
      if (isCollapsedSelection) {
        currentEditor.setSelection?.(nextCaret, nextCaret)
      } else {
        currentEditor.setSelection?.(nextFrom, nextTo)
      }
      currentEditor.focus()
    })
    return true
  }

  const tryExpandSelection = (direction: 'up' | 'down') => {
    const { currentEditor, view } = getCurrentEditorAndView()
    if (!currentEditor || !view) return false

    const { state } = view
    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return false

    const existing = editStateRef.current
    if (existing) {
      if (existing.cursorBlockIndices?.length) {
        const existingIndices = getMultiLineSelectedBlockIndices(existing, blockRanges)
        const nextHeadIndex =
          direction === 'down'
            ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
            : Math.max(0, existing.headBlockIndex - 1)
        if (nextHeadIndex === existing.headBlockIndex || existingIndices.includes(nextHeadIndex)) return false
        const nextHeadRange = blockRanges[nextHeadIndex]
        if (!nextHeadRange) return false
        const nextColumn = Math.min(nextHeadRange.length, getMultiLineHeadColumnOffset(existing, blockRanges))
        editStateRef.current = {
          ...existing,
          headBlockIndex: nextHeadIndex,
          columnOffset: nextColumn,
          columnOffsets: {
            ...(existing.columnOffsets ?? {}),
            [nextHeadIndex]: nextColumn,
          },
          cursorBlockIndices: [...existingIndices, nextHeadIndex].sort((a, b) => a - b),
        }
        return syncVisualSelection()
      }

      const nextHeadIndex =
        direction === 'down'
          ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
          : Math.max(0, existing.headBlockIndex - 1)
      if (nextHeadIndex === existing.headBlockIndex) return false
      editStateRef.current = {
        ...existing,
        headBlockIndex: nextHeadIndex,
      }
      return syncVisualSelection()
    }

    const headBlockIndex = findEditorTextLineRangeIndex(blockRanges, state.selection.head)
    if (headBlockIndex < 0) return false

    const targetIndex =
      direction === 'down'
        ? Math.min(blockRanges.length - 1, headBlockIndex + 1)
        : Math.max(0, headBlockIndex - 1)
    if (targetIndex === headBlockIndex) return false

    const currentHeadBlock = blockRanges[headBlockIndex]
    const columnOffset = Math.max(0, Math.min(currentHeadBlock.length, state.selection.head - currentHeadBlock.start))
    editStateRef.current = {
      anchorBlockIndex: headBlockIndex,
      headBlockIndex: targetIndex,
      columnOffset,
    }
    return syncVisualSelection()
  }

  useEffect(() => {
    window.__tabsHandleMultilineShortcut = (direction) => {
      if (!isEditorView) return false
      return tryExpandSelection(direction)
    }
    return () => {
      if (window.__tabsHandleMultilineShortcut) {
        delete window.__tabsHandleMultilineShortcut
      }
    }
  }, [isEditorView, shortcutDependency])

  const tryApplyInput = (input: MultiLineEditInput) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      editStateRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clear(true)
      return false
    }

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    let tr = view.state.tr
    let changed = false
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }
    const emptyDeleteTargets =
      input.type === 'delete' ? getEmptyMultiLineBlockDeleteTargets(view.state.doc, blockRanges, selectedIndices) : []
    const emptyDeleteTargetByBlockIndex = new Map(emptyDeleteTargets.map((target) => [target.blockIndex, target]))
    const deletedEmptyBlockIndices: number[] = []
    const consumedForwardBoundaryBlockIndices: number[] = []
    const forwardBoundaryBlockIndices: number[] = []
    let boundaryDeleteNextState: MultiLineEditState | null = null
    const selectedRowDeletePlan =
      input.type === 'delete' || input.type === 'backspace'
        ? buildSelectedRowDeletePlan(tr, multiLineEdit, blockRanges, selectedIndices)
        : null
    const shouldApplyWholeSelectionBoundaryDelete =
      !selectedRowDeletePlan &&
      (input.type === 'delete' || input.type === 'backspace') &&
      shouldApplyMultiLineWholeSelectionBoundaryDelete(input.type, multiLineEdit, selectedIndices, blockRanges)

    if (selectedRowDeletePlan) {
      tr = selectedRowDeletePlan.transaction
      deletedEmptyBlockIndices.push(...selectedRowDeletePlan.deletedLineBlockIndices)
      Object.assign(nextColumnOffsets, selectedRowDeletePlan.nextColumnOffsets)
      changed = true
    }

    if (shouldApplyWholeSelectionBoundaryDelete) {
      const boundaryDeletePlan = buildForwardBoundaryDeletePlan(tr, multiLineEdit, blockRanges, selectedIndices)
      if (boundaryDeletePlan) {
        tr = boundaryDeletePlan.transaction
        deletedEmptyBlockIndices.push(...boundaryDeletePlan.deletedLineBlockIndices)
        consumedForwardBoundaryBlockIndices.push(...boundaryDeletePlan.consumedNextLineBlockIndices)
        Object.assign(nextColumnOffsets, boundaryDeletePlan.nextColumnOffsets)
        boundaryDeleteNextState = boundaryDeletePlan.nextMultiLineEditState
        changed = true
      }
    }

    for (const blockIndex of selectedRowDeletePlan || shouldApplyWholeSelectionBoundaryDelete ? [] : [...selectedIndices].sort((a, b) => b - a)) {
      const range = blockRanges[blockIndex]
      if (!range) continue
      const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
      const cursorPos = Math.min(range.end, range.start + currentOffset)
      const selectionRange = getMultiLineSelectionRange(multiLineEdit, blockIndex, range)

      if (selectionRange && input.type !== 'split-line') {
        const mappedFrom = tr.mapping.map(selectionRange.from, -1)
        const mappedTo = tr.mapping.map(selectionRange.to, 1)
        if (input.type === 'insert-text') {
          tr = tr.insertText(input.text, mappedFrom, mappedTo)
          tr = applyActiveInlineFormatsToInsertedText(
            tr,
            view.state.schema,
            mappedFrom,
            input.text,
            multiLineEdit.activeInlineFormats,
          )
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset + input.text.length
        } else {
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset
        }
        changed = true
        continue
      }

      if (input.type === 'insert-text') {
        tr = tr.insertText(input.text, cursorPos, cursorPos)
        tr = applyActiveInlineFormatsToInsertedText(
          tr,
          view.state.schema,
          cursorPos,
          input.text,
          multiLineEdit.activeInlineFormats,
        )
        nextColumnOffsets[blockIndex] = currentOffset + input.text.length
        changed = true
        continue
      }

      if (input.type === 'backspace') {
        if (cursorPos <= range.start) continue
        tr = tr.delete(cursorPos - 1, cursorPos)
        nextColumnOffsets[blockIndex] = Math.max(0, currentOffset - 1)
        changed = true
        continue
      }

      if (input.type === 'delete') {
        if (cursorPos >= range.end) {
          const deleteTarget = emptyDeleteTargetByBlockIndex.get(blockIndex)
          if (deleteTarget) {
            const mappedFrom = tr.mapping.map(deleteTarget.from, -1)
            const mappedTo = tr.mapping.map(deleteTarget.to, 1)
            if (mappedTo <= mappedFrom) continue
            tr = tr.delete(mappedFrom, mappedTo)
            deletedEmptyBlockIndices.push(blockIndex)
            nextColumnOffsets[blockIndex] = 0
            changed = true
            continue
          }

          forwardBoundaryBlockIndices.push(blockIndex)
          continue
        }
        tr = tr.delete(cursorPos, cursorPos + 1)
        changed = true
        continue
      }

      if (input.type === 'delete-word-backward') {
        const nextOffset = findPreviousWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(range.start + nextOffset, cursorPos)
        nextColumnOffsets[blockIndex] = nextOffset
        changed = true
        continue
      }

      if (input.type === 'delete-word-forward') {
        const nextOffset = findNextWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(cursorPos, range.start + nextOffset)
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-start') {
        if (currentOffset <= 0) continue
        tr = tr.delete(range.start, cursorPos)
        nextColumnOffsets[blockIndex] = 0
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-end') {
        if (currentOffset >= range.length) continue
        tr = tr.delete(cursorPos, range.end)
        changed = true
        continue
      }

      if (input.type === 'split-line') {
        const splitPos = selectionRange?.from ?? cursorPos
        const splitOffset = selectionRange?.fromOffset ?? currentOffset
        if (selectionRange) {
          const mappedFrom = tr.mapping.map(selectionRange.from, -1)
          const mappedTo = tr.mapping.map(selectionRange.to, 1)
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = splitOffset
        }
        const mappedPos = tr.mapping.map(splitPos, 1)
        if (isCodeBlockTextLineRange(range)) {
          tr = tr.insertText('\n', mappedPos, mappedPos)
          changed = true
          continue
        }
        const splitPlan = getMultiLineSplitPlan(tr.doc, mappedPos)
        if (!splitPlan) continue
        tr = tr.split(mappedPos, splitPlan.depth, splitPlan.typesAfter)
        changed = true
      }
    }

    if (input.type === 'delete' && forwardBoundaryBlockIndices.length > 0) {
      const boundaryDeletePlan = buildForwardBoundaryDeletePlan(tr, multiLineEdit, blockRanges, forwardBoundaryBlockIndices)
      if (boundaryDeletePlan) {
        tr = boundaryDeletePlan.transaction
        deletedEmptyBlockIndices.push(...boundaryDeletePlan.deletedLineBlockIndices)
        consumedForwardBoundaryBlockIndices.push(...boundaryDeletePlan.consumedNextLineBlockIndices)
        Object.assign(nextColumnOffsets, boundaryDeletePlan.nextColumnOffsets)
        changed = true
      }
    }

    if (!changed) return false

    view.dispatch(tr.scrollIntoView())
    const nextMultiLineEditState =
      input.type === 'split-line'
        ? buildSplitLineMultiLineState(multiLineEdit, selectedIndices)
        : boundaryDeleteNextState
          ? boundaryDeleteNextState
        : deletedEmptyBlockIndices.length > 0 || consumedForwardBoundaryBlockIndices.length > 0
          ? buildDeletedLineMultiLineState(
              multiLineEdit,
              selectedIndices,
              [...deletedEmptyBlockIndices, ...consumedForwardBoundaryBlockIndices],
              blockRanges,
            )
        : {
            ...multiLineEdit,
            columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
            columnOffsets: nextColumnOffsets,
            selectionAnchorOffsets: undefined,
          }

    editStateRef.current = nextMultiLineEditState
    syncVisualSelection()
    const markdownAfterMultiLineEdit = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterMultiLineEdit)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterMultiLineEdit, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const multiLineSelectionUsesOnlyCodeBlockLines = () => {
    const { view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length === 0) return false
    return selectedIndices.every((index) => isCodeBlockTextLineRange(blockRanges[index]))
  }

  const tryApplyTabInput = (shiftKey: boolean) => {
    if (shiftKey) {
      return tryRemoveBlockIndentOperation() || tryApplyInput({ type: 'backspace' })
    }

    const { view } = getCurrentEditorAndView()
    const touchesBlockQuoteRows =
      Boolean(view && editStateRef.current && multiLineSelectionTouchesBlockQuoteRows(view, editStateRef.current))
    if (
      !multiLineSelectionUsesOnlyCodeBlockLines() &&
      shouldApplyBlockIndentOperationForTab({
        outdent: false,
        isCollapsedSelection: false,
        touchesBlockQuoteRows,
      }) &&
      tryApplyBlockIndentOperation()
    ) {
      return true
    }
    return tryApplyInput({ type: 'insert-text', text: INDENT_TOKEN })
  }

  const applyListOperationPlan = (
    operation: MultiLineListOperation,
    options: Parameters<typeof buildMultiLineListOperationPlan>[3] = {},
  ) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = buildMultiLineListOperationPlan(view, multiLineEdit, operation, options)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterListOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterListOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterListOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryApplyListOperation = (operation: MultiLineListOperation) => applyListOperationPlan(operation)

  const applyHeadingOperationPlan = (
    level: MultiLineHeadingLevel,
    options: Parameters<typeof buildMultiLineHeadingOperationPlan>[3] = {},
  ) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = buildMultiLineHeadingOperationPlan(view, multiLineEdit, level, options)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterHeadingOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterHeadingOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterHeadingOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryApplyHeadingOperation = (level: MultiLineHeadingLevel) => applyHeadingOperationPlan(level)

  const applyBlockQuoteOperationPlan = (
    options: Parameters<typeof buildMultiLineBlockQuoteOperationPlan>[2] = {},
    remove = false,
  ) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = remove
      ? buildMultiLineRemoveBlockQuoteOperationPlan(view, multiLineEdit)
      : buildMultiLineBlockQuoteOperationPlan(view, multiLineEdit, options)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterBlockQuoteOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterBlockQuoteOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterBlockQuoteOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const applySelectionBlockQuotePlan = (remove = false) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    if (!currentEditor || !view) return false

    const { from, to } = view.state.selection
    const isCollapsedSelection = from === to
    const plan = remove ? buildSelectionRemoveBlockQuoteOperationPlan(view) : buildSelectionBlockQuoteOperationPlan(view)
    if (!plan) return false

    const nextCaret = plan.transaction.mapping.map(from, remove ? -1 : 1)
    const nextFrom = plan.transaction.mapping.map(from, -1)
    const nextTo = plan.transaction.mapping.map(to, 1)

    let transaction = plan.transaction
    try {
      const nextSelection = isCollapsedSelection
        ? TextSelection.create(transaction.doc, nextCaret, nextCaret)
        : TextSelection.create(transaction.doc, nextFrom, nextTo)
      transaction = transaction.setSelection(nextSelection)
    } catch {
      const docSize = Math.max(0, transaction.doc?.content?.size ?? 0)
      const fallbackPosition = Math.max(0, Math.min(docSize, isCollapsedSelection ? nextCaret : nextTo))
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(fallbackPosition), 1))
    }

    view.dispatch(transaction.scrollIntoView())
    const markdownAfterBlockQuote = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterBlockQuote)
    currentEditor.focus()
    return true
  }

  const tryApplyBlockQuoteOperation = () => {
    const { view } = getCurrentEditorAndView()
    if (!view) return false
    if (editStateRef.current) {
      return applyBlockQuoteOperationPlan({}, true) || applyBlockQuoteOperationPlan()
    }
    return selectionTouchesBlockQuoteRows(view) ? applySelectionBlockQuotePlan(true) : applySelectionBlockQuotePlan()
  }

  const applyMultiLineBlockIndentPlan = (remove: boolean) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = remove
      ? buildMultiLineRemoveBlockIndentOperationPlan(view, multiLineEdit)
      : buildMultiLineBlockIndentOperationPlan(view, multiLineEdit)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterBlockIndentOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterBlockIndentOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterBlockIndentOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const applySelectionBlockIndentPlan = (remove: boolean) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    if (!currentEditor || !view) return false

    const { from, to } = view.state.selection
    const isCollapsedSelection = from === to
    const plan = remove ? buildSelectionRemoveBlockIndentOperationPlan(view) : buildSelectionBlockIndentOperationPlan(view)
    if (!plan) return false

    const nextCaret = plan.transaction.mapping.map(from, remove ? -1 : 1)
    const nextFrom = plan.transaction.mapping.map(from, -1)
    const nextTo = plan.transaction.mapping.map(to, 1)

    let transaction = plan.transaction
    try {
      const nextSelection = isCollapsedSelection
        ? TextSelection.create(transaction.doc, nextCaret, nextCaret)
        : TextSelection.create(transaction.doc, nextFrom, nextTo)
      transaction = transaction.setSelection(nextSelection)
    } catch {
      const docSize = Math.max(0, transaction.doc?.content?.size ?? 0)
      const fallbackPosition = Math.max(0, Math.min(docSize, isCollapsedSelection ? nextCaret : nextTo))
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(fallbackPosition), 1))
    }

    view.dispatch(transaction.scrollIntoView())
    const markdownAfterBlockIndent = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterBlockIndent)
    currentEditor.focus()
    return true
  }

  const tryApplyBlockIndentOperation = () =>
    editStateRef.current ? applyMultiLineBlockIndentPlan(false) : applySelectionBlockIndentPlan(false)

  const tryRemoveBlockIndentOperation = () =>
    editStateRef.current ? applyMultiLineBlockIndentPlan(true) : applySelectionBlockIndentPlan(true)

  const tryApplyCodeBlockOperation = () => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineEdit)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterCodeBlockOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterCodeBlockOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterCodeBlockOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryApplyInlineFormat = (format: MultiLineInlineFormat) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = buildMultiLineInlineFormatPlan(view, multiLineEdit, format)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterInlineOperation = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterInlineOperation)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterInlineOperation, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryApplyListMarkerShortcut = () => {
    const { view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!view || !multiLineEdit) return false

    const shortcut = getMultiLineListMarkerShortcut(view, multiLineEdit)
    if (!shortcut) return false
    return applyListOperationPlan(shortcut.operation, { textByBlockIndex: shortcut.textByBlockIndex })
  }

  const tryApplyHeadingMarkerShortcut = () => {
    const { view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!view || !multiLineEdit) return false

    const shortcut = getMultiLineHeadingMarkerShortcut(view, multiLineEdit)
    if (!shortcut) return false
    return applyHeadingOperationPlan(shortcut.level, { textByBlockIndex: shortcut.textByBlockIndex })
  }

  const tryApplyBlockQuoteMarkerShortcut = () => {
    const { view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!view || !multiLineEdit) return false

    const shortcut = getMultiLineBlockQuoteMarkerShortcut(view, multiLineEdit)
    if (!shortcut) return false
    return applyBlockQuoteOperationPlan({ textByBlockIndex: shortcut.textByBlockIndex })
  }

  const tryApplyBlockMarkerShortcut = () =>
    tryApplyHeadingMarkerShortcut() || tryApplyBlockQuoteMarkerShortcut() || tryApplyListMarkerShortcut()

  const tryApplyInlineMarkerShortcut = (inputText: string) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const plan = buildMultiLineInlineMarkerOperationPlan(view, multiLineEdit, inputText)
    if (!plan) return false

    view.dispatch(plan.transaction.scrollIntoView())
    editStateRef.current = plan.nextState
    syncVisualSelection()
    const markdownAfterInlineMarker = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterInlineMarker)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterInlineMarker, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryMoveCursors = (movement: MultiLineCursorMovement, extendSelection = false) => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      editStateRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clear(true)
      return false
    }

    const pageRowDelta =
      movement === 'page-up' || movement === 'page-down'
        ? getMultiLinePageMovementRowDelta(view, multiLineEdit, selectedIndices, blockRanges, movement)
        : undefined
    const nextState = moveMultiLineCursorState(multiLineEdit, selectedIndices, blockRanges, movement, {
      extendSelection,
      pageRowDelta,
    })
    if (!nextState) return false
    editStateRef.current = nextState
    syncVisualSelection()
    return true
  }

  const getActiveSelectionContext = () => {
    const { currentEditor, view } = getCurrentEditorAndView()
    const multiLineEdit = editStateRef.current
    if (!currentEditor || !view || !multiLineEdit) return null

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return null
    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) return null
    const selectionRanges = getMultiLineSelectionRanges(multiLineEdit, selectedIndices, blockRanges)
    if (selectionRanges.length === 0) return null

    return {
      currentEditor,
      view,
      multiLineEdit,
      selectedIndices,
      selectionRanges,
    }
  }

  const writeClipboardText = (clipboardData: DataTransfer | null, text: string) => {
    if (clipboardData) {
      clipboardData.setData('text/plain', text)
      return true
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
      return true
    }
    return false
  }

  const copySelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    return writeClipboardText(clipboardData, text)
  }

  const cutSelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    if (!writeClipboardText(clipboardData, text)) return false

    const { currentEditor, view, multiLineEdit, selectionRanges } = context
    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }
    let tr = view.state.tr

    for (const selectionRange of [...selectionRanges].sort((a, b) => b.from - a.from)) {
      const mappedFrom = tr.mapping.map(selectionRange.from, -1)
      const mappedTo = tr.mapping.map(selectionRange.to, 1)
      tr = tr.delete(mappedFrom, mappedTo)
      nextColumnOffsets[selectionRange.blockIndex] = selectionRange.fromOffset
    }

    view.dispatch(tr.scrollIntoView())
    editStateRef.current = {
      ...multiLineEdit,
      columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
    }
    syncVisualSelection()

    const markdownAfterCut = getNormalizedEditorMarkdown(currentEditor)
    commitMarkdown(markdownAfterCut)
    if (editStateRef.current) {
      recordHistory(beforeMarkdown, beforeState, markdownAfterCut, editStateRef.current)
    }
    currentEditor.focus()
    return true
  }

  return {
    editStateRef,
    pluginKeyRef,
    clear,
    syncVisualSelection,
    tryApplyIndent,
    tryExpandSelection,
    tryApplyInput,
    tryApplyTabInput,
    tryApplyListOperation,
    tryApplyListMarkerShortcut,
    tryApplyHeadingOperation,
    tryApplyBlockQuoteOperation,
    tryApplyBlockIndentOperation,
    tryRemoveBlockIndentOperation,
    tryApplyCodeBlockOperation,
    tryApplyInlineFormat,
    tryApplyBlockMarkerShortcut,
    tryApplyInlineMarkerShortcut,
    tryMoveCursors,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    scheduleHistoryRestore,
    getEditorHistoryDirection,
    hasActiveEdit: () => Boolean(editStateRef.current),
  }
}
