import type { Editor } from '@toast-ui/editor'
import { canSplit } from 'prosemirror-transform'
import { applyBulletListMarkerCommand } from './list-marker-commands'
import {
  isEmptyEditorTextBlock,
  shouldDeleteEmptyParagraphAtListBoundary,
} from './empty-paragraph-list-delete'
import {
  applyAnnotationLineClassToHtmlToken,
  applyAnnotationMarkerToTextHtmlToken,
  isAnnotationLine,
  parseAnnotationLine,
  ANNOTATION_LINE_CLASS_NAME,
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

export function annotationLinePlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        decorations?: (state: { doc: any }) => unknown
      }
    }) => unknown
  }
  pmView: {
    Decoration: {
      node: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
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
        if (!isAnnotationLine(paragraphText)) return originalToken
        return applyAnnotationLineClassToHtmlToken(originalToken) as ToastHtmlToken
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
            decorations: (state: { doc: any }) => {
              const decorations: unknown[] = []
              state.doc.descendants((node: any, position: number) => {
                if (node?.type?.name !== 'paragraph') return true
                const match = parseAnnotationLine(node.textContent ?? '')
                if (!match) return true

                const from = position
                const to = position + node.nodeSize
                decorations.push(
                  Decoration.node(
                    from,
                    to,
                    { class: ANNOTATION_LINE_CLASS_NAME },
                    { key: `annotation-line-${from}-${to}` },
                  ),
                )

                const contentStart = position + 1
                const contentEnd = Math.max(contentStart, to - 1)
                const markerFrom = Math.min(contentStart + match.markerStart, contentEnd)
                const markerTo = Math.min(contentStart + match.prefixEnd, contentEnd)
                if (markerTo > markerFrom) {
                  decorations.push(
                    Decoration.inline(
                      markerFrom,
                      markerTo,
                      { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
                      { key: `annotation-marker-${markerFrom}-${markerTo}` },
                    ),
                  )
                }
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

            const markerText = ($from.parent.textContent ?? '').replace(/\u200b/g, '')
            const headingMatch = markerText.match(/^\s*(#{1,6})$/)
            const dashMatch = markerText.match(/^\s*-$/)
            const bulletMatch = markerText.match(/^\s*[*+]$/)
            const orderedMatch = markerText.match(/^\s*(\d+)[.)]$/)
            if (!headingMatch && !dashMatch && !bulletMatch && !orderedMatch) return false

            const blockDepth = $from.depth
            const from = $from.before(blockDepth)
            const to = $from.after(blockDepth)

            if (headingMatch) {
              const headingType = schema.nodes.heading
              if (!headingType) return false
              const headingNode = headingType.create({
                level: headingMatch[1].length,
                headingType: 'atx',
              })
              const nextTr = tr.replaceWith(from, to, headingNode)
              const caretPos = Math.min(from + 1, nextTr.doc.content.size)
              const nextSelection = TextSelection.create(nextTr.doc, caretPos, caretPos)
              dispatch?.(nextTr.setSelection(nextSelection).scrollIntoView())
              return true
            }

            const listType = orderedMatch ? schema.nodes.orderedList : schema.nodes.bulletList
            const listItemType = schema.nodes.listItem
            const paragraphType = schema.nodes.paragraph
            if (!listType || !listItemType || !paragraphType) return false

            const paragraphNode = paragraphType.create()
            const listItemNode = listItemType.create(null, paragraphNode)
            const listAttrs = orderedMatch
              ? { order: Number(orderedMatch[1]) || 1 }
              : createBulletListAttrs(dashMatch ? 'dash' : 'bullet')
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
