import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  keymap,
} from '@codemirror/view'
import type { Editor } from '@toast-ui/editor'
import { extractMarkdownTagRanges, TAG_TOKEN_CLASS_NAME } from '../tags/tags.js'
import {
  RENDERED_MARKDOWN_CLASS_NAMES,
  RENDERED_MARKDOWN_SURFACE_CLASS,
  collectRenderedMarkdownHighlightRanges,
  getRenderedMarkdownHeadingLineClassName,
} from './rendered-markdown-surface'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { logSlowOperation } from '../performance/performance-logging'

type CodeMirrorMarkdownEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onFocus: () => void
  diagnosticAisleId?: string
}

type CommandPayload = Record<string, unknown> | undefined

const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g
const BARE_EXTERNAL_URL_RE = /https?:\/\/[^\s<>)]+/gi
const INLINE_CODE_RE = /(`+)([^`\n]+?)\1/g
const STRONG_RE = /\*\*([^*\n]+)\*\*/g
const EMPHASIS_RE = /(^|[^*])\*([^*\n]+)\*(?!\*)/g
const STRIKE_RE = /~~([^~\n]+)~~/g
const HORIZONTAL_RULE_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/
const CODEMIRROR_MARKDOWN_CHANGE_DEBOUNCE_MS = 450
const CODEMIRROR_TABLE_PREVIEW_CONTEXT_LINE_COUNT = 80

export type RenderedMarkdownLine = {
  from: number
  to: number
  number: number
  text: string
  isInsideFence?: boolean
  isFenceBoundary?: boolean
}

type RenderedMarkdownMarkPlan = {
  from: number
  to: number
  className: string
  attrs?: Record<string, string>
}

type RenderedMarkdownLinePlan = {
  from: number
  className: string
}

type RenderedMarkdownReplacementPlan = {
  from: number
  to: number
  kind: 'hidden' | 'list-marker' | 'task-marker' | 'hr'
  label?: string
  className?: string
}

export type RenderedMarkdownDecorationPlan = {
  marks: RenderedMarkdownMarkPlan[]
  lines: RenderedMarkdownLinePlan[]
  replacements: RenderedMarkdownReplacementPlan[]
}

export type RenderedMarkdownTableBlockPlan = {
  from: number
  to: number
  rows: string[][]
}

export type RenderedMarkdownTableCellPart =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; url: string }
  | { kind: 'image'; text: string; url: string }

type CodeMirrorTablePreviewState = {
  decorations: DecorationSet
  blocks: RenderedMarkdownTableBlockPlan[]
  editableTableKey: string
}

export type RenderedMarkdownDecorationPlanOptions = {
  editableRanges?: Array<{ from: number; to: number }>
}

export type CodeMirrorMarkdownEditorHandle = {
  __tabsEditorCore: 'codemirror'
  focus: () => void
  focusAtClientPoint: (point: { clientX: number; clientY: number }) => boolean
  destroy: () => void
  getCursorSelection: () => { anchor: number; head: number }
  getDocSize: () => number
  getMarkdown: () => string
  restoreCursorSelection: (selection: { anchor: number; head: number }, options?: { focus?: boolean }) => boolean
  setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  exec: (command: string, payload?: CommandPayload) => void
  getSelectedText: () => string
}

export function isCodeMirrorMarkdownEditor(editor: Editor | null): editor is Editor & CodeMirrorMarkdownEditorHandle {
  return Boolean((editor as unknown as CodeMirrorMarkdownEditorHandle | null)?.__tabsEditorCore === 'codemirror')
}

function clampCodeMirrorPosition(value: number, docLength: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.max(0, docLength), Math.floor(value)))
}

export function getCodeMirrorCursorSelection(view: Pick<EditorView, 'state'>): { anchor: number; head: number } {
  const selection = view.state.selection.main
  return { anchor: selection.anchor, head: selection.head }
}

export function getCodeMirrorDocSize(view: Pick<EditorView, 'state'>): number {
  return view.state.doc.length
}

export function restoreCodeMirrorSelection(
  view: EditorView,
  selection: { anchor: number; head: number },
  options: { focus?: boolean } = {},
): boolean {
  const docLength = getCodeMirrorDocSize(view)
  const anchor = clampCodeMirrorPosition(selection.anchor, docLength)
  const head = clampCodeMirrorPosition(selection.head, docLength)
  try {
    view.dispatch({
      selection: anchor === head ? EditorSelection.cursor(head) : EditorSelection.range(anchor, head),
      scrollIntoView: true,
    })
    if (options.focus !== false) view.focus()
    return true
  } catch {
    return false
  }
}

function getSelectionText(view: EditorView, range = view.state.selection.main) {
  return view.state.doc.sliceString(range.from, range.to)
}

function replaceSelectedLines(
  view: EditorView,
  transform: (lineText: string, index: number) => string,
) {
  const selection = view.state.selection.main
  const lastSelectionPosition = selection.to > selection.from
    ? Math.max(selection.from, selection.to - 1)
    : selection.to
  const firstLine = view.state.doc.lineAt(selection.from)
  const lastLine = view.state.doc.lineAt(lastSelectionPosition)
  const changes: Array<{ from: number; to: number; insert: string }> = []
  for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)
    changes.push({
      from: line.from,
      to: line.to,
      insert: transform(line.text, lineNumber - firstLine.number),
    })
  }
  view.dispatch({
    changes,
    selection: EditorSelection.range(selection.from, selection.to),
    scrollIntoView: true,
  })
}

function prefixSelectedLines(view: EditorView, getPrefix: (lineText: string, index: number) => string) {
  replaceSelectedLines(view, (lineText, index) => {
    const prefix = getPrefix(lineText, index)
    return lineText.trim().length > 0 ? `${prefix}${lineText}` : prefix.trimEnd()
  })
}

function toggleHeading(view: EditorView, payload?: CommandPayload) {
  const level = typeof payload?.level === 'number' ? Math.max(0, Math.min(6, Math.trunc(payload.level))) : 1
  replaceSelectedLines(view, (lineText) => {
    const withoutHeading = lineText.replace(/^\s{0,3}#{1,6}\s+/, '')
    return level > 0 ? `${'#'.repeat(level)} ${withoutHeading}` : withoutHeading
  })
}

function indentSelectedLines(view: EditorView) {
  prefixSelectedLines(view, () => '  ')
}

function outdentSelectedLines(view: EditorView) {
  replaceSelectedLines(view, (lineText) => lineText.replace(/^(?: {1,2}|\t)/, ''))
}

function clearSelectionMarkdown(view: EditorView) {
  const selection = view.state.selection.main
  if (selection.empty) return
  const selected = getSelectionText(view, selection)
  const cleared = selected
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: cleared },
    selection: EditorSelection.range(selection.from, selection.from + cleared.length),
    scrollIntoView: true,
  })
}

function addRenderedMark(
  marks: RenderedMarkdownMarkPlan[],
  from: number,
  to: number,
  className: string,
  attrs?: Record<string, string>,
) {
  if (to <= from) return
  marks.push({ from, to, className, attrs })
}

function addHiddenSyntax(replacements: RenderedMarkdownReplacementPlan[], from: number, to: number) {
  if (to <= from) return
  replacements.push({ from, to, kind: 'hidden' })
}

function addMarkerWidget(
  replacements: RenderedMarkdownReplacementPlan[],
  from: number,
  to: number,
  label: string,
  className: string,
) {
  if (to <= from) return
  replacements.push({ from, to, kind: 'list-marker', label, className })
}

function addTaskWidget(
  replacements: RenderedMarkdownReplacementPlan[],
  from: number,
  to: number,
  checked: boolean,
) {
  if (to <= from) return
  replacements.push({
    from,
    to,
    kind: 'task-marker',
    label: checked ? '☑' : '☐',
    className: checked
      ? `${RENDERED_MARKDOWN_CLASS_NAMES.taskMarker} tabs-cm-task-marker is-checked`
      : `${RENDERED_MARKDOWN_CLASS_NAMES.taskMarker} tabs-cm-task-marker`,
  })
}

function addHorizontalRuleWidget(replacements: RenderedMarkdownReplacementPlan[], from: number, to: number) {
  if (to <= from) return
  replacements.push({
    from,
    to,
    kind: 'hr',
    className: 'tabs-rendered-markdown-hr tabs-cm-rendered-hr',
  })
}

function overlapsRanges(from: number, to: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.some((range) => from < range.to && to > range.from)
}

function hasPotentialBareExternalUrlOutsideRanges(line: RenderedMarkdownLine, ranges: Array<{ from: number; to: number }>) {
  const lowerText = line.text.toLowerCase()
  let searchFrom = 0
  while (searchFrom < lowerText.length) {
    const httpIndex = lowerText.indexOf('http://', searchFrom)
    const httpsIndex = lowerText.indexOf('https://', searchFrom)
    let index: number
    if (httpIndex === -1) {
      index = httpsIndex
    } else if (httpsIndex === -1) {
      index = httpIndex
    } else {
      index = Math.min(httpIndex, httpsIndex)
    }
    if (index === -1) return false
    const from = line.from + index
    if (!overlapsRanges(from, from + 1, ranges)) return true
    searchFrom = index + 1
  }
  return false
}

function rangeIntersectsPointOrRange(from: number, to: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.some((range) => {
    if (range.from === range.to) return range.from >= from && range.from <= to
    return range.from < to && range.to > from
  })
}

function isTableRow(text: string) {
  const trimmed = text.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && parseTableRow(text).length > 0
}

function isTableDelimiter(text: string) {
  if (!isTableRow(text)) return false
  return text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function parseTableRow(text: string) {
  return text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function getCodeMirrorTimingLabel(label: string, diagnosticAisleId?: string) {
  return diagnosticAisleId ? `${label}:${diagnosticAisleId}` : label
}

function measureCodeMirrorOperation<T>(label: string, diagnosticAisleId: string | undefined, operation: () => T): T {
  const startedAt = nowMs()
  try {
    return operation()
  } finally {
    logSlowOperation(getCodeMirrorTimingLabel(label, diagnosticAisleId), nowMs() - startedAt)
  }
}

function findTableBlocks(lines: RenderedMarkdownLine[]) {
  const blocks: Array<{ startIndex: number; endIndex: number; rows: string[][] }> = []
  let index = 0
  while (index < lines.length - 1) {
    const header = lines[index]
    const delimiter = lines[index + 1]
    if (header?.isInsideFence || delimiter?.isInsideFence || !isTableRow(header.text) || !isTableDelimiter(delimiter.text)) {
      index += 1
      continue
    }

    let endIndex = index + 1
    while (endIndex + 1 < lines.length && !lines[endIndex + 1].isInsideFence && isTableRow(lines[endIndex + 1].text)) {
      endIndex += 1
    }

    const rows = lines
      .slice(index, endIndex + 1)
      .filter((line) => !isTableDelimiter(line.text))
      .map((line) => parseTableRow(line.text))
    blocks.push({ startIndex: index, endIndex, rows })
    index = endIndex + 1
  }
  return blocks
}

function collectInlineCodeRanges(line: RenderedMarkdownLine, plan: RenderedMarkdownDecorationPlan) {
  const codeRanges: Array<{ from: number; to: number }> = []
  INLINE_CODE_RE.lastIndex = 0
  for (const match of line.text.matchAll(INLINE_CODE_RE)) {
    const matchIndex = match.index ?? 0
    const marker = match[1] ?? '`'
    const content = match[2] ?? ''
    const from = line.from + matchIndex
    const contentStart = from + marker.length
    const contentEnd = contentStart + content.length
    const to = contentEnd + marker.length
    addHiddenSyntax(plan.replacements, from, contentStart)
    addHiddenSyntax(plan.replacements, contentEnd, to)
    addRenderedMark(plan.marks, contentStart, contentEnd, `${RENDERED_MARKDOWN_CLASS_NAMES.code} tabs-cm-rendered-code`)
    codeRanges.push({ from, to })
  }
  return codeRanges
}

function decorateInlinePair(
  line: RenderedMarkdownLine,
  plan: RenderedMarkdownDecorationPlan,
  protectedRanges: Array<{ from: number; to: number }>,
  regex: RegExp,
  className: string,
  options: { prefixGroup?: number; contentGroup?: number; markerLength?: number } = {},
) {
  const prefixGroup = options.prefixGroup ?? 0
  const contentGroup = options.contentGroup ?? 1
  const markerLength = options.markerLength ?? 2
  regex.lastIndex = 0
  for (const match of line.text.matchAll(regex)) {
    const matchIndex = match.index ?? 0
    const prefix = prefixGroup > 0 ? match[prefixGroup] ?? '' : ''
    const content = match[contentGroup] ?? ''
    const from = line.from + matchIndex + prefix.length
    const contentStart = from + markerLength
    const contentEnd = contentStart + content.length
    const to = contentEnd + markerLength
    if (overlapsRanges(from, to, protectedRanges)) continue
    addHiddenSyntax(plan.replacements, from, contentStart)
    addHiddenSyntax(plan.replacements, contentEnd, to)
    addRenderedMark(plan.marks, contentStart, contentEnd, className)
  }
}

function decorateLineInlineMarkdown(
  line: RenderedMarkdownLine,
  plan: RenderedMarkdownDecorationPlan,
  headingTextStart: number | null,
) {
  const protectedRanges = collectInlineCodeRanges(line, plan)

  if (line.text.includes('](')) {
    MARKDOWN_LINK_RE.lastIndex = 0
    for (const match of line.text.matchAll(MARKDOWN_LINK_RE)) {
      const matchIndex = match.index ?? 0
      const imagePrefix = match[1] ?? ''
      const label = match[2] ?? ''
      const destination = match[3] ?? ''
      const from = line.from + matchIndex
      const labelStart = from + (imagePrefix ? 2 : 1)
      const labelEnd = labelStart + label.length
      const to = from + match[0].length
      if (overlapsRanges(from, to, protectedRanges)) continue

      addHiddenSyntax(plan.replacements, from, labelStart)
      addHiddenSyntax(plan.replacements, labelEnd, to)
      addRenderedMark(
        plan.marks,
        labelStart,
        labelEnd,
        imagePrefix
          ? `${RENDERED_MARKDOWN_CLASS_NAMES.imageLabel} tabs-cm-rendered-image-label`
          : `${RENDERED_MARKDOWN_CLASS_NAMES.link} tabs-cm-rendered-link`,
        imagePrefix
          ? { 'data-tabs-image-url': destination }
          : { 'data-tabs-link-url': destination },
      )
      protectedRanges.push({ from, to })
    }
  }

  if (hasPotentialBareExternalUrlOutsideRanges(line, protectedRanges)) {
    BARE_EXTERNAL_URL_RE.lastIndex = 0
    for (const match of line.text.matchAll(BARE_EXTERNAL_URL_RE)) {
      const matchIndex = match.index ?? 0
      const from = line.from + matchIndex
      const to = from + match[0].length
      if (overlapsRanges(from, to, protectedRanges)) continue
      addRenderedMark(plan.marks, from, to, `${RENDERED_MARKDOWN_CLASS_NAMES.link} tabs-cm-rendered-link`, {
        'data-tabs-link-url': match[0],
      })
    }
  }

  decorateInlinePair(line, plan, protectedRanges, STRONG_RE, `${RENDERED_MARKDOWN_CLASS_NAMES.strong} tabs-cm-rendered-strong`)
  decorateInlinePair(line, plan, protectedRanges, STRIKE_RE, `${RENDERED_MARKDOWN_CLASS_NAMES.strike} tabs-cm-rendered-strike`)
  for (const highlightRange of collectRenderedMarkdownHighlightRanges(line.text)) {
    const from = line.from + highlightRange.markerStart
    const contentStart = line.from + highlightRange.contentStart
    const contentEnd = line.from + highlightRange.contentEnd
    const to = line.from + highlightRange.markerEnd
    if (overlapsRanges(from, to, protectedRanges)) continue
    addHiddenSyntax(plan.replacements, from, contentStart)
    addHiddenSyntax(plan.replacements, contentEnd, to)
    addRenderedMark(
      plan.marks,
      contentStart,
      contentEnd,
      `${RENDERED_MARKDOWN_CLASS_NAMES.highlight} tabs-cm-rendered-highlight`,
    )
    protectedRanges.push({ from, to })
  }

  decorateInlinePair(line, plan, protectedRanges, EMPHASIS_RE, `${RENDERED_MARKDOWN_CLASS_NAMES.emphasis} tabs-cm-rendered-emphasis`, {
    prefixGroup: 1,
    contentGroup: 2,
    markerLength: 1,
  })

  const tagSearchOffset = headingTextStart === null ? 0 : Math.max(0, headingTextStart - line.from)
  const tagSource = line.text.slice(tagSearchOffset)
  for (const range of extractMarkdownTagRanges(tagSource)) {
    const from = line.from + tagSearchOffset + range.from
    const to = line.from + tagSearchOffset + range.to
    if (overlapsRanges(from, to, protectedRanges)) continue
    addRenderedMark(plan.marks, from, to, TAG_TOKEN_CLASS_NAME, {
      'data-tabs-tag': range.tag,
      'data-app-tooltip': 'filter by tag',
    })
  }
}

export function buildRenderedMarkdownDecorationPlanFromLines(
  lines: RenderedMarkdownLine[],
  options: RenderedMarkdownDecorationPlanOptions = {},
): RenderedMarkdownDecorationPlan {
  const plan: RenderedMarkdownDecorationPlan = { marks: [], lines: [], replacements: [] }
  const tableLineStarts = new Set<number>()

  for (const block of findTableBlocks(lines)) {
    const start = lines[block.startIndex]
    const end = lines[block.endIndex]
    if (rangeIntersectsPointOrRange(start.from, end.to, options.editableRanges ?? [])) {
      continue
    }
    for (let index = block.startIndex; index <= block.endIndex; index += 1) {
      tableLineStarts.add(lines[index].from)
      plan.lines.push({
        from: lines[index].from,
        className: isTableDelimiter(lines[index].text)
          ? `${RENDERED_MARKDOWN_CLASS_NAMES.tableSourceLine} ${RENDERED_MARKDOWN_CLASS_NAMES.tableDelimiterLine} tabs-cm-rendered-table-source-line tabs-cm-rendered-table-delimiter-line cm-tabs-table-line`
          : `${RENDERED_MARKDOWN_CLASS_NAMES.tableSourceLine} tabs-cm-rendered-table-source-line cm-tabs-table-line`,
      })
    }
  }

  for (const line of lines) {
    if (tableLineStarts.has(line.from)) continue

    const text = line.text
    const trimmed = text.trim()

    if (isTableRow(text)) {
      plan.lines.push({
        from: line.from,
        className: `${RENDERED_MARKDOWN_CLASS_NAMES.tableSourceLine} tabs-cm-rendered-table-source-line cm-tabs-table-line`,
      })
    }

    if (line.isFenceBoundary || FENCE_RE.test(text)) {
      addHiddenSyntax(plan.replacements, line.from, line.to)
      continue
    }

    if (line.isInsideFence) {
      plan.lines.push({
        from: line.from,
        className: `${RENDERED_MARKDOWN_CLASS_NAMES.codeBlockLine} tabs-cm-rendered-code-block-line`,
      })
      continue
    }

    if (HORIZONTAL_RULE_RE.test(text)) {
      plan.lines.push({ from: line.from, className: `${RENDERED_MARKDOWN_CLASS_NAMES.hrLine} tabs-cm-rendered-hr-line` })
      addHorizontalRuleWidget(plan.replacements, line.from, line.to)
      continue
    }

    let headingTextStart: number | null = null
    const headingMatch = text.match(/^(\s{0,3})(#{1,6})([ \t]+)(.*)$/)
    if (headingMatch) {
      const prefixLength = headingMatch[1].length + headingMatch[2].length + headingMatch[3].length
      const level = headingMatch[2].length
      headingTextStart = line.from + prefixLength
      plan.lines.push({
        from: line.from,
        className: `${getRenderedMarkdownHeadingLineClassName(level)} tabs-cm-rendered-heading-line tabs-cm-rendered-heading-line-${level} cm-tabs-heading-line`,
      })
      addHiddenSyntax(plan.replacements, line.from + headingMatch[1].length, headingTextStart)
      addRenderedMark(
        plan.marks,
        headingTextStart,
        line.to,
        `${RENDERED_MARKDOWN_CLASS_NAMES.heading} ${RENDERED_MARKDOWN_CLASS_NAMES.heading}-${level} tabs-cm-rendered-heading-text tabs-cm-rendered-heading-${level}`,
      )
    }

    const taskMatch = text.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+/)
    if (taskMatch) {
      const markerTo = line.from + taskMatch[0].length
      plan.lines.push({
        from: line.from,
        className: `${RENDERED_MARKDOWN_CLASS_NAMES.listLine} ${RENDERED_MARKDOWN_CLASS_NAMES.taskLine} tabs-cm-rendered-list-line tabs-cm-rendered-task-line cm-tabs-task-line`,
      })
      addTaskWidget(plan.replacements, line.from + taskMatch[1].length, markerTo, /x/i.test(taskMatch[2]))
    } else {
      const unorderedMatch = text.match(/^(\s*)([-*+])\s+/)
      const orderedMatch = text.match(/^(\s*)(\d+)([.)])\s+/)
      if (unorderedMatch) {
        const markerFrom = line.from + unorderedMatch[1].length
        const markerTo = markerFrom + unorderedMatch[2].length + 1
        plan.lines.push({
          from: line.from,
          className: `${RENDERED_MARKDOWN_CLASS_NAMES.listLine} ${RENDERED_MARKDOWN_CLASS_NAMES.unorderedListLine} tabs-cm-rendered-list-line tabs-cm-rendered-unordered-list-line`,
        })
        addMarkerWidget(plan.replacements, markerFrom, markerTo, '•', `${RENDERED_MARKDOWN_CLASS_NAMES.listMarker} tabs-cm-list-marker`)
      } else if (orderedMatch) {
        const markerFrom = line.from + orderedMatch[1].length
        const markerTo = markerFrom + orderedMatch[2].length + orderedMatch[3].length + 1
        plan.lines.push({
          from: line.from,
          className: `${RENDERED_MARKDOWN_CLASS_NAMES.listLine} ${RENDERED_MARKDOWN_CLASS_NAMES.orderedListLine} tabs-cm-rendered-list-line tabs-cm-rendered-ordered-list-line`,
        })
        addMarkerWidget(
          plan.replacements,
          markerFrom,
          markerTo,
          `${orderedMatch[2]}.`,
          `${RENDERED_MARKDOWN_CLASS_NAMES.listMarker} tabs-cm-list-marker tabs-cm-ordered-marker`,
        )
      }
    }

    const quoteMatch = text.match(/^(\s{0,3})>\s?/)
    if (quoteMatch) {
      const markerFrom = line.from + quoteMatch[1].length
      const markerTo = line.from + quoteMatch[0].length
      plan.lines.push({
        from: line.from,
        className: `${RENDERED_MARKDOWN_CLASS_NAMES.blockquoteLine} tabs-cm-rendered-blockquote-line`,
      })
      addHiddenSyntax(plan.replacements, markerFrom, markerTo)
    }

    if (trimmed.length > 0) decorateLineInlineMarkdown(line, plan, headingTextStart)
  }

  return plan
}

export function buildRenderedMarkdownTableBlockPlanFromLines(
  lines: RenderedMarkdownLine[],
  options: RenderedMarkdownDecorationPlanOptions = {},
): RenderedMarkdownTableBlockPlan[] {
  return findTableBlocks(lines)
    .map((block) => {
      const start = lines[block.startIndex]
      const end = lines[block.endIndex]
      return { from: start.from, to: end.to, rows: block.rows }
    })
    .filter((block) => !rangeIntersectsPointOrRange(block.from, block.to, options.editableRanges ?? []))
}

export function getRenderedMarkdownEditableTableKey(
  blocks: RenderedMarkdownTableBlockPlan[],
  editableRanges: Array<{ from: number; to: number }> = [],
) {
  return blocks
    .map((block, index) => (rangeIntersectsPointOrRange(block.from, block.to, editableRanges) ? String(index) : ''))
    .filter(Boolean)
    .join(',')
}

function filterRenderableTableBlocks(
  blocks: RenderedMarkdownTableBlockPlan[],
  editableRanges: Array<{ from: number; to: number }> = [],
) {
  return blocks.filter((block) => !rangeIntersectsPointOrRange(block.from, block.to, editableRanges))
}

class InlineReplacementWidget extends WidgetType {
  private readonly label: string
  private readonly className: string

  constructor(label: string, className: string) {
    super()
    this.label = label
    this.className = className
  }

  eq(other: InlineReplacementWidget) {
    return this.label === other.label && this.className === other.className
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = this.className
    span.textContent = this.label
    return span
  }

  ignoreEvent() {
    return false
  }
}

function createDecorationFromReplacement(replacement: RenderedMarkdownReplacementPlan) {
  if (replacement.kind === 'hr') {
    return Decoration.replace({
      widget: new InlineReplacementWidget('', replacement.className ?? 'tabs-cm-rendered-hr'),
    })
  }
  if (replacement.kind === 'list-marker' || replacement.kind === 'task-marker') {
    return Decoration.replace({
      widget: new InlineReplacementWidget(replacement.label ?? '', replacement.className ?? 'tabs-cm-list-marker'),
    })
  }
  return Decoration.replace({})
}

export function getRenderedMarkdownTableCellParts(source: string): RenderedMarkdownTableCellPart[] {
  const normalized = String(source ?? '')
  const parts: RenderedMarkdownTableCellPart[] = []
  let cursor = 0
  MARKDOWN_LINK_RE.lastIndex = 0
  for (const match of normalized.matchAll(MARKDOWN_LINK_RE)) {
    const matchIndex = match.index ?? 0
    if (matchIndex > cursor) parts.push({ kind: 'text', text: normalized.slice(cursor, matchIndex) })
    const label = match[2] || match[3] || ''
    const destination = match[3] ?? ''
    parts.push({
      kind: match[1] ? 'image' : 'link',
      text: label,
      url: destination,
    })
    cursor = matchIndex + match[0].length
  }
  if (cursor < normalized.length) parts.push({ kind: 'text', text: normalized.slice(cursor) })
  return parts
}

function appendTableCellContent(parent: HTMLElement, source: string) {
  for (const part of getRenderedMarkdownTableCellParts(source)) {
    if (part.kind === 'text') {
      parent.append(document.createTextNode(part.text))
      continue
    }
    const span = document.createElement('span')
    span.className = part.kind === 'image'
      ? `${RENDERED_MARKDOWN_CLASS_NAMES.imageLabel} tabs-cm-rendered-image-label`
      : `${RENDERED_MARKDOWN_CLASS_NAMES.link} tabs-cm-rendered-link`
    if (part.url) {
      span.setAttribute(part.kind === 'image' ? 'data-tabs-image-url' : 'data-tabs-link-url', part.url)
    }
    span.textContent = part.text
    parent.append(span)
  }
}

class TablePreviewWidget extends WidgetType {
  private readonly rows: string[][]
  private readonly signature: string

  constructor(rows: string[][]) {
    super()
    this.rows = rows
    this.signature = JSON.stringify(rows)
  }

  eq(other: TablePreviewWidget) {
    return this.signature === other.signature
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'tabs-cm-rendered-table-wrap'
    const table = document.createElement('table')
    table.className = `${RENDERED_MARKDOWN_CLASS_NAMES.table} tabs-cm-rendered-table`
    this.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr')
      row.forEach((cell) => {
        const tagName = rowIndex === 0 ? 'th' : 'td'
        const cellElement = document.createElement(tagName)
        appendTableCellContent(cellElement, cell)
        tr.append(cellElement)
      })
      table.append(tr)
    })
    wrap.append(table)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

function getCodeMirrorSelectionRanges(state: EditorState) {
  return state.selection.ranges.map((range) => ({ from: range.from, to: range.to }))
}

function createCodeMirrorTablePreviewDecorationSet(
  blocks: RenderedMarkdownTableBlockPlan[],
  selectionRanges: Array<{ from: number; to: number }>,
): DecorationSet {
  const ranges = filterRenderableTableBlocks(blocks, selectionRanges).map((block) =>
    Decoration.replace({
      widget: new TablePreviewWidget(block.rows),
      block: true,
    }).range(block.from, block.to),
  )
  return Decoration.set(ranges, true)
}

function getCodeMirrorVisibleRanges(view: EditorView) {
  return view.visibleRanges.map((range) => ({ from: range.from, to: range.to }))
}

function buildCodeMirrorTablePreviewState(
  view: EditorView,
  diagnosticAisleId?: string,
): CodeMirrorTablePreviewState {
  return measureCodeMirrorOperation('aisle editor CodeMirror table widget rebuild', diagnosticAisleId, () => {
    const selectionRanges = getCodeMirrorSelectionRanges(view.state)
    const visibleRanges = getCodeMirrorVisibleRanges(view)
    const blocks = buildRenderedMarkdownTableBlockPlanFromLines(collectBufferedRenderedMarkdownLines(view))
      .filter((block) =>
        rangeIntersectsPointOrRange(block.from, block.to, visibleRanges)
        || rangeIntersectsPointOrRange(block.from, block.to, selectionRanges),
      )
    return {
      blocks,
      editableTableKey: getRenderedMarkdownEditableTableKey(blocks, selectionRanges),
      decorations: createCodeMirrorTablePreviewDecorationSet(blocks, selectionRanges),
    }
  })
}

function createCodeMirrorTablePreviewDecorations(diagnosticAisleId?: string) {
  return ViewPlugin.fromClass(
    class {
      previewState: CodeMirrorTablePreviewState

      constructor(view: EditorView) {
        this.previewState = buildCodeMirrorTablePreviewState(view, diagnosticAisleId)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.previewState = buildCodeMirrorTablePreviewState(update.view, diagnosticAisleId)
          return
        }
        if (!update.selectionSet) return
        const selectionRanges = getCodeMirrorSelectionRanges(update.state)
        const editableTableKey = getRenderedMarkdownEditableTableKey(this.previewState.blocks, selectionRanges)
        if (editableTableKey === this.previewState.editableTableKey) return
        this.previewState = measureCodeMirrorOperation('aisle editor CodeMirror table widget rebuild', diagnosticAisleId, () => ({
          blocks: this.previewState.blocks,
          editableTableKey,
          decorations: createCodeMirrorTablePreviewDecorationSet(this.previewState.blocks, selectionRanges),
        }))
      }
    },
    {
      decorations: (plugin) => plugin.previewState.decorations,
    },
  )
}

function getFenceStateBeforeLine(view: EditorView, lineNumber: number) {
  let inFence = false
  let fenceMarker = ''
  for (let number = 1; number < lineNumber; number += 1) {
    const text = view.state.doc.line(number).text
    const match = text.match(FENCE_RE)
    if (!match) continue
    const marker = match[1]
    const markerChar = marker[0]
    if (!inFence) {
      inFence = true
      fenceMarker = markerChar
    } else if (markerChar === fenceMarker) {
      inFence = false
      fenceMarker = ''
    }
  }
  return { inFence, fenceMarker }
}

function collectVisibleRenderedMarkdownLines(view: EditorView): RenderedMarkdownLine[] {
  const lines: RenderedMarkdownLine[] = []
  const seenLineNumbers = new Set<number>()
  for (const visibleRange of view.visibleRanges) {
    let position = visibleRange.from
    let fenceState: { inFence: boolean; fenceMarker: string } | null = null
    while (position <= visibleRange.to) {
      const line = view.state.doc.lineAt(position)
      if (seenLineNumbers.has(line.number)) {
        position = line.to + 1
        continue
      }
      seenLineNumbers.add(line.number)
      if (!fenceState) fenceState = getFenceStateBeforeLine(view, line.number)
      const fenceMatch = line.text.match(FENCE_RE)
      const isInsideFence = fenceState.inFence
      lines.push({
        from: line.from,
        to: line.to,
        number: line.number,
        text: line.text,
        isInsideFence,
        isFenceBoundary: Boolean(fenceMatch),
      })
      if (fenceMatch) {
        const marker = fenceMatch[1]
        const markerChar = marker[0]
        if (!fenceState.inFence) {
          fenceState = { inFence: true, fenceMarker: markerChar }
        } else if (markerChar === fenceState.fenceMarker) {
          fenceState = { inFence: false, fenceMarker: '' }
        }
      }
      position = line.to + 1
    }
  }
  return lines
}

function collectBufferedRenderedMarkdownLines(
  view: EditorView,
  contextLineCount = CODEMIRROR_TABLE_PREVIEW_CONTEXT_LINE_COUNT,
): RenderedMarkdownLine[] {
  const lineRanges = view.visibleRanges
    .map((visibleRange) => {
      const fromLine = view.state.doc.lineAt(visibleRange.from).number
      const toLine = view.state.doc.lineAt(Math.max(visibleRange.from, Math.min(visibleRange.to, view.state.doc.length))).number
      return {
        from: Math.max(1, fromLine - contextLineCount),
        to: Math.min(view.state.doc.lines, toLine + contextLineCount),
      }
    })
    .sort((left, right) => left.from - right.from || left.to - right.to)

  const mergedLineRanges: Array<{ from: number; to: number }> = []
  for (const lineRange of lineRanges) {
    const previous = mergedLineRanges.at(-1)
    if (previous && lineRange.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, lineRange.to)
      continue
    }
    mergedLineRanges.push({ ...lineRange })
  }

  const lines: RenderedMarkdownLine[] = []
  const seenLineNumbers = new Set<number>()
  for (const lineRange of mergedLineRanges) {
    let fenceState = getFenceStateBeforeLine(view, lineRange.from)
    for (let lineNumber = lineRange.from; lineNumber <= lineRange.to; lineNumber += 1) {
      if (seenLineNumbers.has(lineNumber)) continue
      seenLineNumbers.add(lineNumber)
      const line = view.state.doc.line(lineNumber)
      const fenceMatch = line.text.match(FENCE_RE)
      const isInsideFence = fenceState.inFence
      lines.push({
        from: line.from,
        to: line.to,
        number: line.number,
        text: line.text,
        isInsideFence,
        isFenceBoundary: Boolean(fenceMatch),
      })
      if (fenceMatch) {
        const marker = fenceMatch[1]
        const markerChar = marker[0]
        if (!fenceState.inFence) {
          fenceState = { inFence: true, fenceMarker: markerChar }
        } else if (markerChar === fenceState.fenceMarker) {
          fenceState = { inFence: false, fenceMarker: '' }
        }
      }
    }
  }
  return lines
}

function buildCodeMirrorLiveDecorations(view: EditorView, diagnosticAisleId?: string): DecorationSet {
  return measureCodeMirrorOperation('aisle editor CodeMirror decoration rebuild', diagnosticAisleId, () => {
    const plan = buildRenderedMarkdownDecorationPlanFromLines(collectVisibleRenderedMarkdownLines(view))
    const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [
      ...plan.lines.map((line) => ({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ class: line.className }),
      })),
      ...plan.marks.map((mark) => ({
        from: mark.from,
        to: mark.to,
        decoration: Decoration.mark({ class: mark.className, attributes: mark.attrs }),
      })),
      ...plan.replacements.map((replacement) => ({
        from: replacement.from,
        to: replacement.to,
        decoration: createDecorationFromReplacement(replacement),
      })),
    ]

    return Decoration.set(
      ranges
        .sort((left, right) => left.from - right.from || left.to - right.to)
        .map((range) => range.decoration.range(range.from, range.to)),
      true,
    )
  })
}

function createCodeMirrorLiveDecorations(diagnosticAisleId?: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildCodeMirrorLiveDecorations(view, diagnosticAisleId)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildCodeMirrorLiveDecorations(update.view, diagnosticAisleId)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  )
}

export function createCodeMirrorMarkdownEditor({
  root,
  markdown: markdownText,
  onChange,
  onFocus,
  diagnosticAisleId,
}: CodeMirrorMarkdownEditorOptions): Editor {
  const mountStartedAt = nowMs()
  let firstFocusRecorded = false
  let pendingChangeState: EditorState | null = null
  let pendingChangeTimer: ReturnType<typeof setTimeout> | null = null
  const flushPendingCodeMirrorChange = (reason: string) => {
    if (pendingChangeTimer !== null) {
      clearTimeout(pendingChangeTimer)
      pendingChangeTimer = null
    }
    const state = pendingChangeState
    pendingChangeState = null
    if (!state) return
    measureCodeMirrorOperation(`aisle editor CodeMirror change handler:${reason}`, diagnosticAisleId, () => {
      onChange(state.doc.toString())
    })
  }
  const scheduleCodeMirrorChange = (state: EditorState) => {
    pendingChangeState = state
    if (pendingChangeTimer !== null) clearTimeout(pendingChangeTimer)
    pendingChangeTimer = setTimeout(() => flushPendingCodeMirrorChange('debounced'), CODEMIRROR_MARKDOWN_CHANGE_DEBOUNCE_MS)
  }
  root.classList.add('tabs-codemirror-host')
  const view = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: markdownText,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ class: `${RENDERED_MARKDOWN_SURFACE_CLASS} tabs-codemirror-rendered-markdown` }),
        createCodeMirrorTablePreviewDecorations(diagnosticAisleId),
        createCodeMirrorLiveDecorations(diagnosticAisleId),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            scheduleCodeMirrorChange(update.state)
          }
          if (update.focusChanged && update.view.hasFocus) {
            if (!firstFocusRecorded) {
              firstFocusRecorded = true
              logSlowOperation(
                getCodeMirrorTimingLabel('aisle editor CodeMirror first focus', diagnosticAisleId),
                nowMs() - mountStartedAt,
              )
            }
            onFocus()
          }
          if (update.focusChanged && !update.view.hasFocus) {
            flushPendingCodeMirrorChange('blur')
          }
        }),
      ],
    }),
  })

  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      recordDiagnosticEvent('aisle-editor', 'codemirror-first-paint', {
        level: 'info',
        durationMs: nowMs() - mountStartedAt,
        details: {
          aisleId: diagnosticAisleId,
          markdownBytes: String(markdownText ?? '').length,
          lineCount: view.state.doc.lines,
        },
      })
    })
  }

  const replaceSelection = (text: string) => {
    const changes = view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    }))
    view.dispatch({ ...changes, scrollIntoView: true })
  }

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const changes = view.state.changeByRange((range) => {
      const selected = view.state.doc.sliceString(range.from, range.to)
      const insert = `${prefix}${selected}${suffix}`
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + prefix.length, range.from + prefix.length + selected.length),
      }
    })
    view.dispatch({ ...changes, scrollIntoView: true })
  }

  const handle: CodeMirrorMarkdownEditorHandle = {
    __tabsEditorCore: 'codemirror',
    focus: () => view.focus(),
    focusAtClientPoint: ({ clientX, clientY }) => {
      const position = view.posAtCoords({ x: clientX, y: clientY })
      if (typeof position !== 'number') {
        view.focus()
        return false
      }
      return restoreCodeMirrorSelection(view, { anchor: position, head: position })
    },
    destroy: () => {
      flushPendingCodeMirrorChange('destroy')
      root.classList.remove('tabs-codemirror-host')
      view.destroy()
    },
    getCursorSelection: () => getCodeMirrorCursorSelection(view),
    getDocSize: () => getCodeMirrorDocSize(view),
    getMarkdown: () => {
      flushPendingCodeMirrorChange('snapshot')
      return view.state.doc.toString()
    },
    restoreCursorSelection: (selection, options) => restoreCodeMirrorSelection(view, selection, options),
    setMarkdown: (nextMarkdown: string, cursorToEnd = false) => {
      flushPendingCodeMirrorChange('set-markdown')
      const next = String(nextMarkdown ?? '')
      const position = cursorToEnd ? next.length : Math.min(view.state.selection.main.from, next.length)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: EditorSelection.cursor(position),
        scrollIntoView: true,
      })
    },
    insertText: replaceSelection,
    exec: (command: string, payload?: CommandPayload) => {
      if (command === 'undo') {
        undo(view)
        return
      }
      if (command === 'redo') {
        redo(view)
        return
      }
      if (command === 'bold') {
        wrapSelection('**')
        return
      }
      if (command === 'italic') {
        wrapSelection('*')
        return
      }
      if (command === 'strike') {
        wrapSelection('~~')
        return
      }
      if (command === 'highlight') {
        wrapSelection('==')
        return
      }
      if (command === 'code') {
        wrapSelection('`')
        return
      }
      if (command === 'codeBlock') {
        wrapSelection('```\n', '\n```')
        return
      }
      if (command === 'heading') {
        toggleHeading(view, payload)
        return
      }
      if (command === 'blockQuote') {
        prefixSelectedLines(view, () => '> ')
        return
      }
      if (command === 'bulletList' || command === 'dashList') {
        prefixSelectedLines(view, () => '- ')
        return
      }
      if (command === 'orderedList') {
        prefixSelectedLines(view, (_line, index) => `${index + 1}. `)
        return
      }
      if (command === 'taskList') {
        prefixSelectedLines(view, () => '- [ ] ')
        return
      }
      if (command === 'blockIndent' || command === 'indent') {
        indentSelectedLines(view)
        return
      }
      if (command === 'removeBlockIndent' || command === 'outdent') {
        outdentSelectedLines(view)
        return
      }
      if (command === 'hr') {
        replaceSelection('\n\n---\n\n')
        return
      }
      if (command === 'addTable') {
        replaceSelection('\n\n|  |  |\n| --- | --- |\n|  |  |\n')
        return
      }
      if (command === 'addImage') {
        const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : ''
        const altText = typeof payload?.altText === 'string' ? payload.altText : 'image'
        if (imageUrl) replaceSelection(`![${altText}](${imageUrl})`)
        return
      }
      if (command === 'link') {
        const linkUrl = typeof payload?.linkUrl === 'string' ? payload.linkUrl : ''
        const selected = handle.getSelectedText()
        if (linkUrl) replaceSelection(`[${selected || linkUrl}](${linkUrl})`)
        return
      }
      if (command === 'clear') {
        clearSelectionMarkdown(view)
      }
    },
    getSelectedText: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
  }

  return handle as unknown as Editor
}
