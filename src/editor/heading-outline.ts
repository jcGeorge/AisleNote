export type HeadingOutlineItem = {
  aisleId: string
  key: string
  level: number
  text: string
  occurrence: number
  start?: number
  end?: number
}

export type HeadingCollapseBlock = {
  start: number
  end: number
  type: string
  text: string
  isBlankParagraph: boolean
  heading: HeadingOutlineItem | null
}

export type HeadingCollapseRange = {
  from: number
  to: number
}

export type HeadingCollapseSection = {
  heading: HeadingOutlineItem
  boundaryHeading: HeadingOutlineItem | null
  hasRetainedBlankParagraphsBeforeBoundary: boolean
  hiddenRanges: HeadingCollapseRange[]
}

const FENCE_BOUNDARY_RE = /^\s*(`{3,}|~{3,})/
const MARKDOWN_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/
const EMPTY_EDITOR_PLACEHOLDER_RE = /\u200b/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeHeadingText(value: unknown): string {
  return String(value ?? '')
    .replace(EMPTY_EDITOR_PLACEHOLDER_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripClosingHeadingMarkers(text: string) {
  return text.replace(/[ \t]+#+[ \t]*$/, '')
}

function encodeHeadingKeySegment(value: string) {
  return encodeURIComponent(value)
}

export function buildHeadingCollapseKey(
  aisleId: string,
  level: number,
  text: string,
  occurrence: number,
): string {
  return [
    encodeHeadingKeySegment(aisleId),
    `h${Math.min(6, Math.max(1, level))}`,
    String(Math.max(0, occurrence)),
    encodeHeadingKeySegment(normalizeHeadingText(text)),
  ].join('|')
}

function createHeadingFactory(aisleId: string) {
  const occurrences = new Map<string, number>()

  return (level: number, rawText: unknown, position?: { start: number; end: number }): HeadingOutlineItem => {
    const text = normalizeHeadingText(rawText)
    const occurrenceBaseKey = `${level}\n${text}`
    const occurrence = occurrences.get(occurrenceBaseKey) ?? 0
    occurrences.set(occurrenceBaseKey, occurrence + 1)
    return {
      aisleId,
      level,
      text,
      occurrence,
      key: buildHeadingCollapseKey(aisleId, level, text, occurrence),
      ...(position ? { start: position.start, end: position.end } : {}),
    }
  }
}

function getNextFenceState(line: string, activeFence: string | null): string | null {
  const match = line.match(FENCE_BOUNDARY_RE)
  if (!match) return activeFence
  const marker = match[1][0]
  if (!activeFence) return marker
  return activeFence === marker ? null : activeFence
}

export function getHeadingOutlineFromMarkdown(aisleId: string, markdown: string): HeadingOutlineItem[] {
  const headings: HeadingOutlineItem[] = []
  const createHeading = createHeadingFactory(aisleId)
  let activeFence: string | null = null

  String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line) => {
      const fenceBeforeLine = activeFence
      activeFence = getNextFenceState(line, activeFence)
      if (fenceBeforeLine) return

      const match = line.match(MARKDOWN_HEADING_RE)
      if (!match) return
      const level = match[1].length
      const text = stripClosingHeadingMarkers(match[2] ?? '')
      headings.push(createHeading(level, text))
    })

  return headings
}

export function getHeadingBoundaryGapsFromMarkdown(aisleId: string, markdown: string): Map<string, number> {
  const boundaryGaps = new Map<string, number>()
  const createHeading = createHeadingFactory(aisleId)
  let activeFence: string | null = null
  let blankLineRun = 0

  String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line) => {
      const fenceBeforeLine = activeFence
      activeFence = getNextFenceState(line, activeFence)
      if (fenceBeforeLine) {
        blankLineRun = 0
        return
      }

      if (activeFence) {
        blankLineRun = 0
        return
      }

      if (line.trim().length === 0) {
        blankLineRun += 1
        return
      }

      const match = line.match(MARKDOWN_HEADING_RE)
      if (match) {
        const level = match[1].length
        const text = stripClosingHeadingMarkers(match[2] ?? '')
        const heading = createHeading(level, text)
        if (blankLineRun > 0) {
          boundaryGaps.set(heading.key, blankLineRun)
        }
      }

      blankLineRun = 0
    })

  return boundaryGaps
}

export function getHeadingCollapseBlocksFromDoc(aisleId: string, doc: unknown): HeadingCollapseBlock[] {
  if (!isRecord(doc) || typeof doc.forEach !== 'function') return []

  const blocks: HeadingCollapseBlock[] = []
  const createHeading = createHeadingFactory(aisleId)

  doc.forEach((node: unknown, offset: number) => {
    if (!isRecord(node)) return
    const type = isRecord(node.type) && typeof node.type.name === 'string' ? node.type.name : ''
    const nodeSize = typeof node.nodeSize === 'number' ? node.nodeSize : 0
    const text = String(node.textContent ?? '')
    const start = offset
    const end = offset + nodeSize
    const level = type === 'heading' && isRecord(node.attrs) ? Number(node.attrs.level) || 1 : null
    const normalizedLevel = level === null ? null : Math.min(6, Math.max(1, level))
    const isBlankParagraph = type === 'paragraph' && normalizeHeadingText(text).length === 0
    const heading =
      normalizedLevel === null
        ? null
        : createHeading(normalizedLevel, text, {
            start,
            end,
          })

    blocks.push({
      start,
      end,
      type,
      text,
      isBlankParagraph,
      heading,
    })
  })

  return blocks
}

export function getHeadingOutlineFromDoc(aisleId: string, doc: unknown): HeadingOutlineItem[] {
  return getHeadingCollapseBlocksFromDoc(aisleId, doc)
    .map((block) => block.heading)
    .filter((heading): heading is HeadingOutlineItem => heading !== null)
}

export function getHeadingCollapseSections(
  blocks: HeadingCollapseBlock[],
  collapsedHeadingKeys: ReadonlySet<string>,
): HeadingCollapseSection[] {
  const sections: HeadingCollapseSection[] = []

  blocks.forEach((block, index) => {
    const heading = block.heading
    if (!heading || !collapsedHeadingKeys.has(heading.key)) return

    let boundaryIndex = blocks.length
    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const nextHeading = blocks[nextIndex].heading
      if (nextHeading && nextHeading.level <= heading.level) {
        boundaryIndex = nextIndex
        break
      }
    }

    let hiddenEndIndex = boundaryIndex
    if (boundaryIndex < blocks.length) {
      while (hiddenEndIndex > index + 1 && blocks[hiddenEndIndex - 1].isBlankParagraph) {
        hiddenEndIndex -= 1
      }
    }

    sections.push({
      heading,
      boundaryHeading: boundaryIndex < blocks.length ? blocks[boundaryIndex].heading : null,
      hasRetainedBlankParagraphsBeforeBoundary: hiddenEndIndex < boundaryIndex,
      hiddenRanges: blocks.slice(index + 1, hiddenEndIndex).map((candidate) => ({
        from: candidate.start,
        to: candidate.end,
      })),
    })
  })

  return sections
}
