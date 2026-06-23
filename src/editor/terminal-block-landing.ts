import {
  NOTE_PREVIEW_REFERENCE_RE,
  getPreviewReferenceTokenLengthAt,
  parseMarkdownNoteReferenceToken,
} from '../markdown/note-context-tokens.js'
import { getMediaKindFromUrl, MEDIA_PLAYER_SELECTOR } from '../media/media-utils'
import { TextSelection } from 'prosemirror-state'

export const TERMINAL_BLOCK_LANDING_ZONE_ATTR = 'data-aislenote-terminal-block-landing-zone'
export const TERMINAL_BLOCK_LANDING_ZONE_CLASS = 'aislenote-terminal-block-landing-zone'
const TERMINAL_BLOCK_BOUNDARY_CLICK_MAX_DISTANCE_PX = 64

export type TerminalBlockLandingKind = 'codeBlock' | 'notePreview' | 'image' | 'media' | 'table'

export type TerminalBlockLandingTarget = {
  kind: TerminalBlockLandingKind
  position: number
}

type TextSelectionFactory = { create: (doc: any, anchor: number, head?: number) => unknown }
type TerminalBlockContext = { node: any; start: number; end: number; index: number }
type TerminalBlockBoundarySide = 'before' | 'after'
export type TerminalBlockArrowDirection = 'up' | 'down'
export type TerminalBlockDeleteDirection = 'backward' | 'forward'

function getDocEnd(doc: any): number {
  if (typeof doc?.content?.size === 'number') return doc.content.size
  let size = 0
  for (let index = 0; index < (doc?.childCount ?? 0); index += 1) {
    size += doc.child(index)?.nodeSize ?? 0
  }
  return size
}

export function isNotePreviewOnlyParagraphText(text: string): boolean {
  const normalized = String(text ?? '').replace(/\u200b/g, '').trim()
  if (!normalized) return false

  let hasValidToken = false
  const remaining = normalized.replace(NOTE_PREVIEW_REFERENCE_RE, (token) => {
    if (!parseMarkdownNoteReferenceToken(token)?.embed || getPreviewReferenceTokenLengthAt(token, 0) !== token.length) return token
    hasValidToken = true
    return ''
  })
  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0
  return hasValidToken && remaining.trim().length === 0
}

function isBlankSentinelText(text: string): boolean {
  return String(text ?? '').replace(/\u200b/g, '').trim().length === 0
}

function isImageOnlyParagraphNode(node: any): boolean {
  if (node?.type?.name !== 'paragraph') return false
  const childCount = Number(node?.childCount ?? 0)
  if (childCount <= 0 || typeof node?.child !== 'function') return false

  let hasImage = false
  for (let index = 0; index < childCount; index += 1) {
    const child = node.child(index)
    const typeName = child?.type?.name
    if (typeName === 'image') {
      hasImage = true
      continue
    }
    if ((child?.isText || typeName === 'text') && isBlankSentinelText(child.text ?? child.textContent ?? '')) {
      continue
    }
    return false
  }

  return hasImage
}

function getTextNodeMediaLinkHref(node: any): string | null {
  if (!node?.isText && node?.type?.name !== 'text') return null
  const marks = Array.isArray(node?.marks) ? node.marks : []
  const linkMark = marks.find(
    (mark: any) =>
      mark?.type?.name === 'link' &&
      (typeof mark?.attrs?.linkUrl === 'string' || typeof mark?.attrs?.href === 'string'),
  )
  const href = String(linkMark?.attrs?.linkUrl ?? linkMark?.attrs?.href ?? '').trim()
  return href && getMediaKindFromUrl(href) ? href : null
}

function isMediaOnlyParagraphNode(node: any): boolean {
  if (node?.type?.name !== 'paragraph') return false
  const childCount = Number(node?.childCount ?? 0)
  if (childCount <= 0 || typeof node?.child !== 'function') return false

  let hasMediaLink = false
  for (let index = 0; index < childCount; index += 1) {
    const child = node.child(index)
    if ((child?.isText || child?.type?.name === 'text') && isBlankSentinelText(child.text ?? child.textContent ?? '')) {
      continue
    }
    if (getTextNodeMediaLinkHref(child)) {
      hasMediaLink = true
      continue
    }
    return false
  }

  return hasMediaLink
}

export function getTerminalBlockLandingTarget(doc: any): TerminalBlockLandingTarget | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (childCount <= 0 || typeof doc?.child !== 'function') return null

  const lastNode = doc.child(childCount - 1)
  if (lastNode?.type?.name === 'codeBlock') {
    return { kind: 'codeBlock', position: getDocEnd(doc) }
  }

  if (lastNode?.type?.name === 'table') {
    return { kind: 'table', position: getDocEnd(doc) }
  }

  if (lastNode?.type?.name === 'paragraph' && isNotePreviewOnlyParagraphText(lastNode.textContent ?? '')) {
    return { kind: 'notePreview', position: getDocEnd(doc) }
  }

  if (isImageOnlyParagraphNode(lastNode)) {
    return { kind: 'image', position: getDocEnd(doc) }
  }

  if (isMediaOnlyParagraphNode(lastNode)) {
    return { kind: 'media', position: getDocEnd(doc) }
  }

  return null
}

export function isInsideTerminalBlockLandingZone(target: Element | null): boolean {
  return Boolean(target?.closest(`[${TERMINAL_BLOCK_LANDING_ZONE_ATTR}]`))
}

function normalizeInsertedTextLines(text: string): string[] {
  if (text.length === 0) return ['']
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function createTerminalLandingParagraphNodes(schema: any, text: string) {
  const paragraphType = schema.nodes.paragraph
  return normalizeInsertedTextLines(text).map((line) =>
    paragraphType.create(null, line.length > 0 ? schema.text(line) : undefined),
  )
}

function getLastTopLevelNodeContext(doc: any): { node: any; start: number; end: number } | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (childCount <= 0 || typeof doc?.child !== 'function') return null
  const node = doc.child(childCount - 1)
  const end = getDocEnd(doc)
  return { node, start: end - (node?.nodeSize ?? 0), end }
}

function getTopLevelNodeContextAtPosition(doc: any, position: number): TerminalBlockContext | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (childCount <= 0 || typeof doc?.child !== 'function') return null

  let start = 0
  for (let index = 0; index < childCount; index += 1) {
    const node = doc.child(index)
    const end = start + (node?.nodeSize ?? 0)
    if (position >= start && position <= end) return { node, start, end, index }
    start = end
  }
  return null
}

function getTopLevelNodeContextForSelection(doc: any, position: number): TerminalBlockContext | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (childCount <= 0 || typeof doc?.child !== 'function') return null

  let start = 0
  let containing: TerminalBlockContext | null = null
  for (let index = 0; index < childCount; index += 1) {
    const node = doc.child(index)
    const end = start + (node?.nodeSize ?? 0)
    if (position === start) return { node, start, end, index }
    if (!containing && position > start && position <= end) {
      containing = { node, start, end, index }
    }
    start = end
  }
  return containing
}

function getTopLevelNodeContextByIndex(doc: any, index: number): TerminalBlockContext | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (index < 0 || index >= childCount || typeof doc?.child !== 'function') return null

  let start = 0
  for (let current = 0; current < index; current += 1) {
    start += doc.child(current)?.nodeSize ?? 0
  }
  const node = doc.child(index)
  return { node, start, end: start + (node?.nodeSize ?? 0), index }
}

function isTerminalBlockContext(context: TerminalBlockContext | null): context is TerminalBlockContext {
  if (!context) return false
  const typeName = context.node?.type?.name
  return (
    typeName === 'codeBlock' ||
    typeName === 'table' ||
    (typeName === 'paragraph' &&
      (isNotePreviewOnlyParagraphText(context.node.textContent ?? '') ||
        isImageOnlyParagraphNode(context.node) ||
        isMediaOnlyParagraphNode(context.node)))
  )
}

function isDeletableTerminalBlockContext(context: TerminalBlockContext | null): boolean {
  if (!context) return false
  const typeName = context.node?.type?.name
  return (
    typeName === 'codeBlock' ||
    typeName === 'table' ||
    (typeName === 'paragraph' &&
      (isNotePreviewOnlyParagraphText(context.node.textContent ?? '') || isMediaOnlyParagraphNode(context.node)))
  )
}

function isEmptyTextBlockNode(node: any): boolean {
  return Boolean(node?.isTextblock) && isBlankSentinelText(node.textContent ?? '')
}

function isEditableSiblingTextBlock(context: TerminalBlockContext): boolean {
  return Boolean(context.node?.isTextblock) && !isTerminalBlockContext(context)
}

function getCollapsedSelectionTextBlockContext(state: any): (TerminalBlockContext & { parentOffset: number }) | null {
  const selection = state?.selection
  if (!selection?.empty) return null
  const $from = selection.$from
  if (!$from || typeof $from.depth !== 'number' || $from.depth <= 0) return null

  const blockDepth = $from.depth
  const currentNode = $from.parent
  if (!currentNode?.isTextblock || currentNode.type?.name !== 'paragraph') return null

  const parentDepth = blockDepth - 1
  if ($from.node(parentDepth) !== state.doc) return null

  return {
    node: currentNode,
    start: $from.before(blockDepth),
    end: $from.after(blockDepth),
    index: $from.index(parentDepth),
    parentOffset: $from.parentOffset,
  }
}

function getAdjacentDeletableTerminalBeforeContext(doc: any, context: TerminalBlockContext): TerminalBlockContext | null {
  const candidate = getTopLevelNodeContextByIndex(doc, context.index - 1)
  return isDeletableTerminalBlockContext(candidate) ? candidate : null
}

export function deleteTerminalBlockBeforeCaret(
  state: any,
  direction: TerminalBlockDeleteDirection,
  dispatch?: (tr: unknown) => void,
): boolean {
  const context = getCollapsedSelectionTextBlockContext(state)
  if (!context || !state?.tr) return false

  const currentIsEmpty = isEmptyTextBlockNode(context.node)
  const contentSize = typeof context.node?.content?.size === 'number' ? context.node.content.size : 0
  const atStart = context.parentOffset === 0
  const atEnd = context.parentOffset === contentSize
  if (direction === 'backward' ? !atStart && !currentIsEmpty : !currentIsEmpty || (!atStart && !atEnd)) return false

  const terminal = getAdjacentDeletableTerminalBeforeContext(state.doc, context)
  if (!terminal) return false
  if (!dispatch) return true

  let tr = state.tr.delete(terminal.start, terminal.end)
  const deletedSize = terminal.end - terminal.start
  const caretPos = Math.max(0, Math.min(tr.doc.content.size, context.start - deletedSize + 1 + context.parentOffset))
  tr = tr.setSelection(TextSelection.create(tr.doc, caretPos, caretPos)).scrollIntoView()
  dispatch(tr)
  return true
}

export function placeCaretInFinalEmptyTextBlock(
  view: any,
  TextSelection: TextSelectionFactory,
): boolean {
  const { state } = view ?? {}
  const context = getLastTopLevelNodeContext(state?.doc)
  if (!context || !isEmptyTextBlockNode(context.node)) return false

  const selectionPos = context.start + 1 + (context.node.content?.size ?? 0)
  let tr = state.tr.setSelection(TextSelection.create(state.doc, selectionPos, selectionPos)).scrollIntoView()
  tr = tr.setMeta?.('addToHistory', false) ?? tr
  view.dispatch(tr)
  view.focus?.()
  return true
}

function getTextBlockSelectionPosition(node: any, start: number, side: TerminalBlockBoundarySide): number {
  const contentSize = typeof node?.content?.size === 'number' ? node.content.size : 0
  return start + 1 + (side === 'before' ? contentSize : 0)
}

export function placeCaretBesideTerminalBlock(
  view: any,
  TextSelection: TextSelectionFactory,
  context: TerminalBlockContext,
  side: TerminalBlockBoundarySide,
): boolean {
  const { state } = view ?? {}
  const paragraphType = state?.schema?.nodes?.paragraph
  if (!state?.tr || !paragraphType || !isTerminalBlockContext(context)) return false

  const siblingIndex = side === 'before' ? context.index - 1 : context.index + 1
  const sibling = getTopLevelNodeContextByIndex(state.doc, siblingIndex)
  if (sibling && isEditableSiblingTextBlock(sibling)) {
    const selectionPos = getTextBlockSelectionPosition(sibling.node, sibling.start, side)
    let tr = state.tr.setSelection(TextSelection.create(state.doc, selectionPos, selectionPos)).scrollIntoView()
    tr = tr.setMeta?.('addToHistory', false) ?? tr
    view.dispatch(tr)
    view.focus?.()
    return true
  }

  const insertPos = side === 'before' ? context.start : context.end
  let tr = state.tr.insert(insertPos, paragraphType.create())
  tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1, insertPos + 1)).scrollIntoView()
  view.dispatch(tr)
  view.focus?.()
  return true
}

function getSelectedTopLevelNodeContext(state: any): TerminalBlockContext | null {
  const selection = state?.selection
  const selectedNode = selection?.node
  if (!selectedNode || typeof selection.from !== 'number' || typeof selection.to !== 'number') return null
  const index = typeof selection.$from?.index === 'function' ? selection.$from.index() : 0
  return {
    node: selectedNode,
    start: selection.from,
    end: selection.to,
    index,
  }
}

function getTextBlockSelectionOffset(context: TerminalBlockContext, selection: any): number | null {
  const position = typeof selection?.head === 'number'
    ? selection.head
    : typeof selection?.from === 'number'
      ? selection.from
      : null
  if (position === null) return null
  return position - context.start - 1
}

function isCodeBlockArrowAtBoundary(
  view: any,
  direction: TerminalBlockArrowDirection,
  context: TerminalBlockContext,
  selection: any,
): boolean {
  if (typeof view?.endOfTextblock === 'function') {
    try {
      if (!view.endOfTextblock(direction)) return false
      return true
    } catch {
      // Fall back to logical start/end below.
    }
  }

  const offset = getTextBlockSelectionOffset(context, selection)
  if (offset === null) return false
  const contentSize = typeof context.node?.content?.size === 'number' ? context.node.content.size : 0
  return direction === 'up' ? offset <= 0 : offset >= contentSize
}

function isTextTerminalArrowAtBoundary(
  direction: TerminalBlockArrowDirection,
  context: TerminalBlockContext,
  selection: any,
): boolean {
  const offset = getTextBlockSelectionOffset(context, selection)
  if (offset === null) return false
  const contentSize = typeof context.node?.content?.size === 'number' ? context.node.content.size : 0
  if (isImageOnlyParagraphNode(context.node)) {
    return offset >= 0 && offset <= contentSize
  }
  return direction === 'up' ? offset <= 0 : offset >= contentSize
}

function getTerminalArrowBoundary(
  view: any,
  direction: TerminalBlockArrowDirection,
): { context: TerminalBlockContext; side: TerminalBlockBoundarySide } | null {
  const state = view?.state
  const selection = state?.selection
  if (!state?.doc || !selection) return null

  const side: TerminalBlockBoundarySide = direction === 'up' ? 'before' : 'after'
  const selectedContext = getSelectedTopLevelNodeContext(state)
  if (selectedContext && isTerminalBlockContext(selectedContext)) {
    return { context: selectedContext, side }
  }

  if (!selection.empty) return null
  const position = typeof selection.head === 'number' ? selection.head : selection.from
  if (typeof position !== 'number') return null
  const context = getTopLevelNodeContextForSelection(state.doc, position)
  if (!isTerminalBlockContext(context)) return null

  const typeName = context.node?.type?.name
  const atBoundary = typeName === 'codeBlock'
    ? isCodeBlockArrowAtBoundary(view, direction, context, selection)
    : isTextTerminalArrowAtBoundary(direction, context, selection)
  return atBoundary ? { context, side } : null
}

export function moveTerminalBlockBoundaryCaretByArrow(
  view: any,
  direction: TerminalBlockArrowDirection,
  TextSelection: TextSelectionFactory,
): boolean {
  const boundary = getTerminalArrowBoundary(view, direction)
  if (!boundary) return false
  return placeCaretBesideTerminalBlock(view, TextSelection, boundary.context, boundary.side)
}

export function insertTerminalLandingParagraphs(
  view: any,
  TextSelection: TextSelectionFactory,
  text = '',
): boolean {
  const { state } = view
  const target = getTerminalBlockLandingTarget(state.doc)
  const insertPos = target?.position ?? getDocEnd(state.doc)
  const paragraphNodes = createTerminalLandingParagraphNodes(state.schema, text)
  if (paragraphNodes.length === 0) return false

  let lastParagraphStart = insertPos
  for (let index = 0; index < paragraphNodes.length - 1; index += 1) {
    lastParagraphStart += paragraphNodes[index].nodeSize
  }
  const lastParagraph = paragraphNodes[paragraphNodes.length - 1]
  const selectionPos = lastParagraphStart + 1 + (lastParagraph.content?.size ?? 0)

  let tr = state.tr.insert(insertPos, paragraphNodes)
  tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos, selectionPos)).scrollIntoView()
  view.dispatch(tr)
  view.focus?.()
  return true
}

function shouldHandlePrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
}

function getMouseButton(event: Event): number {
  return typeof (event as MouseEvent).button === 'number' ? (event as MouseEvent).button : 0
}

function getMouseClientPoint(event: Event): { left: number; top: number } | null {
  const left = (event as MouseEvent).clientX
  const top = (event as MouseEvent).clientY
  return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null
}

export function handleTerminalLandingZoneClick(
  event: Event,
  view: any,
  TextSelection: TextSelectionFactory,
): boolean {
  if (getMouseButton(event) !== 0) return false
  event.preventDefault()
  event.stopPropagation()
  return insertTerminalLandingParagraphs(view, TextSelection)
}

function isEditorBlankSurfaceTarget(target: Element | null, view: any): boolean {
  return Boolean(target && view?.dom && target === view.dom)
}

function getTerminalBlockElementCandidates(view: any): Element[] {
  if (typeof view?.dom?.querySelectorAll !== 'function') return []
  return (Array.from(
    view.dom.querySelectorAll(
      [
        '.note-context-widget',
        '.toastui-editor-ww-code-block',
        MEDIA_PLAYER_SELECTOR,
        'table',
        'pre',
        'img',
      ].join(', '),
    ),
  ) as Element[]).filter((element): element is Element => {
    if (!element || typeof (element as Element).closest !== 'function') return false
    if (typeof Element !== 'undefined' && !(element instanceof Element)) return false
    if (element.closest('.context-preview-editor-host')) return false
    if (typeof element.matches === 'function' && element.matches('pre') && element.closest('.toastui-editor-ww-code-block')) return false
    if (typeof element.matches === 'function' && element.matches('img') && !element.closest('p')) return false
    return true
  })
}

function getCandidatePositionsForElement(view: any, element: Element, event: Event): number[] {
  const positions: number[] = []
  const pushPosition = (position: unknown) => {
    if (typeof position === 'number' && Number.isFinite(position)) positions.push(position)
  }

  if (typeof view?.posAtDOM === 'function') {
    try {
      pushPosition(view.posAtDOM(element, 0))
    } catch {
      // Some Toast UI wrapper elements are decorations, not direct ProseMirror DOM nodes.
    }
    try {
      pushPosition(view.posAtDOM(element, element.childNodes?.length ?? 0))
    } catch {
      // Some Toast UI wrapper elements are decorations, not direct ProseMirror DOM nodes.
    }
  }

  const point = getMouseClientPoint(event)
  if (typeof view?.posAtCoords === 'function' && point) {
    const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
    const left = rect ? Math.max(rect.left + 1, Math.min(rect.right - 1, point.left)) : point.left
    const top = rect ? Math.max(rect.top + 1, Math.min(rect.bottom - 1, point.top)) : point.top
    try {
      pushPosition(view.posAtCoords({ left, top })?.pos)
    } catch {
      // Coordinate lookup can fail for hidden decoration wrappers.
    }
  }

  return [...new Set(positions)]
}

function getTerminalBlockContextForElement(view: any, element: Element, event: Event): TerminalBlockContext | null {
  const doc = view?.state?.doc
  for (const position of getCandidatePositionsForElement(view, element, event)) {
    const context = getTopLevelNodeContextAtPosition(doc, position)
    if (isTerminalBlockContext(context)) return context
  }
  return null
}

function getNearestTerminalBoundaryClick(
  event: Event,
  view: any,
): { context: TerminalBlockContext; side: TerminalBlockBoundarySide } | null {
  const point = getMouseClientPoint(event)
  if (!point) return null
  const candidates = getTerminalBlockElementCandidates(view)
    .map((element) => {
      const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (!rect) return null
      const side = point.top < rect.top ? 'before' : point.top > rect.bottom ? 'after' : null
      if (!side) return null
      const distance = side === 'before' ? rect.top - point.top : point.top - rect.bottom
      if (distance > TERMINAL_BLOCK_BOUNDARY_CLICK_MAX_DISTANCE_PX) return null
      const context = getTerminalBlockContextForElement(view, element, event)
      return context ? { context, side, distance } : null
    })
    .filter((candidate): candidate is { context: TerminalBlockContext; side: TerminalBlockBoundarySide; distance: number } =>
      Boolean(candidate),
    )
    .sort((left, right) => left.distance - right.distance)

  return candidates[0] ? { context: candidates[0].context, side: candidates[0].side } : null
}

function isClickBelowLastRenderedChild(event: Event, view: any): boolean {
  const lastChild = view?.dom?.lastElementChild
  if (!lastChild || typeof lastChild.getBoundingClientRect !== 'function') return true
  const clientY = (event as MouseEvent).clientY
  if (!Number.isFinite(clientY)) return false
  return clientY >= lastChild.getBoundingClientRect().bottom
}

export function handleTerminalBlankAreaClick(
  event: Event,
  target: Element | null,
  view: any,
  TextSelection: TextSelectionFactory,
): boolean {
  if (getMouseButton(event) !== 0) return false
  if (!isEditorBlankSurfaceTarget(target, view)) return false

  const boundary = getNearestTerminalBoundaryClick(event, view)
  const handled = boundary
    ? placeCaretBesideTerminalBlock(view, TextSelection, boundary.context, boundary.side)
    : isClickBelowLastRenderedChild(event, view)
      ? getTerminalBlockLandingTarget(view?.state?.doc)
        ? insertTerminalLandingParagraphs(view, TextSelection)
        : placeCaretInFinalEmptyTextBlock(view, TextSelection)
      : false
  if (!handled) return false

  event.preventDefault()
  event.stopPropagation()
  return true
}

function createLandingZoneElement(
  view: any,
  TextSelection: TextSelectionFactory,
) {
  const element = document.createElement('span')
  element.className = TERMINAL_BLOCK_LANDING_ZONE_CLASS
  element.tabIndex = 0
  element.setAttribute(TERMINAL_BLOCK_LANDING_ZONE_ATTR, 'true')
  element.setAttribute('contenteditable', 'false')
  element.setAttribute('role', 'textbox')
  element.setAttribute('aria-label', 'Add text after this block')

  let handledPointerDown = false

  const stop = (event: Event) => {
    event.stopPropagation()
  }

  element.addEventListener('pointerdown', (event) => {
    handledPointerDown = handleTerminalLandingZoneClick(event, view, TextSelection)
    if (!handledPointerDown) stop(event)
  })
  element.addEventListener('mousedown', stop)
  element.addEventListener('click', (event) => {
    if (handledPointerDown) {
      handledPointerDown = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!handleTerminalLandingZoneClick(event, view, TextSelection)) {
      event.stopPropagation()
      element.focus()
    }
  })
  element.addEventListener('focus', () => {
    element.classList.add('is-active')
  })
  element.addEventListener('blur', () => {
    element.classList.remove('is-active')
  })
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      element.blur()
      return
    }

    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      insertTerminalLandingParagraphs(view, TextSelection)
      return
    }

    if (!shouldHandlePrintableKey(event)) return
    event.preventDefault()
    event.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, event.key)
  })
  element.addEventListener('beforeinput', (event) => {
    const inputEvent = event as InputEvent
    if (inputEvent.isComposing) return
    if (inputEvent.inputType !== 'insertText' && inputEvent.inputType !== 'insertCompositionText') return
    const text = inputEvent.data ?? ''
    if (!text) return
    inputEvent.preventDefault()
    inputEvent.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, text)
  })
  element.addEventListener('paste', (event) => {
    const pasteEvent = event as ClipboardEvent
    const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
    if (text.length === 0) return
    pasteEvent.preventDefault()
    pasteEvent.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, text)
  })

  return element
}

export function terminalBlockLandingPlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        decorations?: (state: { doc: any }) => unknown
      }
    }) => unknown
    TextSelection: { create: (doc: unknown, anchor: number, head?: number) => unknown }
  }
  pmView: {
    Decoration: {
      widget: (
        pos: number,
        toDOM: (view: unknown) => HTMLElement,
        spec?: Record<string, unknown>,
      ) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin, TextSelection } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (state: { doc: any }) => {
              const target = getTerminalBlockLandingTarget(state.doc)
              if (!target) return DecorationSet.create(state.doc, [])
              return DecorationSet.create(state.doc, [
                Decoration.widget(
                  target.position,
                  (view) => createLandingZoneElement(view, TextSelection),
                  {
                    key: `terminal-block-landing-${target.kind}-${target.position}`,
                    side: 1,
                    ignoreSelection: true,
                    stopEvent: (event: Event) =>
                      event.type === 'keydown' ||
                      event.type === 'beforeinput' ||
                      event.type === 'paste' ||
                      event.type === 'click' ||
                      event.type === 'mousedown' ||
                      event.type === 'pointerdown',
                  },
                ),
              ])
            },
          },
        }),
    ],
  }
}
