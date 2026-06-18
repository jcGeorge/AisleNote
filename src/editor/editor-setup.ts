import type { Editor } from '@toast-ui/editor'
import { Fragment } from 'prosemirror-model'
import { Selection, TextSelection } from 'prosemirror-state'
import { canSplit } from 'prosemirror-transform'
import { applyBulletListMarkerCommand } from './list-marker-commands'
import {
  isEmptyEditorTextBlock,
  shouldDeleteEmptyParagraphAtListBoundary,
} from './empty-paragraph-list-delete'
import { deleteTerminalBlockBeforeCaret } from './terminal-block-landing'
import {
  applyAnnotationLineClassToHtmlToken,
  applyAnnotationMarkerToTextHtmlToken,
  getAnnotationInlineArrowClassNames,
  getAnnotationLineClassNames,
  parseAnnotationLine,
  parseAnnotationLineMarkers,
  ANNOTATION_LINE_MARKER_CLASS_NAME,
  getToastNodeText,
} from './annotation-line'
import {
  applyBulletListMarkerToHtmlToken,
  createBulletListAttrs,
  getBulletListMarkdownDelimiter,
  getBulletListMarkerFromMarkdownChar,
} from './list-markers'
import {
  getEditorNavigationIntentInputForEvent,
  resolveEditorNavigationIntent,
  type EditorNavigationIntent,
} from './editor-input-intents'
import {
  countBlockIndentLevels,
  getBlockIndentPrefixLength,
  isHorizontalRuleMarkerLine,
} from '../markdown/markdown-utils'
import { extractMarkdownTagRanges, TAG_TOKEN_CLASS_NAME } from '../tags/tags.js'

type ToastHtmlOpenTagToken = {
  type?: string
  tagName?: string
  attributes?: Record<string, unknown>
  classNames?: string[]
  [key: string]: unknown
}

type ToastHtmlToken = ToastHtmlOpenTagToken | ToastHtmlOpenTagToken[] | null

type ToastListMdNode = {
  listData?: { type?: string; bulletChar?: string } | null
}

const ANNOTATION_ARROW_BOUNDARY_CARET_CLASS_NAME = 'tabs-annotation-arrow-boundary-caret'
export const BLOCK_INDENT_CLASS_NAME = 'tabs-block-indent'
export const BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME = 'tabs-block-indent-token-hidden'
export const BLOCK_INDENT_BOUNDARY_ACTIVE_CLASS_NAME = 'tabs-block-indent-boundary-active'

export type TagDecorationRange = {
  from: number
  to: number
  text: string
  tag: string
}

export type TagJumpHighlightRange = {
  from: number
  to: number
  requestId: number
}

export const TAG_JUMP_HIGHLIGHT_META = 'tabs-tag-jump-highlight'
export const TAG_JUMP_TARGET_CLASS_NAME = 'tabs-tag-jump-target'
export const TAG_JUMP_GLOW_DURATION_MS = 1400

function getTextOffsetDecorationRange(
  node: any,
  nodePosition: number,
  fromOffset: number,
  toOffset: number,
): { from: number; to: number } | null {
  let textOffset = 0
  let from: number | null = null
  let to: number | null = null

  if (typeof node?.descendants === 'function') {
    node.descendants((child: any, childPosition: number) => {
      if (!child?.isText || typeof child.text !== 'string') return true

      const childTextStart = textOffset
      const childTextEnd = childTextStart + child.text.length
      const overlapStart = Math.max(fromOffset, childTextStart)
      const overlapEnd = Math.min(toOffset, childTextEnd)

      if (overlapEnd > overlapStart) {
        const childDocStart = nodePosition + 1 + childPosition
        const overlapFrom = childDocStart + (overlapStart - childTextStart)
        const overlapTo = childDocStart + (overlapEnd - childTextStart)
        from = from === null ? overlapFrom : Math.min(from, overlapFrom)
        to = to === null ? overlapTo : Math.max(to, overlapTo)
      }

      textOffset = childTextEnd
      return true
    })
  }

  if (from !== null && to !== null && to > from) {
    return { from, to }
  }

  const contentStart = nodePosition + 1
  const contentEnd = Math.max(contentStart, nodePosition + node.nodeSize - 1)
  const fallbackFrom = Math.min(contentStart + fromOffset, contentEnd)
  const fallbackTo = Math.min(contentStart + toOffset, contentEnd)
  return fallbackTo > fallbackFrom ? { from: fallbackFrom, to: fallbackTo } : null
}

function createArrowBoundaryCaretWidget() {
  const element = document.createElement('span')
  element.className = ANNOTATION_ARROW_BOUNDARY_CARET_CLASS_NAME
  element.setAttribute('aria-hidden', 'true')
  return element
}

export type BlockIndentDecorationRange = {
  nodeFrom: number
  nodeTo: number
  tokenFrom: number
  tokenTo: number
  level: number
}

export type BlockIndentSelectionBoundaries = {
  anchor: number
  head: number
}

type BlockIndentBoundaryNavigationAction =
  | { type: 'visible-line-start'; mode: 'line-start' | 'word-boundary' }
  | { type: 'visible-arrow-down' }
  | { type: 'boundary-exit'; key: 'ArrowLeft' | 'ArrowUp' }

function getCurrentEditorPlatformIsMac(): boolean {
  return typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
}

export function getBlockIndentDecorationRanges(doc: any): BlockIndentDecorationRange[] {
  const ranges: BlockIndentDecorationRange[] = []
  if (!doc || typeof doc.descendants !== 'function') return ranges

  doc.descendants((node: any, position: number) => {
    if (!node?.isTextblock) return true
    const text = String(node.textContent ?? '')
    const prefixLength = getBlockIndentPrefixLength(text)
    if (prefixLength <= 0) return true
    const tokenRange = getTextOffsetDecorationRange(node, position, 0, prefixLength)
    if (!tokenRange) return true
    ranges.push({
      nodeFrom: position,
      nodeTo: position + node.nodeSize,
      tokenFrom: tokenRange.from,
      tokenTo: tokenRange.to,
      level: countBlockIndentLevels(text),
    })
    return true
  })

  return ranges
}

function getBlockIndentTokenBoundaryAtPosition(
  doc: any,
  position: number,
): { tokenFrom: number; tokenTo: number } | null {
  if (!doc || typeof doc.resolve !== 'function' || !Number.isFinite(position)) return null

  try {
    const docSize = Number(doc.content?.size)
    const safePosition = Number.isFinite(docSize)
      ? Math.max(0, Math.min(docSize, position))
      : position
    const resolved = doc.resolve(safePosition)
    const parent = resolved?.parent
    if (!parent?.isTextblock) return null

    const prefixLength = getBlockIndentPrefixLength(String(parent.textContent ?? ''))
    if (prefixLength <= 0) return null

    const tokenFrom = resolved.start(resolved.depth)
    const tokenTo = tokenFrom + prefixLength
    return safePosition >= tokenFrom && safePosition < tokenTo ? { tokenFrom, tokenTo } : null
  } catch {
    return null
  }
}

function getBlockIndentRangeAtPosition(doc: any, position: number): BlockIndentDecorationRange | null {
  if (!doc || typeof doc.resolve !== 'function' || !Number.isFinite(position)) return null

  try {
    const docSize = Number(doc.content?.size)
    const safePosition = Number.isFinite(docSize)
      ? Math.max(0, Math.min(docSize, position))
      : position
    const resolved = doc.resolve(safePosition)
    const parent = resolved?.parent
    if (!parent?.isTextblock) return null

    const text = String(parent.textContent ?? '')
    const prefixLength = getBlockIndentPrefixLength(text)
    if (prefixLength <= 0) return null

    const tokenFrom = resolved.start(resolved.depth)
    const tokenTo = tokenFrom + prefixLength
    const nodeFrom = typeof resolved.before === 'function'
      ? resolved.before(resolved.depth)
      : Math.max(0, tokenFrom - 1)
    const nodeTo = nodeFrom + (Number(parent.nodeSize) || 0)
    if (safePosition < tokenFrom || safePosition > nodeTo) return null

    return {
      nodeFrom,
      nodeTo,
      tokenFrom,
      tokenTo,
      level: countBlockIndentLevels(text),
    }
  } catch {
    return null
  }
}

function getBlockIndentFirstVisibleBoundaryAtPosition(
  doc: any,
  position: number,
): BlockIndentDecorationRange | null {
  if (!doc || typeof doc.resolve !== 'function' || !Number.isFinite(position)) return null

  try {
    const docSize = Number(doc.content?.size)
    const safePosition = Number.isFinite(docSize)
      ? Math.max(0, Math.min(docSize, position))
      : position
    const resolved = doc.resolve(safePosition)
    const parent = resolved?.parent
    if (!parent?.isTextblock) return null

    const prefixLength = getBlockIndentPrefixLength(String(parent.textContent ?? ''))
    if (prefixLength <= 0) return null

    const tokenFrom = resolved.start(resolved.depth)
    const tokenTo = tokenFrom + prefixLength
    if (safePosition !== tokenTo) return null
    const nodeFrom = typeof resolved.before === 'function'
      ? resolved.before(resolved.depth)
      : Math.max(0, tokenFrom - 1)
    return {
      nodeFrom,
      nodeTo: nodeFrom + (Number(parent.nodeSize) || 0),
      tokenFrom,
      tokenTo,
      level: countBlockIndentLevels(String(parent.textContent ?? '')),
    }
  } catch {
    return null
  }
}

export function getBlockIndentBoundaryNavigationAction(
  navigationIntent: EditorNavigationIntent,
): BlockIndentBoundaryNavigationAction | null {
  if (navigationIntent.type === 'line-boundary' && navigationIntent.direction === 'start') {
    return {
      type: 'visible-line-start',
      mode: navigationIntent.blockIndentMode,
    }
  }
  if (navigationIntent.type !== 'plain-arrow') return null
  if (navigationIntent.direction === 'down') return { type: 'visible-arrow-down' }
  if (navigationIntent.direction === 'left') return { type: 'boundary-exit', key: 'ArrowLeft' }
  if (navigationIntent.direction === 'up') return { type: 'boundary-exit', key: 'ArrowUp' }
  return null
}

export function getBlockIndentVisibleLineStartPosition(
  doc: any,
  selection: { empty?: boolean; from?: number } | null | undefined,
  mode: 'line-start' | 'word-boundary' = 'word-boundary',
): number | null {
  if (!selection?.empty || typeof selection.from !== 'number') return null
  const range = getBlockIndentRangeAtPosition(doc, selection.from)
  if (!range) return null
  if (mode === 'line-start') return range.tokenTo
  if (selection.from <= range.tokenTo + 1) return range.tokenTo
  return null
}

function readCssPixels(value: string | undefined | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getComputedStyleForElement(element: any): CSSStyleDeclaration | null {
  const ownerWindow = element?.ownerDocument?.defaultView
  if (typeof ownerWindow?.getComputedStyle === 'function') return ownerWindow.getComputedStyle(element)
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') return window.getComputedStyle(element)
  return null
}

function getBlockIndentTextblockElement(view: any, boundary: BlockIndentDecorationRange): any | null {
  const nodeDom = typeof view?.nodeDOM === 'function' ? view.nodeDOM(boundary.nodeFrom) : null
  if (nodeDom && typeof nodeDom.getBoundingClientRect === 'function') return nodeDom
  const parent = nodeDom?.parentElement
  return parent && typeof parent.getBoundingClientRect === 'function' ? parent : null
}

export function getBlockIndentBoundaryArrowDownPosition(view: any): number | null {
  const selection = view?.state?.selection
  if (!selection?.empty || typeof selection.from !== 'number') return null
  const boundary = getBlockIndentFirstVisibleBoundaryAtPosition(view?.state?.doc, selection.from)
  if (!boundary) return null

  const element = getBlockIndentTextblockElement(view, boundary)
  const rect = element?.getBoundingClientRect?.()
  const style = element ? getComputedStyleForElement(element) : null
  if (!rect || !style || typeof view?.posAtCoords !== 'function') return null

  const fontSize = readCssPixels(style.fontSize, 16)
  const lineHeight = readCssPixels(style.lineHeight, fontSize * 1.4)
  const paddingLeft = readCssPixels(style.paddingLeft, 0)
  const visibleTextX = rect.left + paddingLeft + 1
  const hasWrappedLine = rect.height > lineHeight * 1.35
  const targetY = hasWrappedLine
    ? rect.top + lineHeight * 1.5
    : rect.bottom + Math.max(2, Math.min(8, lineHeight * 0.35))
  const found = view.posAtCoords({ left: visibleTextX, top: targetY })
  const foundPosition = typeof found?.pos === 'number' ? found.pos : null
  if (foundPosition === null) return null

  const normalizedPosition = normalizeBlockIndentBoundaryPosition(view.state.doc, foundPosition)
  return normalizedPosition === selection.from ? null : normalizedPosition
}

export function getBlockIndentClickBoundaryPosition(view: any, event: Pick<MouseEvent, 'clientX' | 'clientY'>): number | null {
  if (typeof view?.posAtCoords !== 'function') return null
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY })
  const foundPosition = typeof found?.pos === 'number' ? found.pos : null
  if (foundPosition === null) return null

  const range = getBlockIndentRangeAtPosition(view?.state?.doc, foundPosition)
  if (!range) return null
  const element = getBlockIndentTextblockElement(view, range)
  const rect = element?.getBoundingClientRect?.()
  const style = element ? getComputedStyleForElement(element) : null
  if (!rect || !style) return null

  const paddingLeft = readCssPixels(style.paddingLeft, 0)
  const visibleTextX = rect.left + paddingLeft
  const boundarySlopPx = 8
  const insideBlockY = event.clientY >= rect.top && event.clientY <= rect.bottom
  const nearVisibleStart = event.clientX >= rect.left - boundarySlopPx && event.clientX <= visibleTextX + boundarySlopPx
  return insideBlockY && nearVisibleStart ? range.tokenTo : null
}

export function normalizeBlockIndentBoundaryPosition(doc: any, position: number): number {
  return getBlockIndentTokenBoundaryAtPosition(doc, position)?.tokenTo ?? position
}

export function normalizeBlockIndentSelectionBoundaries(
  doc: any,
  selection: { anchor?: number; head?: number; from?: number; to?: number } | null | undefined,
): BlockIndentSelectionBoundaries | null {
  if (!selection) return null
  const anchor = typeof selection.anchor === 'number' ? selection.anchor : selection.from
  const head = typeof selection.head === 'number' ? selection.head : selection.to
  if (typeof anchor !== 'number' || typeof head !== 'number') return null

  const normalizedAnchor = normalizeBlockIndentBoundaryPosition(doc, anchor)
  const normalizedHead = normalizeBlockIndentBoundaryPosition(doc, head)
  return normalizedAnchor === anchor && normalizedHead === head
    ? null
    : { anchor: normalizedAnchor, head: normalizedHead }
}

export function getBlockIndentBoundaryNavigationPosition(
  doc: any,
  selection: { empty?: boolean; from?: number } | null | undefined,
  key: string,
): number | null {
  if ((key !== 'ArrowLeft' && key !== 'ArrowUp') || !selection?.empty || typeof selection.from !== 'number') return null
  const boundary = getBlockIndentFirstVisibleBoundaryAtPosition(doc, selection.from)
  if (!boundary) return null

  try {
    const nextSelection = Selection.near(doc.resolve(Math.max(0, boundary.tokenFrom - 1)), -1)
    const nextFrom = typeof nextSelection.from === 'number' ? nextSelection.from : null
    if (nextFrom === null || (nextFrom >= boundary.tokenFrom && nextFrom <= boundary.tokenTo)) return selection.from
    return nextFrom
  } catch {
    return selection.from
  }
}

export function blockIndentPlugin(context: {
  pmState: {
      Plugin: new (spec: {
      appendTransaction?: (
        transactions: unknown[],
        oldState: unknown,
        newState: { doc: any; selection?: { anchor?: number; head?: number; from?: number; to?: number }; tr: any },
      ) => unknown
      props?: {
        decorations?: (state: { doc: any; selection?: { empty?: boolean; from?: number } }) => unknown
        handleClick?: (view: any, pos: number, event: MouseEvent) => boolean
        handleKeyDown?: (view: any, event: KeyboardEvent) => boolean
        handleTextInput?: (view: any, from: number, to: number, text: string) => boolean
      }
    }) => unknown
  }
  pmView: {
    Decoration: {
      node: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          appendTransaction: (_transactions, _oldState, newState) => {
            const normalized = normalizeBlockIndentSelectionBoundaries(newState.doc, newState.selection)
            if (!normalized) return null
            try {
              return newState.tr
                .setSelection(TextSelection.create(newState.doc, normalized.anchor, normalized.head))
                .setMeta('addToHistory', false)
            } catch {
              return null
            }
          },
          props: {
            handleClick: (view: any, _pos: number, event: MouseEvent) => {
              const nextPosition = getBlockIndentClickBoundaryPosition(view, event)
              if (nextPosition === null) return false

              const transaction = view.state.tr
                .setSelection(TextSelection.create(view.state.doc, nextPosition, nextPosition))
                .scrollIntoView()
              view.dispatch?.(transaction)
              return true
            },
            handleKeyDown: (view: any, event: KeyboardEvent) => {
              const navigationIntent = resolveEditorNavigationIntent(
                getEditorNavigationIntentInputForEvent(event, getCurrentEditorPlatformIsMac()),
              )
              const action = getBlockIndentBoundaryNavigationAction(navigationIntent)
              if (!action) return false

              if (action.type === 'visible-line-start') {
                const nextPosition = getBlockIndentVisibleLineStartPosition(
                  view?.state?.doc,
                  view?.state?.selection,
                  action.mode,
                )
                if (nextPosition !== null) {
                  event.preventDefault()
                  const transaction = view.state.tr
                    .setSelection(TextSelection.create(view.state.doc, nextPosition, nextPosition))
                    .scrollIntoView()
                  view.dispatch?.(transaction)
                  return true
                }
              }

              if (action.type === 'visible-arrow-down') {
                const nextPosition = getBlockIndentBoundaryArrowDownPosition(view)
                if (nextPosition === null) return false

                event.preventDefault()
                const transaction = view.state.tr
                  .setSelection(TextSelection.create(view.state.doc, nextPosition, nextPosition))
                  .scrollIntoView()
                view.dispatch?.(transaction)
                return true
              }

              if (action.type !== 'boundary-exit') return false
              const nextPosition = getBlockIndentBoundaryNavigationPosition(
                view?.state?.doc,
                view?.state?.selection,
                action.key,
              )
              if (nextPosition === null) return false

              event.preventDefault()
              if (nextPosition === view.state.selection.from) return true

              const transaction = view.state.tr
                .setSelection(Selection.near(view.state.doc.resolve(nextPosition), -1))
                .scrollIntoView()
              view.dispatch?.(transaction)
              return true
            },
            handleTextInput: (view: any, from: number, to: number, inputText: string) => {
              if (!inputText || from !== to) return false
              const boundary = getBlockIndentTokenBoundaryAtPosition(view?.state?.doc, from)
              if (!boundary) return false
              const insertTo = boundary.tokenTo + inputText.length
              const transaction = view.state.tr.insertText(inputText, boundary.tokenTo, boundary.tokenTo)
              view.dispatch?.(
                transaction
                  .setSelection(TextSelection.create(transaction.doc, insertTo, insertTo))
                  .scrollIntoView(),
              )
              return true
            },
            decorations: (state: { doc: any; selection?: { empty?: boolean; from?: number } }) => {
              const decorations: unknown[] = []
              const cursorPosition =
                state.selection?.empty && typeof state.selection.from === 'number'
                  ? state.selection.from
                  : null
              getBlockIndentDecorationRanges(state.doc).forEach((range, index) => {
                const activeAtBoundary = cursorPosition === range.tokenTo
                decorations.push(
                  Decoration.node(
                    range.nodeFrom,
                    range.nodeTo,
                    {
                      class: activeAtBoundary
                        ? `${BLOCK_INDENT_CLASS_NAME} ${BLOCK_INDENT_BOUNDARY_ACTIVE_CLASS_NAME}`
                        : BLOCK_INDENT_CLASS_NAME,
                      style: `--tabs-block-indent-level: ${range.level};`,
                    },
                    { key: `block-indent-node-${range.nodeFrom}-${index}` },
                  ),
                )
                decorations.push(
                  Decoration.inline(
                    range.tokenFrom,
                    range.tokenTo,
                    { class: BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME },
                    { key: `block-indent-token-${range.tokenFrom}-${index}` },
                  ),
                )
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
    ],
  }
}

function isCodeNodeType(node: any): boolean {
  const typeName = String(node?.type?.name ?? '').toLocaleLowerCase()
  return Boolean(node?.type?.spec?.code) || typeName === 'codeblock' || typeName === 'code_block'
}

function hasCodeMark(node: any): boolean {
  if (!Array.isArray(node?.marks)) return false
  return node.marks.some((mark: any) => mark?.type?.name === 'code' || mark?.type?.spec?.code)
}

export function getTagDecorationRanges(doc: any): TagDecorationRange[] {
  const ranges: TagDecorationRange[] = []
  if (!doc || typeof doc.descendants !== 'function') return ranges

  doc.descendants((node: any, position: number, parent: any) => {
    if (isCodeNodeType(node)) return false
    if (!node?.isText || typeof node.text !== 'string') return true
    if (hasCodeMark(node) || isCodeNodeType(parent)) return true

    extractMarkdownTagRanges(node.text).forEach((range) => {
      ranges.push({
        from: position + range.from,
        to: position + range.to,
        text: range.text,
        tag: range.tag,
      })
    })
    return true
  })

  return ranges
}

export function tagAppearancePlugin(context: {
  pmState: {
    Plugin: new (spec: {
      state?: {
        init: () => unknown
        apply: (transaction: any, value: unknown) => unknown
      }
      props?: {
        decorations?: (state: { doc: any }) => unknown
      }
    }) => unknown
  }
  pmView: {
    Decoration: {
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  function normalizeJumpHighlightRange(value: unknown): TagJumpHighlightRange | null {
    if (!value || typeof value !== 'object') return null
    const range = value as Partial<TagJumpHighlightRange>
    if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || !Number.isFinite(range.requestId)) return null
    const from = Number(range.from)
    const to = Number(range.to)
    if (to <= from) return null
    return {
      from,
      to,
      requestId: Number(range.requestId),
    }
  }

  return {
    wysiwygPlugins: [
      () => {
        let activeJumpRange: TagJumpHighlightRange | null = null

        return new Plugin({
          state: {
            init: () => null,
            apply: (transaction: any, value: unknown) => {
              if (!transaction || typeof transaction.getMeta !== 'function') return value
              const meta = transaction.getMeta(TAG_JUMP_HIGHLIGHT_META)
              if (meta === undefined) return value
              activeJumpRange = normalizeJumpHighlightRange(meta)
              return activeJumpRange
            },
          },
          props: {
            decorations: (state: { doc: any }) => {
              const decorations = getTagDecorationRanges(state.doc).map((range, index) =>
                Decoration.inline(
                  range.from,
                  range.to,
                  {
                    class: activeJumpRange && activeJumpRange.from === range.from && activeJumpRange.to === range.to
                      ? `${TAG_TOKEN_CLASS_NAME} ${TAG_JUMP_TARGET_CLASS_NAME}`
                      : TAG_TOKEN_CLASS_NAME,
                    'data-tabs-tag': range.tag,
                    'data-app-tooltip': 'filter by tag',
                  },
                  { key: `tag-token-${index}-${range.from}-${range.to}` },
                ),
              )
              return DecorationSet.create(state.doc, decorations)
            },
          },
        })
      },
    ],
  }
}

export type HighlightMarkerShortcutMatch = {
  markerStart: number
  markerEnd: number
  text: string
}

function trimSyntacticHighlightPadding(value: string): string {
  if (!value.startsWith(' ') || !value.endsWith(' ') || value.trim().length === 0) return value
  return value.slice(1, -1)
}

export function getClosedHighlightMarkerShortcut(value: string): HighlightMarkerShortcutMatch | null {
  const normalized = String(value ?? '').replace(/\u200b/g, '')
  const match = normalized.match(/(^|[^=])==([^\n]*?\S[^\n]*?)==$/)
  if (!match || match.index === undefined) return null

  const markerStart = match.index + match[1].length
  const markerEnd = normalized.length
  const highlightedText = trimSyntacticHighlightPadding(match[2])
  if (highlightedText.trim().length === 0) return null

  return { markerStart, markerEnd, text: highlightedText }
}

function selectionHasMark(state: any, markType: any): boolean {
  const selection = state?.selection
  if (!selection) return false
  if (selection.empty) {
    const marks = state.storedMarks ?? selection.$from?.marks?.() ?? []
    return marks.some((mark: any) => mark?.type === markType)
  }
  return state.doc.rangeHasMark(selection.from, selection.to, markType)
}

export function toggleHighlightMark(state: any, dispatch?: (tr: unknown) => void): boolean {
  const markType = state?.schema?.marks?.mark
  const selection = state?.selection
  if (!markType || !selection) return false

  if (!dispatch) return true

  if (selection.empty) {
    const active = selectionHasMark(state, markType)
    const transaction = active
      ? state.tr.removeStoredMark(markType)
      : state.tr.addStoredMark(markType.create())
    dispatch(transaction.scrollIntoView())
    return true
  }

  const active = selectionHasMark(state, markType)
  const transaction = active
    ? state.tr.removeMark(selection.from, selection.to, markType)
    : state.tr.addMark(selection.from, selection.to, markType.create())
  dispatch(transaction.scrollIntoView())
  return true
}

function cursorHasCodeMark(state: any): boolean {
  const codeMarkType = state?.schema?.marks?.code
  if (!codeMarkType) return false
  const marks = state.storedMarks ?? state.selection?.$from?.marks?.() ?? []
  return marks.some((mark: any) => mark?.type === codeMarkType)
}

function applyTypedHighlightMarkerShortcut(view: any, from: number, to: number, inputText: string): boolean {
  if (inputText !== '=' || from !== to) return false
  const { state } = view ?? {}
  const selection = state?.selection
  const markType = state?.schema?.marks?.mark
  if (!selection?.empty || !markType || !selection.$from?.parent?.isTextblock) return false
  if (selection.$from.parent.type?.spec?.code || cursorHasCodeMark(state)) return false

  const parent = selection.$from.parent
  const parentOffset = selection.$from.parentOffset
  const beforeText =
    typeof parent.textBetween === 'function'
      ? parent.textBetween(0, parentOffset, '\n', '\n')
      : String(parent.textContent ?? '').slice(0, parentOffset)
  const match = getClosedHighlightMarkerShortcut(beforeText + inputText)
  if (!match) return false

  const blockStart = selection.$from.start(selection.$from.depth)
  const markerFrom = blockStart + match.markerStart
  const replacement = state.schema.text(match.text, [markType.create()])
  view.dispatch?.(state.tr.replaceWith(markerFrom, from, replacement).scrollIntoView())
  return true
}

function canReplaceWith(parentNode: any, fromIndex: number, toIndex: number, nodeType: any): boolean {
  return typeof parentNode?.canReplaceWith === 'function'
    ? parentNode.canReplaceWith(fromIndex, toIndex, nodeType)
    : true
}

export function applyTypedCodeBlockShortcut(view: any, from: number, to: number, inputText: string): boolean {
  if (inputText !== '`' || from !== to) return false
  const { state } = view ?? {}
  const selection = state?.selection
  const codeBlockType = state?.schema?.nodes?.codeBlock
  if (!selection?.empty || !codeBlockType || !selection.$from?.parent?.isTextblock) return false
  if (selection.from !== from || selection.to !== to) return false
  if (selection.$from.parent.type?.spec?.code || cursorHasCodeMark(state)) return false

  const parent = selection.$from.parent
  const parentOffset = selection.$from.parentOffset
  if (parentOffset !== parent.content?.size) return false

  const beforeText =
    typeof parent.textBetween === 'function'
      ? parent.textBetween(0, parentOffset, '\n', '\n')
      : String(parent.textContent ?? '').slice(0, parentOffset)
  if (!beforeText.endsWith('``')) return false

  const blockDepth = selection.$from.depth
  if (typeof blockDepth !== 'number' || blockDepth <= 0) return false

  const parentDepth = blockDepth - 1
  const containingNode = selection.$from.node(parentDepth)
  const blockIndex = selection.$from.index(parentDepth)
  const blockFrom = selection.$from.before(blockDepth)
  const blockTo = selection.$from.after(blockDepth)
  const codeBlockNode = codeBlockType.create()
  const textBeforeMarker = beforeText.slice(0, -2)

  if (textBeforeMarker.trim().length === 0) {
    if (!canReplaceWith(containingNode, blockIndex, blockIndex + 1, codeBlockType)) return false
    if (!view.dispatch) return true
    const nextTr = state.tr.replaceWith(blockFrom, blockTo, codeBlockNode)
    const caretPos = Math.min(blockFrom + 1, nextTr.doc.content.size)
    view.dispatch(nextTr.setSelection(TextSelection.create(nextTr.doc, caretPos, caretPos)).scrollIntoView())
    return true
  }

  if (!canReplaceWith(containingNode, blockIndex + 1, blockIndex + 1, codeBlockType)) return false
  if (!view.dispatch) return true

  const blockStart = selection.$from.start(blockDepth)
  const markerFrom = blockStart + beforeText.length - 2
  let nextTr = state.tr.delete(markerFrom, from)
  const insertPos = nextTr.mapping.map(blockTo)
  nextTr = nextTr.insert(insertPos, codeBlockNode)
  const caretPos = Math.min(insertPos + 1, nextTr.doc.content.size)
  view.dispatch(nextTr.setSelection(TextSelection.create(nextTr.doc, caretPos, caretPos)).scrollIntoView())
  return true
}

export function codeBlockBacktickShortcutPlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        handleTextInput?: (view: any, from: number, to: number, text: string) => boolean
      }
    }) => unknown
  }
}) {
  const { Plugin } = context.pmState

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            handleTextInput: applyTypedCodeBlockShortcut,
          },
        }),
    ],
  }
}

export function highlightPlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        handleTextInput?: (view: any, from: number, to: number, text: string) => boolean
      }
    }) => unknown
  }
}) {
  const { Plugin } = context.pmState

  return {
    toHTMLRenderers: {
      htmlInline: {
        mark: (_node: unknown, rendererContext: { entering: boolean }) => ({
          type: rendererContext.entering ? 'openTag' : 'closeTag',
          tagName: 'mark',
        }),
      },
    },
    wysiwygCommands: {
      highlight: (_payload: unknown, state: any, dispatch?: (tr: unknown) => void) => toggleHighlightMark(state, dispatch),
    },
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            handleTextInput: applyTypedHighlightMarkerShortcut,
          },
        }),
    ],
  }
}

function getArrowMarkerDocRanges(doc: any): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []

  if (typeof doc?.descendants !== 'function') return ranges
  doc.descendants((node: any, position: number) => {
    if (node?.type?.name !== 'paragraph') return true
    parseAnnotationLineMarkers(node.textContent ?? '').forEach((match) => {
      if (match.marker.kind !== 'arrow') return
      const markerRange = getTextOffsetDecorationRange(node, position, match.markerStart, match.markerEnd)
      if (markerRange) ranges.push(markerRange)
    })
    return true
  })

  return ranges
}

export function getArrowMarkerDeletionRange(
  state: { doc?: any; selection?: { empty?: boolean; from?: number; to?: number } },
  key: string,
): { from: number; to: number } | null {
  if (key !== 'Backspace' && key !== 'Delete') return null

  const selection = state?.selection
  if (!selection || !state?.doc || typeof selection.from !== 'number' || typeof selection.to !== 'number') {
    return null
  }

  const markerRanges = getArrowMarkerDocRanges(state.doc)
  if (!selection.empty) {
    const selectionFrom = Math.min(selection.from, selection.to)
    const selectionTo = Math.max(selection.from, selection.to)
    const touchedRanges = markerRanges.filter((range) => range.from < selectionTo && range.to > selectionFrom)
    if (touchedRanges.length === 0) return null
    return {
      from: Math.min(selectionFrom, ...touchedRanges.map((range) => range.from)),
      to: Math.max(selectionTo, ...touchedRanges.map((range) => range.to)),
    }
  }

  const cursor = selection.from
  return markerRanges.find((range) => {
    if (key === 'Backspace') return cursor > range.from && cursor <= range.to
    return cursor >= range.from && cursor < range.to
  }) ?? null
}

export function getArrowMarkerNavigationPosition(
  state: { doc?: any; selection?: { empty?: boolean; from?: number } },
  key: string,
): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null

  const selection = state?.selection
  if (!selection?.empty || !state?.doc || typeof selection.from !== 'number') return null

  const cursor = selection.from
  const markerRanges = getArrowMarkerDocRanges(state.doc)

  if (key === 'ArrowRight') {
    const range = markerRanges.find((candidate) => cursor >= candidate.from && cursor < candidate.to)
    return range ? range.to : null
  }

  for (let index = markerRanges.length - 1; index >= 0; index -= 1) {
    const range = markerRanges[index]
    if (cursor > range.from && cursor <= range.to) return range.from
  }

  return null
}

function getArrowMarkerBoundaryForCursor(
  markerRanges: Array<{ from: number; to: number }>,
  cursor: number,
): { pos: number; side: -1 | 1; inside: boolean } | null {
  for (const range of markerRanges) {
    if (cursor === range.from) return { pos: range.from, side: -1, inside: false }
    if (cursor === range.to) return { pos: range.to, side: 1, inside: false }
    if (cursor > range.from && cursor < range.to) {
      const useRightEdge = cursor >= (range.from + range.to) / 2
      return {
        pos: useRightEdge ? range.to : range.from,
        side: useRightEdge ? 1 : -1,
        inside: true,
      }
    }
  }
  return null
}

export function getArrowMarkerSelectionSnapPosition(
  state: { doc?: any; selection?: { empty?: boolean; from?: number } },
): number | null {
  const selection = state?.selection
  if (!selection?.empty || !state?.doc || typeof selection.from !== 'number') return null
  const boundary = getArrowMarkerBoundaryForCursor(getArrowMarkerDocRanges(state.doc), selection.from)
  return boundary?.inside ? boundary.pos : null
}

export function annotationLinePlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        decorations?: (state: { doc: any }) => unknown
        handleKeyDown?: (view: any, event: KeyboardEvent) => boolean
      }
      appendTransaction?: (transactions: unknown[], oldState: unknown, newState: { doc: any; selection?: { empty?: boolean; from?: number }; tr: any }) => unknown
    }) => unknown
  }
  pmView: {
    Decoration: {
      node: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    toHTMLRenderers: {
      paragraph: (
        node: unknown,
        rendererContext: {
          entering: boolean
          getChildrenText?: (node: unknown) => string
          origin?: () => ToastHtmlToken
        },
      ) => {
        const originalToken = rendererContext.origin?.() ?? null
        if (!rendererContext.entering) return originalToken
        const paragraphText = getToastNodeText(node, rendererContext.getChildrenText)
        const match = parseAnnotationLine(paragraphText)
        if (!match || match.marker.kind === 'arrow') return originalToken
        return applyAnnotationLineClassToHtmlToken(originalToken, match) as ToastHtmlToken
      },
      text: (node: unknown, rendererContext: { origin?: () => ToastHtmlToken }) => {
        const originalToken = rendererContext.origin?.() ?? null
        return applyAnnotationMarkerToTextHtmlToken(node, originalToken) as ToastHtmlToken
      },
    },
    wysiwygPlugins: [
      () =>
        new Plugin({
          appendTransaction: (_transactions: unknown[], _oldState: unknown, newState: { doc: any; selection?: { empty?: boolean; from?: number }; tr: any }) => {
            const snapPosition = getArrowMarkerSelectionSnapPosition(newState)
            if (snapPosition === null) return null
            return newState.tr
              .setSelection(TextSelection.create(newState.doc, snapPosition, snapPosition))
              .setMeta('addToHistory', false)
          },
          props: {
            handleKeyDown: (view: any, event: KeyboardEvent) => {
              const markerRange = getArrowMarkerDeletionRange(view?.state, event.key)
              if (markerRange) {
                event.preventDefault()
                view.dispatch?.(view.state.tr.delete(markerRange.from, markerRange.to).scrollIntoView())
                return true
              }

              if (!event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
                const nextPosition = getArrowMarkerNavigationPosition(view?.state, event.key)
                if (nextPosition !== null) {
                  event.preventDefault()
                  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPosition, nextPosition))
                  view.dispatch?.(tr.scrollIntoView())
                  return true
                }
              }

              return false
            },
            decorations: (state: { doc: any; selection?: { empty?: boolean; from?: number } }) => {
              const decorations: unknown[] = []
              const arrowMarkerRanges: Array<{ from: number; to: number }> = []
              state.doc.descendants((node: any, position: number) => {
                if (node?.type?.name !== 'paragraph') return true
                const matches = parseAnnotationLineMarkers(node.textContent ?? '')
                if (matches.length === 0) return true

                const from = position
                const to = position + node.nodeSize
                const lineMatch = matches.find((annotationMatch) => annotationMatch.marker.kind === 'line') ?? null
                if (lineMatch) {
                  decorations.push(
                    Decoration.node(
                      from,
                      to,
                      { class: getAnnotationLineClassNames(lineMatch).join(' ') },
                      { key: `annotation-line-${from}-${to}` },
                    ),
                  )
                }

                matches.forEach((markerMatch, index) => {
                  const markerStart =
                    markerMatch.marker.kind === 'arrow'
                      ? markerMatch.markerStart
                      : markerMatch.markerStart
                  const markerEnd =
                    markerMatch.marker.kind === 'arrow'
                      ? markerMatch.markerEnd
                      : markerMatch.markerEnd
                  const markerRange = getTextOffsetDecorationRange(
                    node,
                    position,
                    markerStart,
                    markerEnd,
                  )
                  if (markerRange) {
                    const markerClassNames = [ANNOTATION_LINE_MARKER_CLASS_NAME]
                    if (markerMatch.marker.kind === 'arrow') {
                      arrowMarkerRanges.push(markerRange)
                      markerClassNames.push(...getAnnotationInlineArrowClassNames(markerMatch))
                    }
                    decorations.push(
                      Decoration.inline(
                        markerRange.from,
                        markerRange.to,
                        { class: markerClassNames.join(' ') },
                        { key: `annotation-marker-${index}-${markerRange.from}-${markerRange.to}` },
                      ),
                    )
                  }
                })
                return true
              })
              const cursor = state.selection?.empty && typeof state.selection.from === 'number' ? state.selection.from : null
              const boundary = cursor === null ? null : getArrowMarkerBoundaryForCursor(arrowMarkerRanges, cursor)
              if (boundary) {
                decorations.push(
                  Decoration.widget(
                    boundary.pos,
                    createArrowBoundaryCaretWidget,
                    {
                      key: `annotation-arrow-caret-${boundary.pos}`,
                      classNames: [ANNOTATION_ARROW_BOUNDARY_CARET_CLASS_NAME],
                      relaxedSide: true,
                      side: boundary.side,
                    },
                  ),
                )
              }
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
    ],
  }
}

export function listMarkerPlugin(context: { instance: Editor }) {
  const contextEditor = context.instance

  return {
    toHTMLRenderers: {
      list: (node: ToastListMdNode, context: { entering: boolean; origin?: () => ToastHtmlToken }) => {
        const originalToken = context.origin?.() ?? null
        const listData = node.listData
        if (!context.entering || listData?.type !== 'bullet') return originalToken
        return applyBulletListMarkerToHtmlToken(
          originalToken,
          getBulletListMarkerFromMarkdownChar(listData.bulletChar),
        ) as ToastHtmlToken
      },
    },
    toMarkdownRenderers: {
      bulletList: (nodeInfo?: { node?: { attrs?: unknown } }) => ({
        delim: getBulletListMarkdownDelimiter(nodeInfo?.node?.attrs),
      }),
    },
    wysiwygCommands: {
      dashList: () => {
        return applyBulletListMarkerCommand(contextEditor, 'dash')
      },
    },
    toolbarItems: [
      {
        groupIndex: 2,
        itemIndex: 0,
        item: {
          name: 'dashList',
          className: 'dash-list',
          command: 'dashList',
          tooltip: 'Dash list',
          state: 'bulletList',
        },
      },
    ],
  }
}

export function thematicBreakShortcutPlugin(context: {
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
  pmModel: { Fragment: { fromArray: (nodes: unknown[]) => unknown } }
  pmState: {
    Selection: { near: (resolvedPos: unknown, bias?: number) => unknown }
  }
  instance: {
    getMarkdown: () => string
    setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
    setSelection: (start: number | [number, number], end?: number | [number, number]) => void
    convertPosToMatchEditorMode: (
      start: number | [number, number],
      end?: number | [number, number],
      mode?: 'markdown' | 'wysiwyg',
    ) => [number | [number, number], number | [number, number]]
    isWysiwygMode: () => boolean
  }
}) {
  const { keymap } = context.pmKeymap
  const { Fragment } = context.pmModel
  const { Selection } = context.pmState

  return {
    wysiwygPlugins: [
      () =>
        keymap({
          Enter: (state: {
            selection: {
              empty: boolean
              $from: {
                parent: { textContent: string; type: { name: string } }
                depth: number
                before: (depth: number) => number
                after: (depth: number) => number
              }
            }
            schema: { nodes: Record<string, { create: () => unknown } | undefined> }
            tr: {
              replaceWith: (from: number, to: number, content: unknown) => unknown
              doc: { resolve: (pos: number) => unknown; content: { size: number } }
              setSelection: (selection: unknown) => unknown
              scrollIntoView: () => unknown
            }
          }, dispatch?: (tr: unknown) => void) => {
            const { selection, schema, tr } = state
            if (!selection.empty) return false

            const { $from } = selection
            if ($from.parent.type.name !== 'paragraph') return false

            const currentLine = ($from.parent.textContent ?? '').replace(/\u200b/g, '')
            if (!isHorizontalRuleMarkerLine(currentLine)) return false

            const thematicBreakNode = schema.nodes.thematicBreak?.create()
            const paragraphNode = schema.nodes.paragraph?.create()
            if (!thematicBreakNode || !paragraphNode) return false

            const blockDepth = $from.depth
            const from = $from.before(blockDepth)
            const to = $from.after(blockDepth)

            const nextTr = tr.replaceWith(from, to, Fragment.fromArray([thematicBreakNode, paragraphNode])) as {
              doc: { resolve: (pos: number) => unknown; content: { size: number } }
              setSelection: (selection: unknown) => unknown
              scrollIntoView: () => unknown
            }

            const selectionPos = Math.min(from + 2, nextTr.doc.content.size)
            const nextSelection = Selection.near(nextTr.doc.resolve(selectionPos), 1)
            const nextTrWithSelection = nextTr.setSelection(nextSelection) as {
              scrollIntoView: () => unknown
            }
            dispatch?.(nextTrWithSelection.scrollIntoView())
            return true
          },
        }),
    ],
  }
}

function splitCheckedTaskListItemWithUncheckedNext(state: any, dispatch?: (tr: unknown) => void) {
  const { selection, tr } = state
  const { $from, $to } = selection
  if (!selection.empty) return false
  if ($from.depth < 2 || !$from.sameParent($to)) return false

  const listItemNode = $from.node(-1)
  if (listItemNode?.type?.name !== 'listItem') return false
  if (!listItemNode.attrs?.task || !listItemNode.attrs?.checked) return false

  const nextType = $to.pos === $from.end() ? listItemNode.contentMatchAt(0).defaultType : null
  const typesAfter = [
    {
      type: listItemNode.type,
      attrs: {
        ...listItemNode.attrs,
        checked: false,
      },
    },
    nextType ? { type: nextType } : null,
  ]

  if (!canSplit(tr.doc, $from.pos, 2, typesAfter)) return false
  tr.split($from.pos, 2, typesAfter)
  dispatch?.(tr.scrollIntoView())
  return true
}

function getTaskListItemEnterContext(state: any) {
  const { selection } = state ?? {}
  if (!selection?.empty) return null

  const { $from } = selection
  if (!$from || $from.parent?.type?.name !== 'paragraph') return null

  const listItemDepth = getListItemDepth($from)
  if (listItemDepth === null) return null

  const listItemNode = $from.node(listItemDepth)
  const parentListDepth = listItemDepth - 1
  const parentList = $from.node(parentListDepth)
  if (listItemNode?.type?.name !== 'listItem') return null
  if (parentList?.type?.name !== 'bulletList' && parentList?.type?.name !== 'orderedList') return null
  if (!listItemNode.attrs?.task) return null
  if (listItemNode.childCount !== 1 || !isEmptyEditorTextBlock($from.parent)) return null

  return {
    $from,
    listItemDepth,
    listItemNode,
    parentListDepth,
    parentList,
    itemIndex: $from.index(parentListDepth),
  }
}

function createListNodeWithItems(listNode: any, items: any[]) {
  return listNode.type.create(listNode.attrs, items)
}

function createEmptyParagraph(schema: any) {
  return schema.nodes.paragraph?.create()
}

function exitTopLevelEmptyTaskListItem(state: any, dispatch?: (tr: unknown) => void): boolean {
  const context = getTaskListItemEnterContext(state)
  if (!context) return false

  const { $from, parentListDepth, parentList, itemIndex } = context
  const paragraphNode = createEmptyParagraph(state.schema)
  if (!paragraphNode) return false

  if (!dispatch) return true

  const beforeItems: any[] = []
  const afterItems: any[] = []
  for (let index = 0; index < parentList.childCount; index += 1) {
    if (index < itemIndex) beforeItems.push(parentList.child(index))
    if (index > itemIndex) afterItems.push(parentList.child(index))
  }

  const replacementNodes: any[] = []
  if (beforeItems.length > 0) replacementNodes.push(createListNodeWithItems(parentList, beforeItems))
  replacementNodes.push(paragraphNode)
  if (afterItems.length > 0) replacementNodes.push(createListNodeWithItems(parentList, afterItems))

  const listStart = $from.before(parentListDepth)
  const listEnd = $from.after(parentListDepth)
  const paragraphStart =
    listStart + (beforeItems.length > 0 ? replacementNodes[0].nodeSize : 0)
  const nextTr = state.tr.replaceWith(listStart, listEnd, Fragment.fromArray(replacementNodes))
  const selectionPosition = Math.min(paragraphStart + 1, nextTr.doc.content.size)
  dispatch(nextTr.setSelection(TextSelection.create(nextTr.doc, selectionPosition, selectionPosition)).scrollIntoView())
  return true
}

function liftNestedEmptyTaskListItem(state: any, dispatch?: (tr: unknown) => void): boolean {
  const context = getTaskListItemEnterContext(state)
  if (!context) return false

  const { $from, listItemNode, parentListDepth, parentList, itemIndex } = context
  const ancestorItemDepth = parentListDepth - 1
  if (ancestorItemDepth <= 0 || $from.node(ancestorItemDepth)?.type?.name !== 'listItem') return false

  const ancestorItem = $from.node(ancestorItemDepth)
  const parentListChildIndex = $from.index(ancestorItemDepth)
  const paragraphNode = createEmptyParagraph(state.schema)
  if (!paragraphNode) return false

  if (!dispatch) return true

  const beforeNestedItems: any[] = []
  const afterNestedItems: any[] = []
  for (let index = 0; index < parentList.childCount; index += 1) {
    if (index < itemIndex) beforeNestedItems.push(parentList.child(index))
    if (index > itemIndex) afterNestedItems.push(parentList.child(index))
  }

  const rebuiltAncestorChildren: any[] = []
  for (let index = 0; index < ancestorItem.childCount; index += 1) {
    if (index === parentListChildIndex) {
      if (beforeNestedItems.length > 0) {
        rebuiltAncestorChildren.push(createListNodeWithItems(parentList, beforeNestedItems))
      }
      continue
    }
    rebuiltAncestorChildren.push(ancestorItem.child(index))
  }

  const liftedItemChildren = [paragraphNode]
  if (afterNestedItems.length > 0) {
    liftedItemChildren.push(createListNodeWithItems(parentList, afterNestedItems))
  }

  const rebuiltAncestorItem = ancestorItem.type.create(ancestorItem.attrs, rebuiltAncestorChildren)
  const liftedItem = listItemNode.type.create(listItemNode.attrs, liftedItemChildren)
  const ancestorItemStart = $from.before(ancestorItemDepth)
  const ancestorItemEnd = $from.after(ancestorItemDepth)
  const nextTr = state.tr.replaceWith(
    ancestorItemStart,
    ancestorItemEnd,
    Fragment.fromArray([rebuiltAncestorItem, liftedItem]),
  )
  const liftedItemStart = ancestorItemStart + rebuiltAncestorItem.nodeSize
  const selectionPosition = Math.min(liftedItemStart + 2, nextTr.doc.content.size)
  dispatch(nextTr.setSelection(TextSelection.create(nextTr.doc, selectionPosition, selectionPosition)).scrollIntoView())
  return true
}

function handleTaskListItemEnter(state: any, dispatch?: (tr: unknown) => void): boolean {
  const context = getTaskListItemEnterContext(state)
  if (context) {
    const isNestedTask =
      context.parentListDepth > 1 && context.$from.node(context.parentListDepth - 1)?.type?.name === 'listItem'
    return isNestedTask
      ? liftNestedEmptyTaskListItem(state, dispatch)
      : exitTopLevelEmptyTaskListItem(state, dispatch)
  }

  return splitCheckedTaskListItemWithUncheckedNext(state, dispatch)
}

export function uncheckedTaskEnterPlugin(context: {
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
}) {
  const { keymap } = context.pmKeymap

  return {
    wysiwygPlugins: [
      () =>
        keymap({
          Enter: handleTaskListItemEnter,
        }),
    ],
  }
}

export type ParagraphSpaceShortcut =
  | { kind: 'heading'; level: number }
  | { kind: 'dashList' }
  | { kind: 'bulletList' }
  | { kind: 'numberedList'; order: number }
  | { kind: 'blockQuote' }

export function getParagraphSpaceShortcut(markerText: string): ParagraphSpaceShortcut | null {
  const normalizedMarker = markerText.replace(/\u200b/g, '')
  const headingMatch = normalizedMarker.match(/^\s*(#{1,6})$/)
  if (headingMatch) return { kind: 'heading', level: headingMatch[1].length }

  if (/^\s*>$/.test(normalizedMarker)) return { kind: 'blockQuote' }
  if (/^\s*-$/.test(normalizedMarker)) return { kind: 'dashList' }
  if (/^\s*[*+]$/.test(normalizedMarker)) return { kind: 'bulletList' }

  const orderedMatch = normalizedMarker.match(/^\s*(\d+)[.)]$/)
  if (orderedMatch) return { kind: 'numberedList', order: Number(orderedMatch[1]) || 1 }

  return null
}

function getListItemDepth(resolvedPos: any): number | null {
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    if (resolvedPos.node(depth)?.type?.name === 'listItem') return depth
  }
  return null
}

function getTextSelectionPositionAtFirstTextBlockEnd(doc: any, listItemStart: number): number | null {
  const listItem = doc.nodeAt(listItemStart)
  if (!listItem) return null

  let selectionPosition: number | null = null
  listItem.descendants?.((node: any, position: number) => {
    if (!node?.isTextblock) return true
    const contentSize = typeof node.content?.size === 'number' ? node.content.size : 0
    selectionPosition = listItemStart + 1 + position + 1 + contentSize
    return false
  })

  if (selectionPosition === null) return null
  return Math.max(0, Math.min(doc.content.size, selectionPosition))
}

export function deleteEmptyListItemBackward(state: any, dispatch?: (tr: unknown) => void): boolean {
  const { selection } = state
  if (!selection?.empty || !state?.doc || !state?.tr) return false

  const { $from } = selection
  if (!$from || $from.parent?.type?.name !== 'paragraph') return false
  if ($from.parentOffset !== 0 || !isEmptyEditorTextBlock($from.parent)) return false

  const listItemDepth = getListItemDepth($from)
  if (listItemDepth === null) return false

  const listItemNode = $from.node(listItemDepth)
  const parentListDepth = listItemDepth - 1
  const parentList = $from.node(parentListDepth)
  if (listItemNode?.type?.name !== 'listItem') return false
  if (parentList?.type?.name !== 'bulletList' && parentList?.type?.name !== 'orderedList') return false
  if (listItemNode.childCount !== 1) return false

  const itemIndex = $from.index(parentListDepth)
  if (itemIndex <= 0) return false

  const previousItem = parentList.child(itemIndex - 1)
  const itemStart = $from.before(listItemDepth)
  const itemEnd = $from.after(listItemDepth)
  const previousItemStart = itemStart - previousItem.nodeSize

  if (!dispatch) return true

  let nextTr = state.tr.delete(itemStart, itemEnd)
  const selectionPosition = getTextSelectionPositionAtFirstTextBlockEnd(nextTr.doc, previousItemStart)
  if (selectionPosition === null) return false
  nextTr = nextTr.setSelection(TextSelection.create(nextTr.doc, selectionPosition, selectionPosition)).scrollIntoView()
  dispatch(nextTr)
  return true
}

function getCollapsedTopLevelBlockContext(state: any) {
  const { selection } = state ?? {}
  if (!selection?.empty) return null

  const { $from } = selection
  const blockDepth = $from?.depth
  if (typeof blockDepth !== 'number' || blockDepth <= 0) return null

  const parentDepth = blockDepth - 1
  const parentNode = $from.node(parentDepth)
  const blockIndex = $from.index(parentDepth)
  const from = $from.before(blockDepth)
  const to = $from.after(blockDepth)

  return {
    $from,
    parentNode,
    blockIndex,
    from,
    to,
    currentNode: $from.parent,
    previousNode: blockIndex > 0 ? parentNode.child(blockIndex - 1) : null,
    nextNode: blockIndex < parentNode.childCount - 1 ? parentNode.child(blockIndex + 1) : null,
  }
}

export function applyParagraphSpaceShortcut(state: any, dispatch?: (tr: unknown) => void): boolean {
  const { selection, schema } = state
  if (!selection?.empty) return false

  const { $from } = selection
  if (!$from || $from.parent?.type?.name !== 'paragraph') return false

  const markerText =
    typeof $from.parent.textBetween === 'function'
      ? $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
      : String($from.parent.textContent ?? '').slice(0, $from.parentOffset)
  const shortcut = getParagraphSpaceShortcut(markerText)
  if (!shortcut) return false

  const blockDepth = $from.depth
  const from = $from.before(blockDepth)
  const to = $from.after(blockDepth)
  const contentStart = $from.start(blockDepth)
  const paragraphType = schema.nodes.paragraph
  const contentAfterMarker = $from.parent.content.cut(Math.max(0, $from.parentOffset))
  const createParagraphWithContentAfterMarker = (targetParagraphType: any) =>
    targetParagraphType.create(null, contentAfterMarker)

  if (shortcut.kind === 'heading') {
    const headingType = schema.nodes.heading
    if (!headingType) return false
    if (!dispatch) return true
    const nextTr = state.tr
      .setBlockType(from, to, headingType, {
        level: shortcut.level,
        headingType: 'atx',
      })
      .delete(contentStart, selection.from)
    const caretPos = Math.min(contentStart, nextTr.doc.content.size)
    const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
    dispatch(nextTr.setSelection(nextSelection).scrollIntoView())
    return true
  }

  if (shortcut.kind === 'blockQuote') {
    const blockQuoteType = schema.nodes.blockQuote
    if (!blockQuoteType || !paragraphType) return false
    if (!dispatch) return true

    const blockQuoteNode = blockQuoteType.create(null, createParagraphWithContentAfterMarker(paragraphType))
    const nextTr = state.tr.replaceWith(from, to, blockQuoteNode)
    const caretPos = Math.min(from + 2, nextTr.doc.content.size)
    const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
    dispatch(nextTr.setSelection(nextSelection).scrollIntoView())
    return true
  }

  const listType = shortcut.kind === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
  const listItemType = schema.nodes.listItem
  if (!listType || !listItemType || !paragraphType) return false
  if (!dispatch) return true

  const paragraphNode = createParagraphWithContentAfterMarker(paragraphType)
  const listItemNode = listItemType.create(null, paragraphNode)
  const listAttrs =
    shortcut.kind === 'numberedList'
      ? { order: shortcut.order }
      : createBulletListAttrs(shortcut.kind === 'dashList' ? 'dash' : 'bullet')
  const listNode = listType.create(listAttrs, listItemNode)
  const nextTr = state.tr.replaceWith(from, to, listNode)
  const caretPos = Math.min(from + 3, nextTr.doc.content.size)
  const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
  dispatch(nextTr.setSelection(nextSelection).scrollIntoView())
  return true
}

export function headingSpaceShortcutPlugin(context: {
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
  pmState: {
    Selection: { near: (resolvedPos: unknown, bias?: number) => unknown }
    TextSelection: {
      create: (doc: unknown, anchor: number, head?: number) => unknown
    }
  }
}) {
  const { keymap } = context.pmKeymap
  const { Selection } = context.pmState

  const getBlockContext = getCollapsedTopLevelBlockContext

  const deleteEmptyParagraphAndPlaceSelectionNear = (
    state: any,
    dispatch: ((tr: unknown) => void) | undefined,
    from: number,
    to: number,
    selectionPos: number,
    bias: number,
  ) => {
    let nextTr = state.tr.delete(from, to)
    const docSize = nextTr.doc.content.size
    const safePos = Math.max(0, Math.min(docSize, selectionPos))
    const nextSelection = Selection.near(nextTr.doc.resolve(safePos), bias)
    nextTr = nextTr.setSelection(nextSelection).scrollIntoView()
    dispatch?.(nextTr)
    return true
  }

  const handleBackspaceFromEmptyParagraphAfterList = (state: any, dispatch?: (tr: unknown) => void) => {
    const context = getBlockContext(state)
    if (!context) return false
    const { $from, currentNode, previousNode, from, to } = context
    if (
      !shouldDeleteEmptyParagraphAtListBoundary({
        currentNode,
        previousNode,
        parentOffset: $from.parentOffset,
        direction: 'backward',
      })
    ) {
      return false
    }
    return deleteEmptyParagraphAndPlaceSelectionNear(state, dispatch, from, to, from - 1, -1)
  }

  const handleDeleteFromEmptyParagraphBeforeList = (state: any, dispatch?: (tr: unknown) => void) => {
    const context = getBlockContext(state)
    if (!context) return false
    const { $from, currentNode, nextNode, from, to } = context
    if (
      !shouldDeleteEmptyParagraphAtListBoundary({
        currentNode,
        nextNode,
        parentOffset: $from.parentOffset,
        direction: 'forward',
      })
    ) {
      return false
    }
    return deleteEmptyParagraphAndPlaceSelectionNear(state, dispatch, from, to, from, 1)
  }

  const handleBackspaceFromHeadingAfterEmptyParagraph = (state: any, dispatch?: (tr: unknown) => void) => {
    const context = getBlockContext(state)
    if (!context) return false
    const { $from, currentNode, previousNode, from, to } = context
    if (currentNode.type.name !== 'heading') return false
    if ($from.parentOffset !== 0) return false
    if (!previousNode || previousNode.type.name !== 'paragraph' || !isEmptyEditorTextBlock(previousNode)) return false

    const previousFrom = from - previousNode.nodeSize
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return false

    let nextTr =
      isEmptyEditorTextBlock(currentNode)
        ? state.tr.replaceWith(previousFrom, to, paragraphType.create())
        : state.tr.delete(previousFrom, from)
    const caretPos = Math.min(previousFrom + 1, nextTr.doc.content.size)
    nextTr = nextTr.setSelection(TextSelection.create(nextTr.doc, caretPos, caretPos)).scrollIntoView()
    dispatch?.(nextTr)
    return true
  }

  const handleDeleteFromEmptyParagraphBeforeHeading = (state: any, dispatch?: (tr: unknown) => void) => {
    const context = getBlockContext(state)
    if (!context) return false
    const { $from, currentNode, nextNode, from, to } = context
    if (currentNode.type.name !== 'paragraph') return false
    if (!isEmptyEditorTextBlock(currentNode)) return false
    if ($from.parentOffset !== currentNode.content.size) return false
    if (!nextNode || nextNode.type.name !== 'heading') return false

    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return false

    let nextTr =
      isEmptyEditorTextBlock(nextNode)
        ? state.tr.replaceWith(from, to + nextNode.nodeSize, paragraphType.create())
        : state.tr.delete(from, to)
    const caretPos = Math.min(from + 1, nextTr.doc.content.size)
    nextTr = nextTr.setSelection(TextSelection.create(nextTr.doc, caretPos, caretPos)).scrollIntoView()
    dispatch?.(nextTr)
    return true
  }

  return {
    wysiwygPlugins: [
      () =>
        keymap({
          Backspace: (state: any, dispatch?: (tr: unknown) => void) =>
            deleteEmptyListItemBackward(state, dispatch) ||
            deleteTerminalBlockBeforeCaret(state, 'backward', dispatch) ||
            handleBackspaceFromHeadingAfterEmptyParagraph(state, dispatch) ||
            handleBackspaceFromEmptyParagraphAfterList(state, dispatch),
          Delete: (state: any, dispatch?: (tr: unknown) => void) =>
            deleteTerminalBlockBeforeCaret(state, 'forward', dispatch) ||
            handleDeleteFromEmptyParagraphBeforeHeading(state, dispatch) ||
            handleDeleteFromEmptyParagraphBeforeList(state, dispatch),
          Space: applyParagraphSpaceShortcut,
        }),
    ],
  }
}

type MultiLineSelectionDecoration = { from: number; to: number }
type MultiLineDecorationState = {
  cursors: number[]
  selections: MultiLineSelectionDecoration[]
}

export function multiLineSelectionShortcutPlugin(context: {
  pmState: {
    PluginKey: new (name?: string) => {
      getState: (state: unknown) => MultiLineDecorationState | undefined
    }
    Plugin: new (spec: {
      key?: unknown
      state?: {
        init: () => MultiLineDecorationState
        apply: (tr: { getMeta: (key: unknown) => unknown }, previous: MultiLineDecorationState) => MultiLineDecorationState
      }
      props?: {
        decorations?: (state: unknown) => unknown
        handleDOMEvents?: {
          keydown?: (view: unknown, event: KeyboardEvent) => boolean
        }
      }
    }) => unknown
  }
  pmView: {
    Decoration: {
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
  onExpand: (direction: 'up' | 'down') => boolean
  onPluginKeyReady: (pluginKey: unknown) => void
}) {
  const { Plugin, PluginKey } = context.pmState
  const { Decoration, DecorationSet } = context.pmView
  const { keymap } = context.pmKeymap
  const { onExpand, onPluginKeyReady } = context
  const pluginKey = new PluginKey('tabs-multiline-cursors')
  onPluginKeyReady(pluginKey)

  const createCursorWidget = () => {
    const cursor = document.createElement('span')
    cursor.className = 'multiline-cursor-widget'
    return cursor
  }

  const createDomKeydownPlugin = () =>
    new Plugin({
      key: pluginKey,
      state: {
        init: () => ({ cursors: [], selections: [] }),
        apply: (tr, previous) => {
          const nextDecorationState = tr.getMeta(pluginKey)
          if (Array.isArray(nextDecorationState)) {
            return {
              cursors: nextDecorationState.filter((pos) => typeof pos === 'number'),
              selections: [],
            }
          }
          if (!nextDecorationState || typeof nextDecorationState !== 'object') return previous
          const candidate = nextDecorationState as Partial<MultiLineDecorationState>
          return {
            cursors: Array.isArray(candidate.cursors)
              ? candidate.cursors.filter((pos) => typeof pos === 'number')
              : previous.cursors,
            selections: Array.isArray(candidate.selections)
              ? candidate.selections.filter(
                  (selection): selection is MultiLineSelectionDecoration =>
                    typeof selection?.from === 'number' &&
                    typeof selection?.to === 'number' &&
                    selection.from < selection.to,
                )
              : previous.selections,
          }
        },
      },
      props: {
        decorations: (state) => {
          const decorationState = pluginKey.getState(state) ?? { cursors: [], selections: [] }
          const selectionDecorations = decorationState.selections.map((selection, index) =>
            Decoration.inline(
              selection.from,
              selection.to,
              { class: 'multiline-selection-range' },
              { key: `multiline-selection-${selection.from}-${selection.to}-${index}` },
            ),
          )
          const cursorDecorations = decorationState.cursors.map((pos, index) =>
            Decoration.widget(pos, createCursorWidget, {
              key: `multiline-cursor-${pos}-${index}`,
              side: 1,
              ignoreSelection: true,
            }),
          )
          return DecorationSet.create(
            (state as { doc: unknown }).doc,
            [...selectionDecorations, ...cursorDecorations],
          )
        },
        handleDOMEvents: {
          keydown: (_view, event) => {
            const direction = getMultilineSelectionShortcutDirection(event)
            if (!direction) return false
            const handled = onExpand(direction)
            if (!handled) return false
            event.preventDefault()
            event.stopPropagation()
            return true
          },
        },
      },
    })

  return {
    wysiwygPlugins: [
      createDomKeydownPlugin,
      () =>
        keymap({
          'Mod-Alt-ArrowUp': () => onExpand('up'),
          'Mod-Alt-ArrowDown': () => onExpand('down'),
          'Mod-Alt-Home': () => onExpand('up'),
          'Mod-Alt-End': () => onExpand('down'),
        }),
    ],
  }
}

export function getMultilineSelectionShortcutDirection(event: KeyboardEvent): 'up' | 'down' | null {
  const isMac = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const isArrowUp =
    event.key === 'ArrowUp' ||
    event.key === 'Up' ||
    event.code === 'ArrowUp' ||
    (isMac && (event.key === 'Home' || event.code === 'Home' || event.keyCode === 36))
  const isArrowDown =
    event.key === 'ArrowDown' ||
    event.key === 'Down' ||
    event.code === 'ArrowDown' ||
    (isMac && (event.key === 'End' || event.code === 'End' || event.keyCode === 35))

  if (isMac) {
    if (!event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey) return null
    if (isArrowUp) return 'up'
    if (isArrowDown) return 'down'
    return null
  }

  if (!event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey) return null
  if (isArrowUp) return 'up'
  if (isArrowDown) return 'down'
  return null
}

export const EDITOR_TOOLBAR_ITEMS: string[][] = [
  ['heading', 'bold', 'italic', 'strike'],
  ['hr', 'quote'],
  ['ul', 'ol', 'task'],
  ['table', 'image', 'link'],
  ['code', 'codeblock'],
]

export const TOAST_UI_TOOLBAR_TOOLTIP_LABELS: Record<string, string> = {
  heading: 'Headings',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  hrline: 'Horizontal rule',
  quote: 'Block quote',
  'bullet-list': 'Bullet list',
  'ordered-list': 'Ordered list',
  'task-list': 'Task',
  indent: 'Block indent',
  outdent: 'Remove block indent',
  table: 'Insert table',
  image: 'Insert image',
  link: 'Insert link',
  code: 'Inline code',
  codeblock: 'Code block',
  more: 'More',
}

export function getToastUiToolbarTooltipLabelFromClassName(className: string): string | null {
  const classNames = className.split(/\s+/).filter(Boolean)
  for (const toolbarClassName of classNames) {
    const label = TOAST_UI_TOOLBAR_TOOLTIP_LABELS[toolbarClassName]
    if (label) return label
  }
  return null
}

function getToolbarButtonAppTooltip(button: HTMLButtonElement): string {
  return (
    button.dataset.appTooltip?.trim() ||
    button.getAttribute('aria-label')?.trim() ||
    button.getAttribute('title')?.trim() ||
    getToastUiToolbarTooltipLabelFromClassName(button.className) ||
    button.textContent?.trim() ||
    ''
  )
}

export function installToolbarAppTooltips(root: HTMLElement): () => void {
  const decorateToolbarButtons = () => {
    root.querySelectorAll<HTMLButtonElement>('.toastui-editor-defaultUI-toolbar button, .toastui-editor-toolbar button')
      .forEach((button) => {
        const tooltip = getToolbarButtonAppTooltip(button)
        if (tooltip) button.setAttribute('data-app-tooltip', tooltip)
        if (button.hasAttribute('title')) button.removeAttribute('title')
      })
  }

  decorateToolbarButtons()
  if (typeof MutationObserver === 'undefined') return () => undefined

  const observer = new MutationObserver(decorateToolbarButtons)
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}

export const EDITOR_SPELLCHECK_ROOT_SELECTOR = '.toastui-editor .ProseMirror[contenteditable="true"]'

export function installEditorSpellcheck(root: HTMLElement): () => void {
  const enableSpellcheck = () => {
    root.querySelectorAll<HTMLElement>(EDITOR_SPELLCHECK_ROOT_SELECTOR).forEach((element) => {
      element.setAttribute('spellcheck', 'true')
      element.spellcheck = true
    })
  }

  enableSpellcheck()
  if (typeof MutationObserver === 'undefined') return () => undefined

  const observer = new MutationObserver(enableSpellcheck)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] })
  return () => observer.disconnect()
}

function createToolbarTextButton(
  className: string,
  label: string,
  text: string,
  onClick: () => void,
  tooltipLabel = label,
) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = text
  button.setAttribute('aria-label', label)
  button.setAttribute('data-app-tooltip', tooltipLabel)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return button
}

export function installClearToolbarButton(root: HTMLElement, onClear: () => void) {
  const toolbar = root.querySelector('.toastui-editor-defaultUI-toolbar')
  if (!(toolbar instanceof HTMLElement)) return
  if (toolbar.querySelector('.clear-note-toolbar-btn')) return

  const group = document.createElement('div')
  group.className = 'toastui-editor-toolbar-group clear-note-toolbar-group'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'clear-note-toolbar-btn'
  button.textContent = '⌫'
  button.setAttribute('aria-label', 'clear contents')
  button.setAttribute('data-app-tooltip', 'Clear contents')
  button.addEventListener('click', (event) => {
    event.preventDefault()
    onClear()
  })

  group.appendChild(button)
  toolbar.appendChild(group)
}

export function installNoteToolsToolbarButtons(
  root: HTMLElement,
  options: {
    onAisles: () => void
  },
) {
  const toolbar = root.querySelector('.toastui-editor-defaultUI-toolbar')
  if (!(toolbar instanceof HTMLElement)) return
  if (toolbar.querySelector('.aisles-toolbar-btn')) return

  const group = document.createElement('div')
  group.className = 'toastui-editor-toolbar-group note-tools-toolbar-group'

  const aisleButton = createToolbarTextButton('aisles-toolbar-btn', 'aisles', 'A', options.onAisles, 'Aisles')

  group.appendChild(aisleButton)
  toolbar.appendChild(group)
}

export function getActiveHeadingLevel(editor: Editor | null): number | null {
  const view = (editor as any)?.wwEditor?.view
  const state = view?.state
  const selection = state?.selection
  if (!state || !selection) return null

  const fromParent = selection.$from?.parent
  const toParent = selection.$to?.parent
  if (fromParent && fromParent === toParent) {
    if (fromParent.type?.name === 'heading') return Number(fromParent.attrs?.level) || null
    if (fromParent.type?.name === 'paragraph') return 0
  }

  const headingLevels = new Set<number>()
  let paragraphSelected = false

  state.doc?.nodesBetween?.(selection.from, selection.to, (node: any) => {
    if (node.type?.name === 'heading') {
      headingLevels.add(Number(node.attrs?.level))
      return false
    }
    if (node.type?.name === 'paragraph') {
      paragraphSelected = true
      return false
    }
    return true
  })

  if (headingLevels.size === 1 && !paragraphSelected) return Array.from(headingLevels)[0] ?? null
  if (headingLevels.size === 0 && paragraphSelected) return 0
  return null
}

function syncHeadingPopupActiveState(root: HTMLElement, editor: Editor | null) {
  const popup = root.querySelector('.toastui-editor-popup-add-heading')
  if (!(popup instanceof HTMLElement)) return

  const activeLevel = getActiveHeadingLevel(editor)
  popup.querySelectorAll<HTMLElement>('li[data-type]').forEach((item) => {
    item.classList.remove('is-active-heading-choice')
    item.removeAttribute('aria-current')
  })

  const selector =
    activeLevel === 0
      ? 'li[data-type="Paragraph"]'
      : typeof activeLevel === 'number'
        ? `li[data-type="Heading"][data-level="${activeLevel}"]`
        : ''
  if (!selector) return

  const activeItem = popup.querySelector<HTMLElement>(selector)
  if (!activeItem) return
  activeItem.classList.add('is-active-heading-choice')
  activeItem.setAttribute('aria-current', 'true')
}

export function installHeadingPopupActiveState(root: HTMLElement, getEditor: () => Editor | null) {
  const sync = () => window.requestAnimationFrame(() => syncHeadingPopupActiveState(root, getEditor()))
  const observer = new MutationObserver(sync)

  observer.observe(root, { childList: true, subtree: true })
  root.addEventListener('click', sync, true)
  root.addEventListener('keyup', sync, true)
  root.addEventListener('mouseup', sync, true)

  return () => {
    observer.disconnect()
    root.removeEventListener('click', sync, true)
    root.removeEventListener('keyup', sync, true)
    root.removeEventListener('mouseup', sync, true)
  }
}
