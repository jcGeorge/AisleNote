import { Fragment, memo, type CSSProperties, type ReactNode } from 'react'
import {
  buildRenderedMarkdownDecorationPlanFromLines,
  buildRenderedMarkdownTableBlockPlanFromLines,
  getRenderedMarkdownTableCellParts,
  type RenderedMarkdownDecorationPlan,
  type RenderedMarkdownLine,
  type RenderedMarkdownTableBlockPlan,
} from '../../editor/codemirror-markdown-editor'
import { RENDERED_MARKDOWN_CLASS_NAMES } from '../../editor/rendered-markdown-surface'
import {
  BLOCK_INDENT_TOKEN,
  EDITOR_BLANK_LINE_PLACEHOLDER,
  countBlockIndentLevels,
} from '../../markdown/markdown-utils'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'

const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/

type RenderedMarkdownMark = RenderedMarkdownDecorationPlan['marks'][number]
type RenderedMarkdownReplacement = RenderedMarkdownDecorationPlan['replacements'][number]

type PreviewLineNode = {
  line: RenderedMarkdownLine
  plan: RenderedMarkdownDecorationPlan
}

type PreviewLineStyle = CSSProperties & {
  '--tabs-block-indent-level'?: number
}

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined
}

function collectRenderedMarkdownLines(markdown: string): RenderedMarkdownLine[] {
  const lines: RenderedMarkdownLine[] = []
  let from = 0
  let fenceState = { inFence: false, fenceMarker: '' }

  String(markdown ?? '').split('\n').forEach((text, index) => {
    const fenceMatch = text.match(FENCE_RE)
    const isInsideFence = fenceState.inFence
    lines.push({
      from,
      to: from + text.length,
      number: index + 1,
      text,
      isInsideFence,
      isFenceBoundary: Boolean(fenceMatch),
    })
    from += text.length + 1

    if (!fenceMatch) return
    const marker = fenceMatch[1]
    const markerChar = marker[0]
    if (!fenceState.inFence) {
      fenceState = { inFence: true, fenceMarker: markerChar }
    } else if (markerChar === fenceState.fenceMarker) {
      fenceState = { inFence: false, fenceMarker: '' }
    }
  })

  return lines
}

function getBlockIndentReplacement(line: RenderedMarkdownLine): RenderedMarkdownReplacement | null {
  const blockIndentLevel = countBlockIndentLevels(line.text)
  if (blockIndentLevel <= 0) return null
  const to = line.from + blockIndentLevel * BLOCK_INDENT_TOKEN.length
  return { from: line.from, to, kind: 'hidden' }
}

function getPreviewLineClassName(line: RenderedMarkdownLine, plan: RenderedMarkdownDecorationPlan) {
  const lineClasses = plan.lines
    .filter((linePlan) => linePlan.from === line.from)
    .map((linePlan) => linePlan.className)
  const blockIndentClassName = countBlockIndentLevels(line.text) > 0 ? 'tabs-block-indent' : undefined
  return mergeClassNames('cm-line', ...lineClasses, blockIndentClassName)
}

function getPreviewLineStyle(line: RenderedMarkdownLine): PreviewLineStyle | undefined {
  const blockIndentLevel = countBlockIndentLevels(line.text)
  return blockIndentLevel > 0 ? { '--tabs-block-indent-level': blockIndentLevel } : undefined
}

function getMarksForSegment(marks: RenderedMarkdownMark[], from: number, to: number) {
  return marks.filter((mark) => mark.from <= from && mark.to >= to)
}

function getReplacementAt(
  replacements: RenderedMarkdownReplacement[],
  position: number,
): RenderedMarkdownReplacement | null {
  return replacements.find((replacement) => replacement.from === position) ?? null
}

function getCoveringReplacement(
  replacements: RenderedMarkdownReplacement[],
  position: number,
): RenderedMarkdownReplacement | null {
  return replacements.find((replacement) => replacement.from < position && replacement.to > position) ?? null
}

function getNextBoundary(
  position: number,
  lineTo: number,
  marks: RenderedMarkdownMark[],
  replacements: RenderedMarkdownReplacement[],
) {
  let next = lineTo
  for (const mark of marks) {
    if (mark.from > position && mark.from < next) next = mark.from
    if (mark.to > position && mark.to < next) next = mark.to
  }
  for (const replacement of replacements) {
    if (replacement.from > position && replacement.from < next) next = replacement.from
    if (replacement.to > position && replacement.to < next) next = replacement.to
  }
  return next
}

function renderWidgetReplacement(replacement: RenderedMarkdownReplacement, key: string): ReactNode {
  if (replacement.kind === 'hidden') return null
  return (
    <span key={key} className={replacement.className}>
      {replacement.label ?? ''}
    </span>
  )
}

function renderLineTextSegment(
  line: RenderedMarkdownLine,
  marks: RenderedMarkdownMark[],
  from: number,
  to: number,
  key: string,
): ReactNode {
  const text = line.text.slice(from - line.from, to - line.from)
  if (!text) return null
  const activeMarks = getMarksForSegment(marks, from, to)
  if (activeMarks.length === 0) return text

  const attrs = activeMarks.reduce<Record<string, string>>((nextAttrs, mark) => ({
    ...nextAttrs,
    ...(mark.attrs ?? {}),
  }), {})
  return (
    <span
      key={key}
      className={activeMarks.map((mark) => mark.className).join(' ')}
      {...attrs}
    >
      {text}
    </span>
  )
}

function renderPreviewLineContent(line: RenderedMarkdownLine, plan: RenderedMarkdownDecorationPlan): ReactNode {
  const blockIndentReplacement = getBlockIndentReplacement(line)
  const replacements = [
    ...plan.replacements.filter((replacement) => replacement.from < line.to && replacement.to > line.from),
    ...(blockIndentReplacement ? [blockIndentReplacement] : []),
  ].sort((left, right) => left.from - right.from || left.to - right.to)
  const marks = plan.marks
    .filter((mark) => mark.from < line.to && mark.to > line.from)
    .sort((left, right) => left.from - right.from || left.to - right.to)
  const children: ReactNode[] = []
  let position = line.from

  while (position < line.to) {
    const replacementAtPosition = getReplacementAt(replacements, position)
    if (replacementAtPosition) {
      const rendered = renderWidgetReplacement(replacementAtPosition, `replacement-${position}`)
      if (rendered) children.push(rendered)
      position = Math.max(position + 1, replacementAtPosition.to)
      continue
    }

    const coveringReplacement = getCoveringReplacement(replacements, position)
    if (coveringReplacement) {
      position = Math.max(position + 1, coveringReplacement.to)
      continue
    }

    const next = getNextBoundary(position, line.to, marks, replacements)
    const rendered = renderLineTextSegment(line, marks, position, next, `text-${position}`)
    if (rendered) children.push(rendered)
    position = Math.max(position + 1, next)
  }

  return children.length > 0 ? children : EDITOR_BLANK_LINE_PLACEHOLDER
}

function CodeMirrorPreviewLine({ line, plan }: PreviewLineNode) {
  return (
    <div className={getPreviewLineClassName(line, plan)} style={getPreviewLineStyle(line)}>
      {renderPreviewLineContent(line, plan)}
    </div>
  )
}

function CodeMirrorPreviewTable({ block }: { block: RenderedMarkdownTableBlockPlan }) {
  return (
    <div className="tabs-cm-rendered-table-wrap">
      <table className={`${RENDERED_MARKDOWN_CLASS_NAMES.table} tabs-cm-rendered-table`}>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => {
                const CellTag = rowIndex === 0 ? 'th' : 'td'
                return (
                  <CellTag key={`cell-${cellIndex}`}>
                    {getRenderedMarkdownTableCellParts(cell).map((part, partIndex) => {
                      if (part.kind === 'text') return part.text
                      const attrName = part.kind === 'image' ? 'data-tabs-image-url' : 'data-tabs-link-url'
                      return (
                        <span
                          key={`cell-part-${partIndex}`}
                          className={
                            part.kind === 'image'
                              ? `${RENDERED_MARKDOWN_CLASS_NAMES.imageLabel} tabs-cm-rendered-image-label`
                              : `${RENDERED_MARKDOWN_CLASS_NAMES.link} tabs-cm-rendered-link`
                          }
                          {...(part.url ? { [attrName]: part.url } : {})}
                        >
                          {part.text}
                        </span>
                      )
                    })}
                  </CellTag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeMirrorMarkdownSegmentPreview({ markdown }: { markdown: string }) {
  const lines = collectRenderedMarkdownLines(markdown)
  const plan = buildRenderedMarkdownDecorationPlanFromLines(lines)
  const tableBlocks = buildRenderedMarkdownTableBlockPlanFromLines(lines)
  const tableBlocksByStart = new Map(tableBlocks.map((block) => [block.from, block]))
  const nodes: ReactNode[] = []
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]
    const tableBlock = tableBlocksByStart.get(line.from)
    if (tableBlock) {
      nodes.push(<CodeMirrorPreviewTable key={`table-${tableBlock.from}`} block={tableBlock} />)
      lineIndex += 1
      while (lineIndex < lines.length && lines[lineIndex].from >= tableBlock.from && lines[lineIndex].to <= tableBlock.to) {
        lineIndex += 1
      }
      continue
    }

    nodes.push(
      <CodeMirrorPreviewLine
        key={`line-${line.from}`}
        line={line}
        plan={plan}
      />,
    )
    lineIndex += 1
  }

  return <>{nodes}</>
}

export const CodeMirrorMarkdownPreview = memo(function CodeMirrorMarkdownPreview({ markdown }: { markdown: string }) {
  return getAislePreviewSegments(markdown).map((segment, segmentIndex) => (
    <Fragment key={`${segment.type}-${segmentIndex}`}>
      {segment.type === 'markdown' ? (
        <CodeMirrorMarkdownSegmentPreview markdown={segment.markdown} />
      ) : (
        <div className="aisle-edit-context-preview">
          <span className="aisle-edit-context-preview-label">note preview</span>
          <span className="aisle-edit-context-preview-title">{segment.label}</span>
        </div>
      )}
    </Fragment>
  ))
})
