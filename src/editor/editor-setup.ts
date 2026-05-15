import type { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import { canSplit } from 'prosemirror-transform'
import { applyBulletListMarkerCommand } from './list-marker-commands'
import {
  isEmptyEditorTextBlock,
  shouldDeleteEmptyParagraphAtListBoundary,
} from './empty-paragraph-list-delete'
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
import { isHorizontalRuleMarkerLine } from '../markdown/markdown-utils'

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

function createInlineArrowWidget(classNames: string[]) {
  const element = document.createElement('span')
  element.className = classNames.join(' ')
  element.setAttribute('aria-hidden', 'true')
  return element
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

export function annotationLinePlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        decorations?: (state: { doc: any }) => unknown
        handleKeyDown?: (view: any, event: KeyboardEvent) => boolean
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
            decorations: (state: { doc: any }) => {
              const decorations: unknown[] = []
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
                      : markerMatch.markerRemovalStart
                  const markerEnd =
                    markerMatch.marker.kind === 'arrow'
                      ? markerMatch.markerEnd
                      : markerMatch.markerRemovalEnd
                  const markerRange = getTextOffsetDecorationRange(
                    node,
                    position,
                    markerStart,
                    markerEnd,
                  )
                  if (markerRange) {
                    if (markerMatch.marker.kind === 'arrow') {
                      const classNames = getAnnotationInlineArrowClassNames(markerMatch)
                      decorations.push(
                        Decoration.widget(
                          markerRange.from,
                          () => createInlineArrowWidget(classNames),
                          { key: `annotation-arrow-${index}-${markerRange.from}`, classNames, relaxedSide: true, side: 1 },
                        ),
                      )
                    }
                    decorations.push(
                      Decoration.inline(
                        markerRange.from,
                        markerRange.to,
                        { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
                        { key: `annotation-marker-${index}-${markerRange.from}-${markerRange.to}` },
                      ),
                    )
                  }
                })
                return true
              })
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

export function uncheckedTaskEnterPlugin(context: {
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
}) {
  const { keymap } = context.pmKeymap

  return {
    wysiwygPlugins: [
      () =>
        keymap({
          Enter: splitCheckedTaskListItemWithUncheckedNext,
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
  const { Selection, TextSelection } = context.pmState

  const getBlockContext = (state: any) => {
    const { selection } = state
    if (!selection.empty) return null

    const { $from } = selection
    const blockDepth = $from.depth
    if (blockDepth <= 0) return null

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
            handleBackspaceFromHeadingAfterEmptyParagraph(state, dispatch) ||
            handleBackspaceFromEmptyParagraphAfterList(state, dispatch),
          Delete: (state: any, dispatch?: (tr: unknown) => void) =>
            handleDeleteFromEmptyParagraphBeforeHeading(state, dispatch) ||
            handleDeleteFromEmptyParagraphBeforeList(state, dispatch),
          Space: (state: any, dispatch?: (tr: unknown) => void) => {
            const { selection, schema, tr } = state
            if (!selection.empty) return false

            const { $from } = selection
            if ($from.parent.type.name !== 'paragraph') return false
            if ($from.parentOffset !== $from.parent.content.size) return false

            const shortcut = getParagraphSpaceShortcut($from.parent.textContent ?? '')
            if (!shortcut) return false

            const blockDepth = $from.depth
            const from = $from.before(blockDepth)
            const to = $from.after(blockDepth)

            if (shortcut.kind === 'heading') {
              const headingType = schema.nodes.heading
              if (!headingType) return false
              const headingNode = headingType.create({
                level: shortcut.level,
                headingType: 'atx',
              })
              const nextTr = tr.replaceWith(from, to, headingNode)
              const caretPos = Math.min(from + 1, nextTr.doc.content.size)
              const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
              dispatch?.(nextTr.setSelection(nextSelection).scrollIntoView())
              return true
            }

            if (shortcut.kind === 'blockQuote') {
              const blockQuoteType = schema.nodes.blockQuote
              const paragraphType = schema.nodes.paragraph
              if (!blockQuoteType || !paragraphType) return false

              const blockQuoteNode = blockQuoteType.create(null, paragraphType.create())
              const nextTr = tr.replaceWith(from, to, blockQuoteNode)
              const caretPos = Math.min(from + 2, nextTr.doc.content.size)
              const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
              dispatch?.(nextTr.setSelection(nextSelection).scrollIntoView())
              return true
            }

            const listType = shortcut.kind === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
            const listItemType = schema.nodes.listItem
            const paragraphType = schema.nodes.paragraph
            if (!listType || !listItemType || !paragraphType) return false

            const paragraphNode = paragraphType.create()
            const listItemNode = listItemType.create(null, paragraphNode)
            const listAttrs =
              shortcut.kind === 'numberedList'
                ? { order: shortcut.order }
                : createBulletListAttrs(shortcut.kind === 'dashList' ? 'dash' : 'bullet')
            const listNode = listType.create(listAttrs, listItemNode)
            const nextTr = tr.replaceWith(from, to, listNode)
            const caretPos = Math.min(from + 3, nextTr.doc.content.size)
            const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
            dispatch?.(nextTr.setSelection(nextSelection).scrollIntoView())
            return true
          },
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

function bindToolbarTooltip(root: HTMLElement, toolbar: HTMLElement, button: HTMLButtonElement, label: string) {
  const tooltip = root.querySelector('.toastui-editor-tooltip')
  const tooltipText = tooltip?.querySelector('.text')
  if (!(tooltip instanceof HTMLElement) || !(tooltipText instanceof HTMLElement)) return

  const showTooltip = () => {
    const toolbarRect = toolbar.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    tooltip.style.display = 'block'
    tooltip.style.left = `${buttonRect.left - toolbarRect.left + 6}px`
    tooltip.style.top = `${buttonRect.top - toolbarRect.top + button.offsetHeight + 6}px`
    tooltipText.textContent = label
  }

  const hideTooltip = () => {
    tooltip.style.display = 'none'
  }

  button.addEventListener('mouseover', showTooltip)
  button.addEventListener('mouseout', hideTooltip)
  button.addEventListener('focus', showTooltip)
  button.addEventListener('blur', hideTooltip)
}

function createToolbarTextButton(className: string, label: string, text: string, onClick: () => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = text
  button.setAttribute('aria-label', label)
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
  button.addEventListener('click', (event) => {
    event.preventDefault()
    onClear()
  })
  bindToolbarTooltip(root, toolbar, button, 'Clear contents')

  group.appendChild(button)
  toolbar.appendChild(group)
}

export function installNoteToolsToolbarButtons(
  root: HTMLElement,
  options: {
    onNoteLink: () => void
    onAisles: () => void
  },
) {
  const toolbar = root.querySelector('.toastui-editor-defaultUI-toolbar')
  if (!(toolbar instanceof HTMLElement)) return
  if (toolbar.querySelector('.note-link-toolbar-btn') || toolbar.querySelector('.aisles-toolbar-btn')) return

  const group = document.createElement('div')
  group.className = 'toastui-editor-toolbar-group note-tools-toolbar-group'

  const noteLinkButton = createToolbarTextButton('note-link-toolbar-btn', 'note link', 'N', options.onNoteLink)
  const aisleButton = createToolbarTextButton('aisles-toolbar-btn', 'aisles', 'A', options.onAisles)
  bindToolbarTooltip(root, toolbar, noteLinkButton, 'Note link')
  bindToolbarTooltip(root, toolbar, aisleButton, 'Aisles')

  group.appendChild(noteLinkButton)
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
