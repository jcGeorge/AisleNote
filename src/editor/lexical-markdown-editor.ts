import type { Editor } from '@toast-ui/editor'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  createEditor,
  mergeRegister,
  type BaseSelection,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
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
  $insertList,
  ListItemNode,
  ListNode,
  registerList,
} from '@lexical/list'
import {
  $createHeadingNode,
  $createQuoteNode,
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
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@lexical/react/LexicalHorizontalRuleNode.js'
import {
  $convertFromMarkdownString,
  $convertSelectionToMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type MultilineElementTransformer,
  type Transformer,
} from '@lexical/markdown'

type LexicalMarkdownEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onFocus: () => void
  onReady?: (durationMs: number) => void
  editable?: boolean
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
  restoreCursorSelection: (selection: { anchor: number; head: number }, options?: { focus?: boolean }) => boolean
  runHistory: (direction: 'undo' | 'redo') => boolean
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

export function isLexicalMarkdownEditor(editor: Editor | null): editor is Editor & LexicalMarkdownEditorHandle {
  return Boolean((editor as unknown as LexicalMarkdownEditorHandle | null)?.__tabsEditorCore === 'lexical')
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

function createTableNodeFromGfmRows(rows: string[][]): TableNode {
  const table = $createTableNode()
  rows.forEach((row, rowIndex) => {
    const tableRow = $createTableRowNode()
    const headerState = rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
    for (const cell of row) {
      tableRow.append(createTableCell(cell, headerState))
    }
    table.append(tableRow)
  })
  return table
}

function escapeTableCellMarkdown(markdown: string): string {
  return markdown
    .replaceAll('\\', '\\\\')
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
  ...TRANSFORMERS,
]

function importMarkdownIntoEditor(markdown: string): void {
  $convertFromMarkdownString(String(markdown ?? ''), LEXICAL_MARKDOWN_TRANSFORMERS, undefined, true)
  if ($getRoot().getChildrenSize() === 0) {
    $getRoot().append($createParagraphNode())
  }
}

function exportMarkdownFromEditor(): string {
  return $convertToMarkdownString(LEXICAL_MARKDOWN_TRANSFORMERS, undefined, true).trimEnd()
}

function getEditorMarkdown(editor: LexicalEditor): string {
  let markdown = ''
  editor.getEditorState().read(() => {
    markdown = exportMarkdownFromEditor()
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

function insertTableNode(rows = 2, columns = 2): void {
  const table = $createTableNode()
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = $createTableRowNode()
    const headerState = rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      row.append(createTableCell('', headerState))
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
  editor.focus()
  return true
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
      includeHeaders: { rows: true, columns: false },
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
      return
    }
    if (command === 'orderedList') {
      $insertList('number')
      return
    }
    if (command === 'taskList') {
      $insertList('check')
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

  const applyEditableState = (nextEditable: boolean) => {
    currentEditable = nextEditable
    lexicalEditor.setEditable(nextEditable)
    editableRoot.contentEditable = nextEditable ? 'true' : 'false'
    root.classList.toggle('is-lexical-editable', nextEditable)
    root.classList.toggle('is-lexical-readonly', !nextEditable)
  }

  applyingProgrammaticMarkdown = true
  setMarkdownInEditor(lexicalEditor, latestMarkdown)
  latestMarkdown = getEditorMarkdown(lexicalEditor)
  lastNotifiedMarkdown = latestMarkdown
  applyingProgrammaticMarkdown = false

  const unregister = mergeRegister(
    registerRichText(lexicalEditor),
    registerList(lexicalEditor),
    registerTablePlugin(lexicalEditor),
    registerHistory(lexicalEditor, createEmptyHistoryState(), 300),
    lexicalEditor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection()
        const hr = $createHorizontalRuleNode()
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
      if (applyingProgrammaticMarkdown) return
      if (!currentEditable) return
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
      let nextMarkdown = latestMarkdown
      editorState.read(() => {
        nextMarkdown = exportMarkdownFromEditor()
      })
      latestMarkdown = nextMarkdown
      if (!shouldNotifyLexicalMarkdownChange({
        dirtyElementCount: dirtyElements.size,
        dirtyLeafCount: dirtyLeaves.size,
        nextMarkdown,
        lastNotifiedMarkdown,
      })) {
        return
      }
      lastNotifiedMarkdown = nextMarkdown
      onChange(latestMarkdown)
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
  }
  root.addEventListener('focusin', handleFocusIn)
  root.addEventListener('focusout', handleFocusOut)

  lexicalEditor.setRootElement(editableRoot)
  applyEditableState(editable)

  const handle: LexicalMarkdownEditorHandle = {
    __tabsEditorCore: 'lexical',
    focus: () => lexicalEditor.focus(),
    focusAtClientPoint: (point) => focusAtClientPoint(lexicalEditor, editableRoot, point),
    destroy: () => {
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
      root.classList.remove('tabs-lexical-host')
      root.classList.remove('is-lexical-focused')
      unregister()
      lexicalEditor.setRootElement(null)
      editableRoot.remove()
    },
    getCursorSelection: () => getLexicalCursorSelection(lexicalEditor),
    getDocSize: () => getEditorTextSize(lexicalEditor),
    getMarkdown: () => latestMarkdown,
    restoreCursorSelection: (selection, options) => restoreLexicalSelection(lexicalEditor, selection, options),
    runHistory: (direction) => lexicalEditor.dispatchCommand(direction === 'undo' ? UNDO_COMMAND : REDO_COMMAND, undefined),
    setEditable: applyEditableState,
    isEditable: () => currentEditable,
    setMarkdown: (nextMarkdown, cursorToEnd = false) => {
      applyingProgrammaticMarkdown = true
      setMarkdownInEditor(lexicalEditor, String(nextMarkdown ?? ''), cursorToEnd)
      latestMarkdown = getEditorMarkdown(lexicalEditor)
      lastNotifiedMarkdown = latestMarkdown
      applyingProgrammaticMarkdown = false
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
