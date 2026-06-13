import type { Editor } from '@toast-ui/editor'
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createRangeSelection,
  $createRangeSelectionFromDom,
  $createTextNode,
  $getNodeByKey,
  $getState,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setState,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  createState,
  createEditor,
  mergeRegister,
  type BaseSelection,
  type EditorConfig,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  TextNode,
} from 'lexical'
import { registerHistory, createEmptyHistoryState } from '@lexical/history'
import { $createCodeNode, CodeNode } from '@lexical/code-core'
import {
  $createLinkNode,
  $isLinkNode,
  $toggleLink,
  LinkNode,
} from '@lexical/link'
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  $insertList,
  type ListType,
  ListItemNode,
  ListNode,
  registerList,
} from '@lexical/list'
import {
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  registerRichText,
} from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  INSERT_TABLE_COMMAND,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
  registerTablePlugin,
} from '@lexical/table'
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@lexical/react/LexicalHorizontalRuleNode.js'
import {
  $convertFromMarkdownString,
  $convertSelectionToMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
  TRANSFORMERS,
  type ElementTransformer,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from '@lexical/markdown'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import type { NotePreviewWidgetOptions } from './note-preview-widget'
import { CODE_BLOCK_CONTROLS_ATTR } from './code-block-controls'
import { getAnnotationInlineArrowClassNames, getAnnotationLineClassNames, parseAnnotationLine, parseAnnotationLineMarkers } from './annotation-line'
import type { NoteMentionQuery } from './prosemirror-utils'
import type { ToastTone } from '../types/app'

export const LEXICAL_MARKDOWN_EXPORT_DEBOUNCE_MS = 450

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function countMarkdownLinks(markdown: string): number {
  return String(markdown ?? '').match(/\[[^\]\n]+\]\((?:https?:\/\/|#tabs-note\/)[^)]+\)/gi)?.length ?? 0
}

function recordLexicalMarkdownExportDiagnostic({
  reason,
  durationMs,
  markdown,
}: {
  reason: string
  durationMs: number
  markdown: string
}) {
  if (!import.meta.env?.DEV) return
  const linkCount = countMarkdownLinks(markdown)
  if (durationMs < 16 && linkCount < 8) return
  recordDiagnosticEvent('editor', 'lexical-markdown-export', {
    level: durationMs >= 50 ? 'warning' : 'info',
    durationMs,
    details: {
      reason,
      linkCount,
      markdownLength: markdown.length,
    },
  })
}

type LexicalMarkdownEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onFocus: () => void
  onReady?: (durationMs: number) => void
  editable?: boolean
  notePreviewOptions?: NotePreviewWidgetOptions
  pushToast?: (message: string, tone?: ToastTone, durationMs?: number) => void
}

type CommandPayload = Record<string, unknown> | undefined

type LexicalCursorPoint = {
  key: string
  offset: number
}

type LexicalTextSpan = {
  node: TextNode
  key: string
  start: number
  end: number
}

type LexicalMarkdownChangeDecision = {
  dirtyElementCount: number
  dirtyLeafCount: number
  nextMarkdown: string
  lastNotifiedMarkdown: string
}

export type LexicalMarkdownEditorHandle = {
  __tabsEditorCore: 'lexical'
  focus: () => void
  focusAtClientPoint: (point: { clientX: number; clientY: number }) => boolean
  destroy: () => void
  getCursorSelection: () => { anchor: number; head: number }
  getDocSize: () => number
  getMarkdown: () => string
  getCachedMarkdown: () => string
  flushPendingMarkdown: (options?: { notify?: boolean }) => string
  hasPendingMarkdownChanges: () => boolean
  restoreCursorSelection: (selection: { anchor: number; head: number }, options?: { focus?: boolean }) => boolean
  runHistory: (direction: 'undo' | 'redo') => boolean
  getNoteMentionQuery: () => NoteMentionQuery | null
  getSelectionClientRect: () => { top: number; bottom: number; left: number } | null
  replaceTextRange: (from: number, to: number, text: string) => boolean
  replaceTextRangeWithLink: (from: number, to: number, label: string, url: string) => boolean
  setEditable: (editable: boolean) => void
  isEditable: () => boolean
  setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  exec: (command: string, payload?: CommandPayload) => void
  getSelectedText: () => string
}

const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const TABLE_DELIMITER_CELL_RE = /^:?-{3,}:?$/
const THEMATIC_BREAK_MARKER_RE = /^(---|\*\*\*|___)$/
const NOTE_PREVIEW_TOKEN_RE = /^!\[((?:\\.|[^\]\\])*)\]\(((?:<<[^>\n]*(?:#tabs-note\/|--[0-9a-f]{6})[^>\n]*>>)|(?:<[^>\n]*(?:#tabs-note\/|--[0-9a-f]{6})[^>\n]*>)|(?:[^)\n]*(?:#tabs-note\/|--[0-9a-f]{6})[^)\n]*))\)$/i
const RAW_SPARK_PREVIEW_TOKEN_RE = /^!\[([^\]\n]*)\]\(<(spark[^>\n]+)>\)$/
const ESCAPED_THEMATIC_BREAK_LINE_RE = /^(\s*(?:>\s*)?)\\\*\\\*\\\*\s*$/
const MALFORMED_TABLE_TAIL_RE = /^\s*\\?\|\s*$/
const APP_LIST_MARKER_RE = /^[-*+]$/
const TASK_SHORTCUT_PREFIX_RE = /^\[(\s|x)\]\s/i

export function isLexicalMarkdownEditor(editor: Editor | null): editor is Editor & LexicalMarkdownEditorHandle {
  return Boolean((editor as unknown as LexicalMarkdownEditorHandle | null)?.__tabsEditorCore === 'lexical')
}

const horizontalRuleMarkerState = createState('tabsHrMarker', {
  parse: (value) => (typeof value === 'string' && THEMATIC_BREAK_MARKER_RE.test(value) ? value : '---'),
  resetOnCopyNode: true,
})

const appListMarkerState = createState('tabsListMarker', {
  parse: (value) => (typeof value === 'string' && APP_LIST_MARKER_RE.test(value) ? value : '-'),
  resetOnCopyNode: true,
})

const appListItemMarkerState = createState('tabsListItemMarker', {
  parse: (value) => (typeof value === 'string' && APP_LIST_MARKER_RE.test(value) ? value : ''),
  resetOnCopyNode: true,
})

type AnnotationArrowRaw = '^--' | '--^' | 'v--' | '--v' | '-->' | '<--'

const ANNOTATION_ARROW_MARKER_RE = /\^--|--\^|v--|--v|-->|<--/

type SerializedLexicalAnnotationArrowNode = SerializedLexicalNode & {
  raw: AnnotationArrowRaw
}

export class LexicalAnnotationArrowNode extends DecoratorNode<null> {
  __raw: AnnotationArrowRaw

  static getType(): string {
    return 'tabs-annotation-arrow'
  }

  static clone(node: LexicalAnnotationArrowNode): LexicalAnnotationArrowNode {
    return new LexicalAnnotationArrowNode(node.__raw, node.__key)
  }

  static importJSON(serializedNode: SerializedLexicalAnnotationArrowNode): LexicalAnnotationArrowNode {
    return $createLexicalAnnotationArrowNode(serializedNode.raw)
  }

  constructor(raw: AnnotationArrowRaw, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span')
    this.decorateArrowElement(element)
    return element
  }

  updateDOM(prevNode: LexicalAnnotationArrowNode, dom: HTMLElement): boolean {
    if (prevNode.__raw !== this.__raw) this.decorateArrowElement(dom)
    return false
  }

  exportJSON(): SerializedLexicalAnnotationArrowNode {
    return {
      ...super.exportJSON(),
      type: 'tabs-annotation-arrow',
      version: 1,
      raw: this.__raw,
    }
  }

  getTextContent(): string {
    return this.__raw
  }

  isInline(): true {
    return true
  }

  isKeyboardSelectable(): boolean {
    return false
  }

  getRaw(): AnnotationArrowRaw {
    return this.__raw
  }

  decorate(): null {
    return null
  }

  private decorateArrowElement(element: HTMLElement): void {
    const match = parseAnnotationLine(this.__raw)
    const classNames = match ? getAnnotationInlineArrowClassNames(match) : []
    element.className = ['tabs-annotation-line-marker', ...classNames].join(' ')
    element.contentEditable = 'false'
    element.setAttribute('data-tabs-annotation-arrow', this.__raw)
    element.setAttribute('aria-label', this.__raw)
  }
}

function $createLexicalAnnotationArrowNode(raw: string): LexicalAnnotationArrowNode {
  const normalized = ANNOTATION_ARROW_MARKER_RE.test(raw) ? raw as AnnotationArrowRaw : '-->'
  return $applyNodeReplacement(new LexicalAnnotationArrowNode(normalized))
}

function $isLexicalAnnotationArrowNode(node: LexicalNode | null | undefined): node is LexicalAnnotationArrowNode {
  return node instanceof LexicalAnnotationArrowNode
}

type SerializedLexicalNotePreviewNode = SerializedLexicalNode & {
  token: string
  label: string
  target: string
}

export class LexicalNotePreviewNode extends DecoratorNode<null> {
  __token: string
  __label: string
  __target: string

  static getType(): string {
    return 'tabs-note-preview'
  }

  static clone(node: LexicalNotePreviewNode): LexicalNotePreviewNode {
    return new LexicalNotePreviewNode(node.__token, node.__label, node.__target, node.__key)
  }

  static importJSON(serializedNode: SerializedLexicalNotePreviewNode): LexicalNotePreviewNode {
    return $createLexicalNotePreviewNode(serializedNode.token, serializedNode.label, serializedNode.target)
  }

  constructor(token: string, label: string, target: string, key?: NodeKey) {
    super(key)
    this.__token = token
    this.__label = label
    this.__target = target
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    this.decoratePreviewElement(element)
    return element
  }

  updateDOM(prevNode: LexicalNotePreviewNode, dom: HTMLElement): boolean {
    if (prevNode.__token !== this.__token || prevNode.__label !== this.__label || prevNode.__target !== this.__target) {
      this.decoratePreviewElement(dom)
    }
    return false
  }

  exportJSON(): SerializedLexicalNotePreviewNode {
    return {
      ...super.exportJSON(),
      type: 'tabs-note-preview',
      version: 1,
      token: this.__token,
      label: this.__label,
      target: this.__target,
    }
  }

  getTextContent(): string {
    return this.__token
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): boolean {
    return false
  }

  isIsolated(): true {
    return true
  }

  getToken(): string {
    return this.__token
  }

  getLabel(): string {
    return this.__label
  }

  decorate(): null {
    return null
  }

  private decoratePreviewElement(element: HTMLElement): void {
    element.className = 'tabs-lexical-note-preview context-preview-editor-host'
    element.contentEditable = 'false'
    element.tabIndex = -1
    element.setAttribute('data-tabs-note-preview-token', this.__token)
    element.setAttribute('data-tabs-note-preview-target', this.__target)
    element.textContent = ''

    const title = document.createElement('span')
    title.className = 'tabs-lexical-note-preview-title'
    title.textContent = this.__label || this.__target

    const meta = document.createElement('span')
    meta.className = 'tabs-lexical-note-preview-meta'
    meta.textContent = 'Preview loading'

    element.append(title, meta)
  }
}

function $createLexicalNotePreviewNode(token: string, label: string, target: string): LexicalNotePreviewNode {
  return $applyNodeReplacement(new LexicalNotePreviewNode(token, label, target))
}

function $isLexicalNotePreviewNode(node: LexicalNode | null | undefined): node is LexicalNotePreviewNode {
  return node instanceof LexicalNotePreviewNode
}

function normalizeRawPreviewToken(line: string): string {
  const match = line.match(RAW_SPARK_PREVIEW_TOKEN_RE)
  if (!match) return line
  const label = match[1] ?? ''
  const target = match[2] ?? ''
  return `![${label}](<${target.replace(/>/g, '\\>')}>)`
}

function getPreviewTargetFromDestination(destination: string): string {
  let target = String(destination ?? '').trim()
  for (let unwrapCount = 0; unwrapCount < 3; unwrapCount += 1) {
    if (!target.startsWith('<') || !target.endsWith('>')) break
    target = target.slice(1, -1).replace(/\\>/g, '>').trim()
  }
  return target
}

function formatCanonicalPreviewDestination(destination: string): string {
  const target = getPreviewTargetFromDestination(destination)
  return target ? `<${target.replace(/>/g, '\\>')}>` : ''
}

function normalizePreviewTokenSyntax(line: string): string {
  const match = line.match(NOTE_PREVIEW_TOKEN_RE)
  if (!match) return line
  const label = match[1] ?? ''
  const destination = formatCanonicalPreviewDestination(match[2] ?? '')
  return destination ? `![${label}](${destination})` : line
}

export function repairLexicalMarkdownForImport(markdown: string): string {
  return String(markdown ?? '')
    .split(/\r?\n/)
    .filter((line) => !MALFORMED_TABLE_TAIL_RE.test(line.trim()))
    .map((line) => {
      if (/^(\s*)>\s*$/.test(line)) return line.replace(/^(\s*)>\s*$/, '$1> ')
      const previewToken = normalizePreviewTokenSyntax(normalizeRawPreviewToken(line))
      if (previewToken !== line) return previewToken
      if (ESCAPED_THEMATIC_BREAK_LINE_RE.test(line)) return line.replace(ESCAPED_THEMATIC_BREAK_LINE_RE, '$1---')
      if (/^(\s*)\* (dash\b.*)$/.test(line)) return line.replace(/^(\s*)\* (dash\b.*)$/, '$1- $2')
      return line
    })
    .join('\n')
}

function repairLexicalMarkdownForExport(markdown: string): string {
  return repairLexicalMarkdownForImport(markdown)
}

export function shouldNotifyLexicalMarkdownChange({
  dirtyElementCount,
  dirtyLeafCount,
  nextMarkdown,
  lastNotifiedMarkdown,
}: LexicalMarkdownChangeDecision): boolean {
  if (dirtyElementCount <= 0 && dirtyLeafCount <= 0) return false
  return nextMarkdown !== lastNotifiedMarkdown
}

function clampLexicalPosition(value: number, docSize: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.max(0, docSize), Math.floor(value)))
}

function splitGfmTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.startsWith('|') && trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const char of inner) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function isGfmTableDelimiter(line: string, expectedColumnCount: number): boolean {
  const cells = splitGfmTableRow(line)
  return (
    cells.length === expectedColumnCount &&
    cells.length > 0 &&
    cells.every((cell) => TABLE_DELIMITER_CELL_RE.test(cell.replace(/\s+/g, '')))
  )
}

function isGfmTableRow(line: string, expectedColumnCount: number): boolean {
  return TABLE_ROW_RE.test(line) && splitGfmTableRow(line).length === expectedColumnCount
}

function appendInlineMarkdownNodes(parent: ElementNode, markdown: string): void {
  let cursor = 0
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const start = match.index ?? 0
    const fullMatch = match[0] ?? ''
    if (start > cursor) {
      parent.append($createTextNode(markdown.slice(cursor, start)))
    }
    const isImage = match[1] === '!'
    const label = match[2] ?? ''
    const url = match[3] ?? ''
    if (isImage) {
      parent.append($createTextNode(fullMatch))
    } else {
      const link = $createLinkNode(url)
      link.append($createTextNode(label || url))
      parent.append(link)
    }
    cursor = start + fullMatch.length
  }
  if (cursor < markdown.length) {
    parent.append($createTextNode(markdown.slice(cursor)))
  }
}

function createTableCell(markdown: string, headerState: number): TableCellNode {
  const cell = $createTableCellNode(headerState)
  const paragraph = $createParagraphNode()
  appendInlineMarkdownNodes(paragraph, markdown)
  cell.append(paragraph)
  return cell
}

function createAppHorizontalRuleNode(marker = '---'): HorizontalRuleNode {
  const hr = $createHorizontalRuleNode()
  $setState(hr, horizontalRuleMarkerState, THEMATIC_BREAK_MARKER_RE.test(marker) ? marker : '---')
  return hr
}

function createTableNodeFromGfmRows(rows: string[][]): TableNode {
  const table = $createTableNode()
  rows.forEach((row) => {
    const tableRow = $createTableRowNode()
    for (const cell of row) {
      tableRow.append(createTableCell(cell, TableCellHeaderStates.NO_STATUS))
    }
    table.append(tableRow)
  })
  return table
}

function escapeTableCellMarkdown(markdown: string): string {
  return markdown
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim()
}

function serializeTextNode(node: TextNode): string {
  let text = node.getTextContent()
  if (!text) return ''
  if (node.hasFormat('code')) text = `\`${text}\``
  if (node.hasFormat('bold')) text = `**${text}**`
  if (node.hasFormat('italic')) text = `*${text}*`
  if (node.hasFormat('strikethrough')) text = `~~${text}~~`
  if (node.hasFormat('highlight')) text = `==${text}==`
  return text
}

function serializeInlineNode(node: LexicalNode): string {
  if ($isTextNode(node)) return serializeTextNode(node)
  if ($isLexicalAnnotationArrowNode(node)) return node.getRaw()
  if ($isLinkNode(node)) {
    return `[${serializeElementChildren(node)}](${node.getURL()})`
  }
  if ($isElementNode(node)) return serializeElementChildren(node)
  return node.getTextContent()
}

function serializeElementChildren(node: ElementNode): string {
  return node.getChildren().map((child) => serializeInlineNode(child)).join('')
}

function serializeTableCell(cell: ElementNode): string {
  const markdown = cell
    .getChildren()
    .map((child) => ($isElementNode(child) ? serializeElementChildren(child) : serializeInlineNode(child)))
    .join(' ')
  return escapeTableCellMarkdown(markdown)
}

function serializeTableNode(node: TableNode): string | null {
  const rows = node.getChildren().filter($isTableRowNode)
  if (rows.length === 0) return null
  const serializedRows = rows.map((row) => row.getChildren().filter($isTableCellNode).map(serializeTableCell))
  const columnCount = Math.max(1, ...serializedRows.map((row) => row.length))
  const normalizedRows = serializedRows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''))
  const header = normalizedRows[0] ?? Array.from({ length: columnCount }, () => '')
  const delimiter = Array.from({ length: columnCount }, () => '---')
  const body = normalizedRows.slice(1)
  return [header, delimiter, ...body]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n')
}

function getListIndent(whitespace: string): number {
  const tabs = whitespace.match(/\t/g)?.length ?? 0
  const spaces = whitespace.match(/ /g)?.length ?? 0
  return tabs + Math.floor(spaces / 4)
}

function getListMarkerFromMatch(match: Array<string>, listType: ListType): '-' | '*' | '+' {
  if (listType === 'check') {
    const marker = match[2]
    return marker === '*' || marker === '+' ? marker : '-'
  }
  const marker = match[2]
  return marker === '*' || marker === '+' ? marker : '-'
}

function exportAppListNode(
  listNode: ListNode,
  exportChildren: (node: ElementNode) => string,
  depth: number,
  selection?: BaseSelection | null,
): string {
  const output: string[] = []
  let index = 0
  for (const child of listNode.getChildren()) {
    if (!$isListItemNode(child)) continue
    if (child.getChildrenSize() === 1) {
      const nestedList = child.getFirstChild()
      if ($isListNode(nestedList)) {
        const nested = exportAppListNode(nestedList, exportChildren, depth + 1, selection)
        if (nested) output.push(nested)
        continue
      }
    }
    if (selection && !child.getChildren().some((nestedChild) => nestedChild.isSelected(selection))) continue
    const listType = listNode.getListType()
    const indent = ' '.repeat(depth * 4)
    const marker = $getState(child, appListItemMarkerState) || $getState(listNode, appListMarkerState)
    const prefix =
      listType === 'number'
        ? `${listNode.getStart() + index}. `
        : listType === 'check'
          ? `${marker} [${child.getChecked() ? 'x' : ' '}] `
          : `${marker} `
    let childrenText = exportChildren(child)
    if (listType !== 'number') {
      childrenText = childrenText.replace(/^(\s{0,3}\d+)(\.\s)/, '$1\\$2')
    }
    output.push(`${indent}${prefix}${childrenText}`)
    index += 1
  }
  return output.join('\n')
}

function replaceAppList(listType: ListType): ElementTransformer['replace'] {
  return (parentNode, children, match, isImport) => {
    const previousNode = parentNode.getPreviousSibling()
    const nextNode = parentNode.getNextSibling()
    const marker = getListMarkerFromMatch(match, listType)
    const listItem = $createListItemNode(listType === 'check' ? /x/i.test(match[4] ?? '') : undefined)
    $setState(listItem, appListItemMarkerState, marker)

    if ($isListNode(nextNode) && nextNode.getListType() === listType) {
      $setState(nextNode, appListMarkerState, marker)
      const firstChild = nextNode.getFirstChild()
      if (firstChild !== null) {
        firstChild.insertBefore(listItem)
      } else {
        nextNode.append(listItem)
      }
      parentNode.remove()
    } else if ($isListNode(previousNode) && previousNode.getListType() === listType) {
      $setState(previousNode, appListMarkerState, marker)
      previousNode.append(listItem)
      parentNode.remove()
    } else {
      const list = $createListNode(listType, listType === 'number' ? Number(match[2]) : undefined)
      $setState(list, appListMarkerState, marker)
      list.append(listItem)
      parentNode.replace(list)
    }

    listItem.append(...children)
    const indent = getListIndent(match[1] ?? '')
    if (indent) listItem.setIndent(indent)
    if (!isImport) listItem.select(0, 0)
  }
}

function setActiveListMarker(marker: '-' | '*' | '+'): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  let node: LexicalNode | null = selection.anchor.getNode()
  let listItem: ListItemNode | null = null
  while (node) {
    if ($isListItemNode(node)) {
      listItem = node
    }
    if ($isListNode(node) && node.getListType() !== 'number') {
      $setState(node, appListMarkerState, marker)
      if (listItem) $setState(listItem, appListItemMarkerState, marker)
      return
    }
    node = node.getParent()
  }
}

const LEXICAL_ANNOTATION_CLASS_NAMES = [
  'tabs-annotation-line',
  'tabs-annotation-line-arrow',
  'tabs-annotation-line-arrow-up',
  'tabs-annotation-line-arrow-down',
  'tabs-annotation-line-arrow-left',
  'tabs-annotation-line-arrow-right',
  'tabs-annotation-line-tail-left',
  'tabs-annotation-line-tail-right',
]

const lexicalNotePreviewWidgetState = new WeakMap<HTMLElement, { token: string; cleanup: () => void }>()

function isCodeNode(node: LexicalNode | null | undefined): node is CodeNode {
  return node instanceof CodeNode
}

function isAnnotationArrowRaw(value: string): value is AnnotationArrowRaw {
  return value === '^--' || value === '--^' || value === 'v--' || value === '--v' || value === '-->' || value === '<--'
}

function createCodeBlockControlIcon(kind: 'copy' | 'trash'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const paths = kind === 'copy'
    ? [
        'M8 8h10v12H8z',
        'M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
      ]
    : [
        'M3 6h18',
        'M8 6V4h8v2',
        'M19 6l-1 14H6L5 6',
        'M10 11v5',
        'M14 11v5',
      ]
  paths.forEach((pathData) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    svg.append(path)
  })
  return svg
}

function stopLexicalControlEvent(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
}

async function copyLexicalCodeBlockText(text: string, pushToast?: LexicalMarkdownEditorOptions['pushToast']) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard text writes are unavailable.')
    await navigator.clipboard.writeText(text)
    pushToast?.('Code copied.', 'success')
  } catch {
    pushToast?.('Could not copy code.', 'warning')
  }
}

function getLexicalCodeNodeText(editor: LexicalEditor, key: NodeKey): string {
  let text = ''
  editor.getEditorState().read(() => {
    const node = $getNodeByKey(key)
    if (isCodeNode(node)) text = node.getTextContent()
  })
  return text
}

function deleteLexicalCodeNode(editor: LexicalEditor, key: NodeKey): boolean {
  let deleted = false
  editor.update(() => {
    const node = $getNodeByKey(key)
    if (!isCodeNode(node)) return
    const root = $getRoot()
    if (root.getChildrenSize() === 1 && root.getFirstChild() === node) {
      const paragraph = $createParagraphNode()
      node.replace(paragraph)
      paragraph.selectStart()
    } else {
      const previous = node.getPreviousSibling()
      const next = node.getNextSibling()
      node.remove()
      if ($isElementNode(next)) {
        next.selectStart()
      } else if ($isElementNode(previous)) {
        previous.selectEnd()
      } else {
        root.selectEnd()
      }
    }
    deleted = true
  }, { discrete: true })
  if (deleted) editor.focus()
  return deleted
}

function getSelectedTableContext(): {
  table: TableNode
  rowIndex: number
  rowCount: number
  cellIndex: number
  cellCount: number
} | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  let node: LexicalNode | null = selection.anchor.getNode()
  let cell: TableCellNode | null = null
  while (node) {
    if ($isTableCellNode(node)) {
      cell = node
      break
    }
    node = node.getParent()
  }
  if (!cell) return null
  const row = cell.getParent()
  const table = row?.getParent()
  if (!$isTableRowNode(row) || !$isTableNode(table)) return null
  const rows = table.getChildren().filter($isTableRowNode)
  const rowIndex = rows.findIndex((candidate) => candidate.getKey() === row.getKey())
  const cells = row.getChildren().filter($isTableCellNode)
  const cellIndex = cells.findIndex((candidate) => candidate.getKey() === cell.getKey())
  return { table, rowIndex, rowCount: rows.length, cellIndex, cellCount: cells.length }
}

function selectTableSiblingOrCreateParagraph(table: TableNode, direction: 'before' | 'after'): boolean {
  const sibling = direction === 'before' ? table.getPreviousSibling() : table.getNextSibling()
  if ($isElementNode(sibling)) {
    if (direction === 'before') {
      sibling.selectEnd()
    } else {
      sibling.selectStart()
    }
    return true
  }
  const paragraph = $createParagraphNode()
  if (direction === 'before') {
    table.insertBefore(paragraph)
    paragraph.selectEnd()
  } else {
    table.insertAfter(paragraph)
    paragraph.selectStart()
  }
  return true
}

function moveLexicalSelectionOutOfTable(
  editor: LexicalEditor,
  direction: 'before' | 'after',
  options: { requireBoundary?: boolean } = {},
): boolean {
  let moved = false
  editor.update(() => {
    const context = getSelectedTableContext()
    if (!context) return
    if (options.requireBoundary) {
      if (direction === 'before' && context.rowIndex > 0) return
      if (direction === 'after' && context.rowIndex < context.rowCount - 1) return
    }
    moved = selectTableSiblingOrCreateParagraph(context.table, direction)
  }, { discrete: true })
  if (moved) editor.focus()
  return moved
}

function moveLexicalSelectionOutOfTerminalTable(editor: LexicalEditor): boolean {
  let moved = false
  editor.update(() => {
    const lastChild = $getRoot().getLastChild()
    if (!$isTableNode(lastChild)) return
    moved = selectTableSiblingOrCreateParagraph(lastChild, 'after')
  }, { discrete: true })
  if (moved) editor.focus()
  return moved
}

function moveLexicalSelectionOutOfTableByTab(editor: LexicalEditor, direction: 'before' | 'after'): boolean {
  let moved = false
  editor.update(() => {
    const context = getSelectedTableContext()
    if (!context) return
    const isFirstCell = context.rowIndex === 0 && context.cellIndex === 0
    const isLastCell = context.rowIndex === context.rowCount - 1 && context.cellIndex === context.cellCount - 1
    if (direction === 'before' && !isFirstCell) return
    if (direction === 'after' && !isLastCell) return
    moved = selectTableSiblingOrCreateParagraph(context.table, direction)
  }, { discrete: true })
  if (moved) editor.focus()
  return moved
}

function getSelectedQuoteNode(): QuoteNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  let node: LexicalNode | null = selection.anchor.getNode()
  while (node) {
    if ($isQuoteNode(node)) return node
    node = node.getParent()
  }
  return null
}

function replaceSelectedEmptyQuoteWithParagraph(editor: LexicalEditor): boolean {
  let replaced = false
  editor.update(() => {
    const quote = getSelectedQuoteNode()
    if (!quote || quote.getTextContent().trim().length > 0) return
    const paragraph = $createParagraphNode()
    quote.replace(paragraph)
    paragraph.selectStart()
    replaced = true
  }, { discrete: true })
  if (replaced) editor.focus()
  return replaced
}

function createLexicalCodeBlockControlButton(kind: 'copy' | 'trash'): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `tabs-code-block-control-btn tabs-code-block-${kind}-btn`
  button.setAttribute('aria-label', kind === 'copy' ? 'Copy code block' : 'Delete code block')
  button.title = kind === 'copy' ? 'Copy code' : 'Delete code block'
  button.append(createCodeBlockControlIcon(kind))
  button.addEventListener('pointerdown', stopLexicalControlEvent)
  button.addEventListener('mousedown', stopLexicalControlEvent)
  button.addEventListener('dragstart', stopLexicalControlEvent)
  return button
}

function createLexicalCodeBlockControls(
  editor: LexicalEditor,
  key: NodeKey,
  pushToast?: LexicalMarkdownEditorOptions['pushToast'],
): HTMLElement {
  const controls = document.createElement('span')
  controls.className = 'tabs-code-block-controls'
  controls.setAttribute(CODE_BLOCK_CONTROLS_ATTR, 'true')
  controls.setAttribute('contenteditable', 'false')
  controls.addEventListener('pointerdown', stopLexicalControlEvent)
  controls.addEventListener('mousedown', stopLexicalControlEvent)
  controls.addEventListener('click', stopLexicalControlEvent)

  const copyButton = createLexicalCodeBlockControlButton('copy')
  const deleteButton = createLexicalCodeBlockControlButton('trash')
  copyButton.addEventListener('click', (event) => {
    stopLexicalControlEvent(event)
    void copyLexicalCodeBlockText(getLexicalCodeNodeText(editor, key), pushToast)
  })
  deleteButton.addEventListener('click', (event) => {
    stopLexicalControlEvent(event)
    if (!deleteLexicalCodeNode(editor, key)) pushToast?.('Could not delete code block.', 'warning')
  })
  controls.append(copyButton, deleteButton)
  return controls
}

function destroyLexicalNotePreviewWidget(element: HTMLElement): void {
  const widgetState = lexicalNotePreviewWidgetState.get(element)
  if (!widgetState) return
  widgetState.cleanup()
  lexicalNotePreviewWidgetState.delete(element)
}

function renderLexicalNotePreviewWidget(
  element: HTMLElement,
  node: LexicalNotePreviewNode,
  notePreviewOptions?: NotePreviewWidgetOptions,
): void {
  if (!notePreviewOptions?.resolvePreviewToken) return
  const token = node.getToken()
  const current = lexicalNotePreviewWidgetState.get(element)
  if (current?.token === token) return
  destroyLexicalNotePreviewWidget(element)
  const payload = notePreviewOptions.resolvePreviewToken(token)
  if (!payload) return
  element.className = 'tabs-lexical-note-preview tabs-lexical-note-preview-widget'
  lexicalNotePreviewWidgetState.set(element, {
    token,
    cleanup: () => {},
  })
  void import('./note-preview-widget').then(({ createNotePreviewWidgetElement }) => {
    if (lexicalNotePreviewWidgetState.get(element)?.token !== token) return
    const widget = createNotePreviewWidgetElement(payload, notePreviewOptions, undefined, node.getLabel())
    element.replaceChildren(widget)
    lexicalNotePreviewWidgetState.set(element, {
      token,
      cleanup: () => {
        ;(widget as HTMLElement & { destroyNotePreview?: () => void }).destroyNotePreview?.()
      },
    })
  })
}

function syncLexicalDomDecorations(
  editor: LexicalEditor,
  options: {
    notePreviewOptions?: NotePreviewWidgetOptions
    pushToast?: LexicalMarkdownEditorOptions['pushToast']
  } = {},
): void {
  editor.getEditorState().read(() => {
    for (const child of $getRoot().getChildren()) {
      if ($isListNode(child)) {
        const element = editor.getElementByKey(child.getKey())
        if (element instanceof HTMLElement) {
          element.classList.remove('tabs-dash-list')
          element.removeAttribute('data-tabs-list-marker')
        }
        child.getChildren().forEach((listChild) => {
          if (!$isListItemNode(listChild)) return
          const listItemElement = editor.getElementByKey(listChild.getKey())
          if (listItemElement instanceof HTMLElement) {
            const marker = $getState(listChild, appListItemMarkerState) || $getState(child, appListMarkerState)
            listItemElement.setAttribute('data-tabs-lexical-list-item-key', listChild.getKey())
            if (marker === '-') {
              listItemElement.setAttribute('data-tabs-list-item-marker', 'dash')
            } else {
              listItemElement.setAttribute('data-tabs-list-item-marker', 'bullet')
            }
            const isTaskItem = child.getListType() === 'check'
            listItemElement.classList.toggle('task-list-item', isTaskItem)
            if (isTaskItem) {
              const checked = listChild.getChecked() === true
              listItemElement.setAttribute('role', 'checkbox')
              listItemElement.setAttribute('aria-checked', checked ? 'true' : 'false')
              listItemElement.setAttribute('tabindex', '0')
              listItemElement.toggleAttribute('data-task', true)
              listItemElement.toggleAttribute('data-task-checked', checked)
              listItemElement.classList.toggle('checked', checked)
              listItemElement.classList.toggle('is-checked', checked)
            } else {
              listItemElement.removeAttribute('role')
              listItemElement.removeAttribute('aria-checked')
              listItemElement.removeAttribute('tabindex')
              listItemElement.removeAttribute('data-task')
              listItemElement.removeAttribute('data-task-checked')
              listItemElement.classList.remove('checked', 'is-checked')
            }
          }
        })
      }
      if (isCodeNode(child)) {
        const element = editor.getElementByKey(child.getKey())
        if (element instanceof HTMLElement && !element.querySelector(`[${CODE_BLOCK_CONTROLS_ATTR}]`)) {
          element.classList.add('tabs-code-block-has-controls')
          element.append(createLexicalCodeBlockControls(editor, child.getKey(), options.pushToast))
        }
      }
      if ($isLexicalNotePreviewNode(child)) {
        const element = editor.getElementByKey(child.getKey())
        if (element instanceof HTMLElement) renderLexicalNotePreviewWidget(element, child, options.notePreviewOptions)
      }
      if ($isParagraphNode(child)) {
        const element = editor.getElementByKey(child.getKey())
        if (!(element instanceof HTMLElement)) continue
        element.classList.remove(...LEXICAL_ANNOTATION_CLASS_NAMES)
        const match = parseAnnotationLine(child.getTextContent())
        if (match?.marker.kind === 'line') {
          element.classList.add(...getAnnotationLineClassNames(match))
        }
      }
    }
  })
}

function createFormattedTextNodeFrom(source: TextNode, text: string): TextNode {
  const next = $createTextNode(text)
  next.setFormat(source.getFormat())
  next.setStyle(source.getStyle())
  return next
}

function replaceTextNodeWithNodes(source: TextNode, nodes: LexicalNode[]): void {
  const first = nodes[0]
  if (!first) {
    source.remove()
    return
  }
  source.replace(first)
  let previous = first
  for (const node of nodes.slice(1)) {
    previous.insertAfter(node)
    previous = node
  }
}

function transformAnnotationArrowTextNode(node: TextNode): void {
  const text = node.getTextContent()
  if (!ANNOTATION_ARROW_MARKER_RE.test(text)) return
  const matches = parseAnnotationLineMarkers(text).filter((match) => match.marker.kind === 'arrow')
  if (matches.length === 0) return
  const nextNodes: LexicalNode[] = []
  let cursor = 0
  for (const match of matches) {
    if (!isAnnotationArrowRaw(match.marker.raw)) continue
    const textBefore = text.slice(cursor, match.markerRemovalStart)
    if (textBefore) nextNodes.push(createFormattedTextNodeFrom(node, textBefore))
    nextNodes.push($createLexicalAnnotationArrowNode(match.marker.raw))
    cursor = match.markerRemovalEnd
  }
  const textAfter = text.slice(cursor)
  if (textAfter) nextNodes.push(createFormattedTextNodeFrom(node, textAfter))
  if (nextNodes.length > 0) replaceTextNodeWithNodes(node, nextNodes)
}

function transformTaskShortcutTextNode(node: TextNode): void {
  const text = node.getTextContent()
  const match = text.match(TASK_SHORTCUT_PREFIX_RE)
  if (!match) return
  let parent: LexicalNode | null = node.getParent()
  let listItem: ListItemNode | null = null
  while (parent) {
    if ($isListItemNode(parent)) {
      listItem = parent
      break
    }
    parent = parent.getParent()
  }
  if (!listItem) return
  const list = listItem.getParent()
  if (!$isListNode(list) || list.getListType() !== 'bullet') return
  const marker = $getState(listItem, appListItemMarkerState) || $getState(list, appListMarkerState) || '-'
  list.setListType('check')
  $setState(list, appListMarkerState, marker)
  $setState(listItem, appListItemMarkerState, marker)
  listItem.setChecked(/x/i.test(match[1] ?? ''))
  const remainder = text.slice(match[0].length)
  if (remainder) {
    node.setTextContent(remainder)
    node.select(0, 0)
  } else {
    node.remove()
    listItem.selectStart()
  }
}

function transformLexicalTextNode(node: TextNode): void {
  transformTaskShortcutTextNode(node)
  if (node.isAttached()) transformAnnotationArrowTextNode(node)
}

export const APP_HORIZONTAL_RULE_TRANSFORMER: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? $getState(node, horizontalRuleMarkerState) : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, match, isImport) => {
    const hr = createAppHorizontalRuleNode(match[1] ?? '---')
    if (isImport || parentNode.getNextSibling() !== null) {
      parentNode.replace(hr)
    } else {
      parentNode.insertBefore(hr)
    }
  },
  triggerOnEnter: true,
  type: 'element',
}

export const APP_ANNOTATION_ARROW_TRANSFORMER: TextMatchTransformer = {
  dependencies: [LexicalAnnotationArrowNode],
  export: (node) => ($isLexicalAnnotationArrowNode(node) ? node.getRaw() : null),
  importRegExp: ANNOTATION_ARROW_MARKER_RE,
  regExp: ANNOTATION_ARROW_MARKER_RE,
  replace: (node) => {
    transformAnnotationArrowTextNode(node)
  },
  type: 'text-match',
}

export const APP_NOTE_PREVIEW_TRANSFORMER: ElementTransformer = {
  dependencies: [LexicalNotePreviewNode],
  export: (node) => ($isLexicalNotePreviewNode(node) ? node.getToken() : null),
  regExp: NOTE_PREVIEW_TOKEN_RE,
  replace: (parentNode, _children, match, isImport) => {
    const token = normalizePreviewTokenSyntax(match[0] ?? '')
    const label = match[1] ?? ''
    const target = getPreviewTargetFromDestination(match[2] ?? '')
    const preview = $createLexicalNotePreviewNode(token, label, target)
    parentNode.replace(preview)
    if (!isImport) preview.selectNext()
  },
  type: 'element',
}

export const APP_CHECK_LIST_TRANSFORMER: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: (node, exportChildren, selection) =>
    $isListNode(node) ? exportAppListNode(node, exportChildren, 0, selection) : null,
  regExp: /^(\s*)(?:([-*+])\s)?\s?(\[(\s|x)?\])\s/i,
  replace: replaceAppList('check'),
  triggerOnEnter: true,
  type: 'element',
}

export const APP_UNORDERED_LIST_TRANSFORMER: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: (node, exportChildren, selection) =>
    $isListNode(node) ? exportAppListNode(node, exportChildren, 0, selection) : null,
  regExp: /^(\s*)([-*+])\s/,
  replace: replaceAppList('bullet'),
  triggerOnEnter: true,
  type: 'element',
}

export const GFM_TABLE_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode, LinkNode],
  export: (node) => ($isTableNode(node) ? serializeTableNode(node) : null),
  regExpStart: TABLE_ROW_RE,
  regExpEnd: { optional: true, regExp: /^$/ },
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const headerLine = lines[startLineIndex] ?? ''
    const delimiterLine = lines[startLineIndex + 1] ?? ''
    const headerCells = splitGfmTableRow(headerLine)
    if (!isGfmTableDelimiter(delimiterLine, headerCells.length)) return null

    const rows = [headerCells]
    let lineIndex = startLineIndex + 2
    while (lineIndex < lines.length && isGfmTableRow(lines[lineIndex] ?? '', headerCells.length)) {
      rows.push(splitGfmTableRow(lines[lineIndex] ?? ''))
      lineIndex += 1
    }

    rootNode.append(createTableNodeFromGfmRows(rows))
    return [true, lineIndex - 1]
  },
  replace: () => false,
  type: 'multiline-element',
}

export const LEXICAL_MARKDOWN_TRANSFORMERS: Transformer[] = [
  GFM_TABLE_TRANSFORMER,
  APP_NOTE_PREVIEW_TRANSFORMER,
  APP_HORIZONTAL_RULE_TRANSFORMER,
  APP_ANNOTATION_ARROW_TRANSFORMER,
  APP_CHECK_LIST_TRANSFORMER,
  APP_UNORDERED_LIST_TRANSFORMER,
  ...TRANSFORMERS,
]

function importMarkdownIntoEditor(markdown: string): void {
  $convertFromMarkdownString(repairLexicalMarkdownForImport(markdown), LEXICAL_MARKDOWN_TRANSFORMERS, undefined, true)
  if ($getRoot().getChildrenSize() === 0) {
    $getRoot().append($createParagraphNode())
  }
}

function exportMarkdownFromEditor(): string {
  return repairLexicalMarkdownForExport($convertToMarkdownString(LEXICAL_MARKDOWN_TRANSFORMERS, undefined, true).trimEnd())
}

function getEditorMarkdown(editor: LexicalEditor, reason = 'snapshot'): string {
  let markdown = ''
  const startedAt = nowMs()
  editor.getEditorState().read(() => {
    markdown = exportMarkdownFromEditor()
  })
  recordLexicalMarkdownExportDiagnostic({
    reason,
    durationMs: nowMs() - startedAt,
    markdown,
  })
  return markdown
}

function getEditorTextSize(editor: LexicalEditor): number {
  let size = 0
  editor.getEditorState().read(() => {
    size = $getRoot().getTextContent().length
  })
  return size
}

function collectTextSpans(): LexicalTextSpan[] {
  const spans: LexicalTextSpan[] = []
  let offset = 0
  for (const textNode of $getRoot().getAllTextNodes()) {
    const textLength = textNode.getTextContentSize()
    spans.push({
      node: textNode,
      key: textNode.getKey(),
      start: offset,
      end: offset + textLength,
    })
    offset += textLength
  }
  return spans
}

function getOffsetForSelectionPoint(point: { key: string; offset: number }): number {
  for (const span of collectTextSpans()) {
    if (span.key === point.key) return span.start + point.offset
  }
  return 0
}

function getLexicalCursorSelection(editor: LexicalEditor): { anchor: number; head: number } {
  let selection = { anchor: 0, head: 0 }
  editor.getEditorState().read(() => {
    const currentSelection = $getSelection()
    if (!$isRangeSelection(currentSelection)) return
    selection = {
      anchor: getOffsetForSelectionPoint(currentSelection.anchor),
      head: getOffsetForSelectionPoint(currentSelection.focus),
    }
  })
  return selection
}

function resolveCursorPoint(offset: number): LexicalCursorPoint | null {
  const spans = collectTextSpans()
  if (spans.length === 0) return null
  for (const span of spans) {
    if (offset <= span.end) {
      return {
        key: span.key,
        offset: clampLexicalPosition(offset - span.start, span.end - span.start),
      }
    }
  }
  const lastSpan = spans[spans.length - 1]
  return {
    key: lastSpan.key,
    offset: Math.max(0, lastSpan.end - lastSpan.start),
  }
}

function restoreLexicalSelection(
  editor: LexicalEditor,
  selection: { anchor: number; head: number },
  options: { focus?: boolean } = {},
): boolean {
  try {
    editor.update(() => {
      const docSize = $getRoot().getTextContent().length
      const anchor = resolveCursorPoint(clampLexicalPosition(selection.anchor, docSize))
      const head = resolveCursorPoint(clampLexicalPosition(selection.head, docSize))
      if (!anchor || !head) {
        $getRoot().selectEnd()
        return
      }
      const nextSelection = $createRangeSelection()
      nextSelection.anchor.set(anchor.key, anchor.offset, 'text')
      nextSelection.focus.set(head.key, head.offset, 'text')
      $setSelection(nextSelection)
    }, { discrete: true })
    if (options.focus !== false) editor.focus()
    return true
  } catch {
    return false
  }
}

function setMarkdownInEditor(editor: LexicalEditor, markdown: string, cursorToEnd = false): void {
  editor.update(() => {
    importMarkdownIntoEditor(markdown)
    if (cursorToEnd) {
      $getRoot().selectEnd()
    }
  }, { discrete: true })
}

function wrapSelectionAsCodeBlock(): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  $setBlocksType(selection, () => $createCodeNode())
}

function setHeading(level: number): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  if (level <= 0) {
    $setBlocksType(selection, () => $createParagraphNode())
    return
  }
  const tag = `h${Math.min(6, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  $setBlocksType(selection, () => $createHeadingNode(tag))
}

function replaceSelectionWithText(text: string): void {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    selection.insertText(text)
    return
  }
  $getRoot().append($createParagraphNode().append($createTextNode(text)))
}

function replaceTextRangeInEditor(editor: LexicalEditor, from: number, to: number, text: string): boolean {
  let handled = false
  editor.update(() => {
    const docSize = $getRoot().getTextContent().length
    const anchor = resolveCursorPoint(clampLexicalPosition(from, docSize))
    const head = resolveCursorPoint(clampLexicalPosition(to, docSize))
    if (!anchor || !head) return
    const selection = $createRangeSelection()
    selection.anchor.set(anchor.key, anchor.offset, 'text')
    selection.focus.set(head.key, head.offset, 'text')
    $setSelection(selection)
    selection.insertText(text)
    handled = true
  }, { discrete: true })
  return handled
}

function replaceTextRangeWithLinkInEditor(
  editor: LexicalEditor,
  from: number,
  to: number,
  label: string,
  url: string,
): boolean {
  let handled = false
  editor.update(() => {
    const docSize = $getRoot().getTextContent().length
    const anchor = resolveCursorPoint(clampLexicalPosition(from, docSize))
    const head = resolveCursorPoint(clampLexicalPosition(to, docSize))
    if (!anchor || !head) return
    const selection = $createRangeSelection()
    selection.anchor.set(anchor.key, anchor.offset, 'text')
    selection.focus.set(head.key, head.offset, 'text')
    $setSelection(selection)
    const nextLabel = label.trim() || url
    const link = $createLinkNode(url)
    link.append($createTextNode(nextLabel))
    selection.insertNodes([link])
    handled = true
  }, { discrete: true })
  return handled
}

function getTextOffsetWithinParent(point: LexicalCursorPoint): { text: string; offset: number } | null {
  const node = $getNodeByKey(point.key)
  if (!$isTextNode(node)) return null
  const parent = node.getParent()
  if (!parent || !$isElementNode(parent)) return null
  let offset = 0
  for (const child of parent.getChildren()) {
    if (child.getKey() === node.getKey()) {
      return {
        text: parent.getTextContent(),
        offset: offset + point.offset,
      }
    }
    offset += child.getTextContent().length
  }
  return null
}

function getLexicalNoteMentionQuery(editor: LexicalEditor): NoteMentionQuery | null {
  let query: NoteMentionQuery | null = null
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
    const anchor = {
      key: selection.anchor.key,
      offset: selection.anchor.offset,
    }
    const parentText = getTextOffsetWithinParent(anchor)
    if (!parentText) return
    const textBeforeCursor = parentText.text.slice(0, parentText.offset)
    const match = /(^|\s)@([^@]*)$/.exec(textBeforeCursor)
    if (!match) return
    const matchQuery = match[2] ?? ''
    if (/^\s/.test(matchQuery)) return
    const cursorOffset = getOffsetForSelectionPoint(anchor)
    query = {
      from: cursorOffset - matchQuery.length - 1,
      to: cursorOffset,
      query: matchQuery,
    }
  })
  return query
}

function getLexicalSelectionClientRect(root: HTMLElement): { top: number; bottom: number; left: number } | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null
  const rect = range.getBoundingClientRect()
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.left)) return null
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
  }
}

function insertTableNode(rows = 2, columns = 2): void {
  const table = $createTableNode()
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = $createTableRowNode()
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      row.append(createTableCell('', TableCellHeaderStates.NO_STATUS))
    }
    table.append(row)
  }
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    selection.insertNodes([table])
  } else {
    $getRoot().append(table)
  }
  const firstRow = table.getFirstChild()
  const firstCell = $isTableRowNode(firstRow) ? firstRow.getFirstChild() : null
  if ($isTableCellNode(firstCell)) {
    firstCell.selectStart()
  }
}

function getRowCountPayload(payload: CommandPayload, fallback: number): number {
  const value = payload?.rowCount
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback
}

function getColumnCountPayload(payload: CommandPayload, fallback: number): number {
  const value = payload?.columnCount
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback
}

function focusAtClientPoint(editor: LexicalEditor, root: HTMLElement, point: { clientX: number; clientY: number }): boolean {
  const documentRef = root.ownerDocument
  const range =
    typeof documentRef.caretRangeFromPoint === 'function'
      ? documentRef.caretRangeFromPoint(point.clientX, point.clientY)
      : null
  if (!range || !root.contains(range.startContainer)) {
    editor.focus()
    return false
  }
  const selection = documentRef.getSelection()
  if (!selection) {
    editor.focus()
    return false
  }
  selection.removeAllRanges()
  selection.addRange(range)
  let appliedLexicalSelection = false
  editor.update(() => {
    const lexicalSelection = $createRangeSelectionFromDom(selection, editor)
    if (!lexicalSelection) return
    $setSelection(lexicalSelection)
    appliedLexicalSelection = true
  }, { discrete: true })
  editor.focus()
  return appliedLexicalSelection
}

function runLexicalCommand(editor: LexicalEditor, command: string, payload?: CommandPayload): void {
  if (command === 'undo') {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    return
  }
  if (command === 'redo') {
    editor.dispatchCommand(REDO_COMMAND, undefined)
    return
  }
  if (command === 'bold') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
    return
  }
  if (command === 'italic') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
    return
  }
  if (command === 'strike') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
    return
  }
  if (command === 'highlight') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')
    return
  }
  if (command === 'code') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
    return
  }
  if (command === 'blockIndent' || command === 'indent') {
    editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
    return
  }
  if (command === 'removeBlockIndent' || command === 'outdent') {
    editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
    return
  }
  if (command === 'hr') {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    return
  }
  if (command === 'addTable') {
    const rows = getRowCountPayload(payload, 2)
    const columns = getColumnCountPayload(payload, 2)
    if (!editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns: String(columns),
      rows: String(rows),
      includeHeaders: { rows: false, columns: false },
    })) {
      editor.update(() => insertTableNode(rows, columns), { discrete: true })
    }
    return
  }

  editor.update(() => {
    if (command === 'heading') {
      const level = typeof payload?.level === 'number' ? payload.level : 1
      setHeading(level)
      return
    }
    if (command === 'blockQuote') {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode())
      return
    }
    if (command === 'codeBlock') {
      wrapSelectionAsCodeBlock()
      return
    }
    if (command === 'bulletList' || command === 'dashList') {
      $insertList('bullet')
      setActiveListMarker(command === 'dashList' ? '-' : '*')
      return
    }
    if (command === 'orderedList') {
      $insertList('number')
      return
    }
    if (command === 'taskList') {
      $insertList('check')
      setActiveListMarker('-')
      return
    }
    if (command === 'addImage') {
      const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : ''
      const altText = typeof payload?.altText === 'string' ? payload.altText : 'image'
      if (imageUrl) replaceSelectionWithText(`![${altText}](${imageUrl})`)
      return
    }
    if (command === 'link') {
      const linkUrl = typeof payload?.linkUrl === 'string' ? payload.linkUrl : ''
      if (linkUrl) $toggleLink(linkUrl)
      return
    }
    if (command === 'clear') {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) selection.removeText()
    }
  }, { discrete: true })
}

function createConfiguredLexicalEditor(editable = true): LexicalEditor {
  return createEditor({
    namespace: 'tabs-lexical-markdown-editor',
    editable,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      TableNode,
      TableRowNode,
      TableCellNode,
      HorizontalRuleNode,
      LexicalAnnotationArrowNode,
      LexicalNotePreviewNode,
    ],
    onError(error) {
      throw error
    },
    theme: {
      paragraph: 'tabs-lexical-paragraph tabs-rendered-markdown-paragraph',
      heading: {
        h1: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1',
        h2: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-2',
        h3: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-3',
        h4: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-4',
        h5: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-5',
        h6: 'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-6',
      },
      quote: 'tabs-rendered-markdown-blockquote-line tabs-lexical-quote',
      link: 'tabs-rendered-markdown-link tabs-lexical-link',
      code: 'tabs-rendered-markdown-code-block-line tabs-lexical-code-block',
      list: {
        ul: 'tabs-lexical-list tabs-lexical-bullet-list',
        ol: 'tabs-lexical-list tabs-lexical-ordered-list',
        checklist: 'tabs-lexical-list tabs-lexical-check-list',
        listitem: 'tabs-rendered-markdown-list-item tabs-lexical-list-item',
        listitemChecked: 'tabs-lexical-task-list-item task-list-item is-checked',
        listitemUnchecked: 'tabs-lexical-task-list-item task-list-item',
      },
      text: {
        bold: 'tabs-rendered-markdown-strong',
        code: 'tabs-rendered-markdown-code',
        highlight: 'tabs-rendered-markdown-highlight',
        italic: 'tabs-rendered-markdown-emphasis',
        strikethrough: 'tabs-rendered-markdown-strike',
      },
      table: 'tabs-lexical-table',
      tableCell: 'tabs-lexical-table-cell',
      tableCellHeader: 'tabs-lexical-table-cell tabs-lexical-table-header-cell',
    },
  })
}

export function createHeadlessLexicalMarkdownEditor(markdown = ''): LexicalEditor {
  const editor = createConfiguredLexicalEditor()
  setMarkdownInEditor(editor, markdown)
  return editor
}

export function getHeadlessLexicalMarkdown(editor: LexicalEditor): string {
  return getEditorMarkdown(editor)
}

export function getHeadlessLexicalCursorSelection(editor: LexicalEditor): { anchor: number; head: number } {
  return getLexicalCursorSelection(editor)
}

export function restoreHeadlessLexicalCursorSelection(
  editor: LexicalEditor,
  selection: { anchor: number; head: number },
  options: { focus?: boolean } = { focus: false },
): boolean {
  return restoreLexicalSelection(editor, selection, options)
}

export function runHeadlessLexicalCommand(editor: LexicalEditor, command: string, payload?: CommandPayload): void {
  runLexicalCommand(editor, command, payload)
}

export function createLexicalMarkdownEditor({
  root,
  markdown,
  onChange,
  onFocus,
  onReady,
  editable = true,
  notePreviewOptions,
  pushToast,
}: LexicalMarkdownEditorOptions): Editor {
  const mountStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  root.classList.add('tabs-lexical-host')
  const editableRoot = document.createElement('div')
  editableRoot.className = 'tabs-lexical-editor tabs-rendered-markdown-surface'
  editableRoot.contentEditable = editable ? 'true' : 'false'
  editableRoot.spellcheck = true
  root.append(editableRoot)

  const lexicalEditor = createConfiguredLexicalEditor(editable)

  let latestMarkdown = String(markdown ?? '')
  let lastNotifiedMarkdown = latestMarkdown
  let applyingProgrammaticMarkdown = false
  let firstFocusRecorded = false
  let currentEditable = editable
  let pendingMarkdownExportTimer: number | null = null
  let pendingMarkdownDirty = false
  let pendingDirtyElementCount = 0
  let pendingDirtyLeafCount = 0
  let pendingDomDecorationFrame: number | null = null

  const clearPendingMarkdownExportTimer = () => {
    if (pendingMarkdownExportTimer === null) return
    window.clearTimeout(pendingMarkdownExportTimer)
    pendingMarkdownExportTimer = null
  }

  const clearPendingDomDecorationFrame = () => {
    if (pendingDomDecorationFrame === null) return
    window.cancelAnimationFrame(pendingDomDecorationFrame)
    pendingDomDecorationFrame = null
  }

  const scheduleLexicalDomDecorationSync = () => {
    clearPendingDomDecorationFrame()
    pendingDomDecorationFrame = window.requestAnimationFrame(() => {
      pendingDomDecorationFrame = null
      syncLexicalDomDecorations(lexicalEditor, { notePreviewOptions, pushToast })
    })
  }

  const materializePendingMarkdown = ({ notify = false, reason = 'snapshot' } = {}) => {
    clearPendingMarkdownExportTimer()
    if (!pendingMarkdownDirty) return latestMarkdown
    const nextMarkdown = getEditorMarkdown(lexicalEditor, reason)
    const dirtyElementCount = pendingDirtyElementCount
    const dirtyLeafCount = pendingDirtyLeafCount
    pendingMarkdownDirty = false
    pendingDirtyElementCount = 0
    pendingDirtyLeafCount = 0
    latestMarkdown = nextMarkdown
    if (!shouldNotifyLexicalMarkdownChange({
      dirtyElementCount,
      dirtyLeafCount,
      nextMarkdown,
      lastNotifiedMarkdown,
    })) {
      lastNotifiedMarkdown = nextMarkdown
      return latestMarkdown
    }
    lastNotifiedMarkdown = nextMarkdown
    if (notify) onChange(nextMarkdown)
    return latestMarkdown
  }

  const schedulePendingMarkdownExport = () => {
    clearPendingMarkdownExportTimer()
    pendingMarkdownExportTimer = window.setTimeout(() => {
      pendingMarkdownExportTimer = null
      materializePendingMarkdown({ notify: true, reason: 'debounced-change' })
    }, LEXICAL_MARKDOWN_EXPORT_DEBOUNCE_MS)
  }

  const applyEditableState = (nextEditable: boolean) => {
    if (currentEditable && !nextEditable) {
      materializePendingMarkdown({ notify: true, reason: 'set-readonly' })
    }
    currentEditable = nextEditable
    lexicalEditor.setEditable(nextEditable)
    editableRoot.contentEditable = nextEditable ? 'true' : 'false'
    root.classList.toggle('is-lexical-editable', nextEditable)
    root.classList.toggle('is-lexical-readonly', !nextEditable)
  }

  applyingProgrammaticMarkdown = true
  setMarkdownInEditor(lexicalEditor, latestMarkdown)
  latestMarkdown = getEditorMarkdown(lexicalEditor, 'initial-import')
  lastNotifiedMarkdown = latestMarkdown
  applyingProgrammaticMarkdown = false

  const unregister = mergeRegister(
    registerRichText(lexicalEditor),
    registerList(lexicalEditor),
    registerTablePlugin(lexicalEditor),
    registerMarkdownShortcuts(lexicalEditor, LEXICAL_MARKDOWN_TRANSFORMERS),
    registerHistory(lexicalEditor, createEmptyHistoryState(), 300),
    lexicalEditor.registerNodeTransform(TextNode, transformLexicalTextNode),
    lexicalEditor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection()
        const hr = createAppHorizontalRuleNode('---')
        if ($isRangeSelection(selection)) {
          selection.insertNodes([hr])
        } else {
          $getRoot().append(hr)
        }
        return true
      },
      COMMAND_PRIORITY_LOW,
    ),
    lexicalEditor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      void editorState
      scheduleLexicalDomDecorationSync()
      if (applyingProgrammaticMarkdown) return
      if (!currentEditable) return
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
      pendingMarkdownDirty = true
      pendingDirtyElementCount += dirtyElements.size
      pendingDirtyLeafCount += dirtyLeaves.size
      schedulePendingMarkdownExport()
    }),
  )

  const handleFocusIn = () => {
    root.classList.add('is-lexical-focused')
    if (!firstFocusRecorded) {
      firstFocusRecorded = true
    }
    onFocus()
  }
  const handleFocusOut = (event: FocusEvent) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && root.contains(nextTarget)) return
    root.classList.remove('is-lexical-focused')
    materializePendingMarkdown({ notify: true, reason: 'blur' })
  }
  root.addEventListener('focusin', handleFocusIn)
  root.addEventListener('focusout', handleFocusOut)

  const toggleLexicalTaskItem = (target: Element | null): boolean => {
    if (!target) return false
    const item = target.closest<HTMLElement>('.tabs-lexical-task-list-item')
    const key = item?.getAttribute('data-tabs-lexical-list-item-key')
    if (!key) return false
    let handled = false
    lexicalEditor.update(() => {
      const node = $getNodeByKey(key)
      if (!$isListItemNode(node)) return
      const parent = node.getParent()
      if (!$isListNode(parent) || parent.getListType() !== 'check') return
      node.setChecked(!node.getChecked())
      node.selectStart()
      handled = true
    }, { discrete: true })
    if (handled) lexicalEditor.focus()
    return handled
  }
  const handleTaskPointer = (event: MouseEvent) => {
    if (!currentEditable) return
    if (toggleLexicalTaskItem(event.target instanceof Element ? event.target : null)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const handleEditorMouseDown = (event: MouseEvent) => {
    if (!currentEditable || event.button !== 0) return
    if (event.target !== editableRoot) return
    if (moveLexicalSelectionOutOfTerminalTable(lexicalEditor)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const handleLexicalKeyDown = (event: KeyboardEvent) => {
    if (!currentEditable) return
    if ((event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') && replaceSelectedEmptyQuoteWithParagraph(lexicalEditor)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && toggleLexicalTaskItem(event.target instanceof Element ? event.target : null)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Tab') {
      const moved = moveLexicalSelectionOutOfTableByTab(lexicalEditor, event.shiftKey ? 'before' : 'after')
      if (moved) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    if (event.shiftKey) return
    const moved =
      event.key === 'Escape'
        ? moveLexicalSelectionOutOfTable(lexicalEditor, 'after')
        : event.key === 'ArrowUp'
          ? moveLexicalSelectionOutOfTable(lexicalEditor, 'before', { requireBoundary: true })
          : event.key === 'ArrowDown'
            ? moveLexicalSelectionOutOfTable(lexicalEditor, 'after', { requireBoundary: true })
            : false
    if (moved) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  editableRoot.addEventListener('click', handleTaskPointer, true)
  editableRoot.addEventListener('mousedown', handleEditorMouseDown, true)
  editableRoot.addEventListener('keydown', handleLexicalKeyDown, true)

  lexicalEditor.setRootElement(editableRoot)
  applyEditableState(editable)
  scheduleLexicalDomDecorationSync()

  const handle: LexicalMarkdownEditorHandle = {
    __tabsEditorCore: 'lexical',
    focus: () => lexicalEditor.focus(),
    focusAtClientPoint: (point) => focusAtClientPoint(lexicalEditor, editableRoot, point),
    destroy: () => {
      materializePendingMarkdown({ notify: true, reason: 'destroy' })
      clearPendingMarkdownExportTimer()
      clearPendingDomDecorationFrame()
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
      editableRoot.removeEventListener('click', handleTaskPointer, true)
      editableRoot.removeEventListener('mousedown', handleEditorMouseDown, true)
      editableRoot.removeEventListener('keydown', handleLexicalKeyDown, true)
      editableRoot
        .querySelectorAll<HTMLElement>('.tabs-lexical-note-preview')
        .forEach((element) => destroyLexicalNotePreviewWidget(element))
      root.classList.remove('tabs-lexical-host')
      root.classList.remove('is-lexical-focused')
      unregister()
      lexicalEditor.setRootElement(null)
      editableRoot.remove()
    },
    getCursorSelection: () => getLexicalCursorSelection(lexicalEditor),
    getDocSize: () => getEditorTextSize(lexicalEditor),
    getNoteMentionQuery: () => getLexicalNoteMentionQuery(lexicalEditor),
    getSelectionClientRect: () => getLexicalSelectionClientRect(editableRoot),
    replaceTextRange: (from, to, text) => replaceTextRangeInEditor(lexicalEditor, from, to, text),
    replaceTextRangeWithLink: (from, to, label, url) =>
      replaceTextRangeWithLinkInEditor(lexicalEditor, from, to, label, url),
    getMarkdown: () => materializePendingMarkdown({ notify: false, reason: 'get-markdown' }),
    getCachedMarkdown: () => latestMarkdown,
    flushPendingMarkdown: (options) => materializePendingMarkdown({
      notify: options?.notify === true,
      reason: options?.notify === true ? 'flush-notify' : 'flush',
    }),
    hasPendingMarkdownChanges: () => pendingMarkdownDirty,
    restoreCursorSelection: (selection, options) => restoreLexicalSelection(lexicalEditor, selection, options),
    runHistory: (direction) => lexicalEditor.dispatchCommand(direction === 'undo' ? UNDO_COMMAND : REDO_COMMAND, undefined),
    setEditable: applyEditableState,
    isEditable: () => currentEditable,
    setMarkdown: (nextMarkdown, cursorToEnd = false) => {
      clearPendingMarkdownExportTimer()
      pendingMarkdownDirty = false
      pendingDirtyElementCount = 0
      pendingDirtyLeafCount = 0
      applyingProgrammaticMarkdown = true
      setMarkdownInEditor(lexicalEditor, String(nextMarkdown ?? ''), cursorToEnd)
      latestMarkdown = getEditorMarkdown(lexicalEditor, 'set-markdown')
      lastNotifiedMarkdown = latestMarkdown
      applyingProgrammaticMarkdown = false
      scheduleLexicalDomDecorationSync()
    },
    insertText: (text) => {
      lexicalEditor.update(() => replaceSelectionWithText(text), { discrete: true })
    },
    exec: (command, payload) => {
      runLexicalCommand(lexicalEditor, command, payload)
    },
    getSelectedText: () => {
      let selected = ''
      lexicalEditor.getEditorState().read(() => {
        const selection: BaseSelection | null = $getSelection()
        selected = $convertSelectionToMarkdownString(LEXICAL_MARKDOWN_TRANSFORMERS, selection, true)
      })
      return selected
    },
  }

  const readyDuration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - mountStartedAt
  onReady?.(readyDuration)
  return handle as unknown as Editor
}
