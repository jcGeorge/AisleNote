export type ReorderListKind = 'task' | 'bullet' | 'dash' | 'numbered'

export const EMPTY_LIST_ITEM_PLACEHOLDER = '\u200b'

type ParsedListLine = {
  lineIndex: number
  indent: string
  indentLength: number
  kind: ReorderListKind
  delimiter: string
  text: string
  normalizedText: string
  parentLineIndex: number | null
  clusterIndex: number
}

type ParsedListGroup = {
  key: string
  kind: ReorderListKind
  indent: string
  indentLength: number
  parentLineIndex: number | null
  clusterIndex: number
  itemLineIndices: number[]
  itemTexts: string[]
}

export function normalizeListReorderText(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getListMarkdownLineText(line: string, kind: ReorderListKind): string | null {
  if (kind === 'task') {
    const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+(.*)$/)
    return match ? normalizeListReorderText(match[1]) : null
  }
  if (kind === 'dash') {
    if (/^\s*-{3,}\s*$/.test(line)) return null
    const match = line.match(/^\s*-\s*(.*)$/)
    if (match?.[1] && /^\[[ xX]\]\s*/.test(match[1])) return null
    return match ? normalizeListReorderText(match[1]) : null
  }
  if (kind === 'bullet') {
    if (/^\s*\*{3,}\s*$/.test(line)) return null
    const match = line.match(/^\s*[*+]\s*(.*)$/)
    if (match?.[1] && /^\[[ xX]\]\s*/.test(match[1])) return null
    return match ? normalizeListReorderText(match[1]) : null
  }
  const match = line.match(/^\s*\d+[.)]\s+(?!\[[ xX]\]\s)(.*)$/)
  return match ? normalizeListReorderText(match[1]) : null
}

function parseListMarkdownLine(line: string, lineIndex: number): Omit<ParsedListLine, 'parentLineIndex' | 'clusterIndex'> | null {
  const taskMatch = line.match(/^(\s*)((?:[-*+]|\d+[.)]))\s+\[[ xX]\]\s*(.*)$/)
  if (taskMatch) {
    return {
      lineIndex,
      indent: taskMatch[1],
      indentLength: taskMatch[1].length,
      kind: 'task',
      delimiter: taskMatch[2],
      text: taskMatch[3] ?? '',
      normalizedText: normalizeListReorderText(taskMatch[3] ?? ''),
    }
  }

  const orderedMatch = line.match(/^(\s*)(\d+[.)])\s+(?!\[[ xX]\]\s)(.*)$/)
  if (orderedMatch) {
    return {
      lineIndex,
      indent: orderedMatch[1],
      indentLength: orderedMatch[1].length,
      kind: 'numbered',
      delimiter: orderedMatch[2],
      text: orderedMatch[3] ?? '',
      normalizedText: normalizeListReorderText(orderedMatch[3] ?? ''),
    }
  }

  const bulletMatch = line.match(/^(\s*)([-*+])\s*(.*)$/)
  if (!bulletMatch) return null
  if (bulletMatch[2] === '-' && /^\s*-{2,}\s*$/.test(line)) return null
  if (bulletMatch[2] === '*' && /^\s*\*{2,}\s*$/.test(line)) return null
  if (/^\[[ xX]\]\s*/.test(bulletMatch[3] ?? '')) return null

  return {
    lineIndex,
    indent: bulletMatch[1],
    indentLength: bulletMatch[1].length,
    kind: bulletMatch[2] === '-' ? 'dash' : 'bullet',
    delimiter: bulletMatch[2],
    text: bulletMatch[3] ?? '',
    normalizedText: normalizeListReorderText(bulletMatch[3] ?? ''),
  }
}

function parseMarkdownListStructure(markdown: string): {
  lines: string[]
  parsedLines: ParsedListLine[]
  lineInfoByIndex: Map<number, ParsedListLine>
  groups: ParsedListGroup[]
} {
  const lines = markdown.split('\n')
  const parsedLines: ParsedListLine[] = []
  const lineInfoByIndex = new Map<number, ParsedListLine>()
  const groupsByKey = new Map<string, ParsedListGroup>()
  const stack: ParsedListLine[] = []
  let clusterIndex = 0

  lines.forEach((line, lineIndex) => {
    const parsed = parseListMarkdownLine(line, lineIndex)
    if (!parsed) {
      stack.length = 0
      clusterIndex += 1
      return
    }

    while (stack.length > 0 && stack[stack.length - 1].indentLength >= parsed.indentLength) {
      stack.pop()
    }

    const parentLineIndex = stack[stack.length - 1]?.lineIndex ?? null
    const lineInfo: ParsedListLine = {
      ...parsed,
      parentLineIndex,
      clusterIndex,
    }
    parsedLines.push(lineInfo)
    lineInfoByIndex.set(lineIndex, lineInfo)

    const groupKey = `${clusterIndex}:${parentLineIndex ?? 'root'}:${parsed.indentLength}:${parsed.kind}`
    const existingGroup = groupsByKey.get(groupKey)
    if (existingGroup) {
      existingGroup.itemLineIndices.push(lineIndex)
      existingGroup.itemTexts.push(lineInfo.normalizedText)
    } else {
      groupsByKey.set(groupKey, {
        key: groupKey,
        kind: parsed.kind,
        indent: parsed.indent,
        indentLength: parsed.indentLength,
        parentLineIndex,
        clusterIndex,
        itemLineIndices: [lineIndex],
        itemTexts: [lineInfo.normalizedText],
      })
    }

    stack.push(lineInfo)
  })

  return {
    lines,
    parsedLines,
    lineInfoByIndex,
    groups: Array.from(groupsByKey.values()),
  }
}

function renumberOrderedMarkdownLines(lines: string[], startNumber: number): string[] {
  return lines.map((line, index) => line.replace(/^(\s*)\d+([.)])(\s+)/, `$1${startNumber + index}$2$3`))
}

function normalizeEmptyBulletDashMarkdownLine(line: string, kind: ReorderListKind): string {
  if (kind !== 'bullet' && kind !== 'dash') return line
  const match = kind === 'dash'
    ? line.match(/^(\s*)-\s*(?:\u200b)?$/)
    : line.match(/^(\s*)([*+])\s*(?:\u200b)?$/)
  if (!match) return line
  const marker = kind === 'dash' ? '-' : match[2]
  return `${match[1]}${marker} ${EMPTY_LIST_ITEM_PLACEHOLDER}`
}

function findMatchingGroup(
  groups: ParsedListGroup[],
  kind: ReorderListKind,
  itemTexts: string[],
): ParsedListGroup | null {
  const normalizedItemTexts = itemTexts.map(normalizeListReorderText)
  return groups.find((group) =>
    group.kind === kind &&
    group.itemTexts.length === normalizedItemTexts.length &&
    group.itemTexts.every((text, index) => text === normalizedItemTexts[index]),
  ) ?? null
}

function getBranchEndLineIndex(
  lines: string[],
  lineInfoByIndex: Map<number, ParsedListLine>,
  itemLineIndex: number,
): number {
  const sourceInfo = lineInfoByIndex.get(itemLineIndex)
  if (!sourceInfo) return itemLineIndex + 1

  for (let lineIndex = itemLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const candidate = lineInfoByIndex.get(lineIndex)
    if (candidate && candidate.clusterIndex !== sourceInfo.clusterIndex) return lineIndex
    if (candidate && candidate.indentLength <= sourceInfo.indentLength) return lineIndex
    if (!candidate && lines[lineIndex].trim() === '') return lineIndex
  }

  return lines.length
}

function getGroupInsertLineIndex(
  lines: string[],
  lineInfoByIndex: Map<number, ParsedListLine>,
  group: ParsedListGroup,
  insertIndex: number,
): number {
  const clampedInsertIndex = Math.max(0, Math.min(insertIndex, group.itemLineIndices.length))
  const targetLineIndex = group.itemLineIndices[clampedInsertIndex]
  if (targetLineIndex !== undefined) return targetLineIndex

  const lastLineIndex = group.itemLineIndices[group.itemLineIndices.length - 1]
  return lastLineIndex === undefined ? lines.length : getBranchEndLineIndex(lines, lineInfoByIndex, lastLineIndex)
}

function reindentBranchLines(branchLines: string[], sourceIndent: string, targetIndent: string): string[] {
  if (sourceIndent === targetIndent) return branchLines

  const sourceLength = sourceIndent.length
  const targetLength = targetIndent.length
  const fallbackDelta = targetLength - sourceLength
  return branchLines.map((line) => {
    if (!line.trim()) return line
    if (line.startsWith(sourceIndent)) return `${targetIndent}${line.slice(sourceLength)}`

    const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
    if (fallbackDelta > 0) return `${' '.repeat(fallbackDelta)}${line}`
    const removeLength = Math.min(leadingWhitespace.length, Math.abs(fallbackDelta))
    return line.slice(removeLength)
  })
}

function renumberAllOrderedMarkdownGroups(markdown: string): string {
  const structure = parseMarkdownListStructure(markdown)
  const nextLines = [...structure.lines]

  structure.groups
    .filter((group) => group.kind === 'numbered')
    .forEach((group) => {
      const firstLine = nextLines[group.itemLineIndices[0]]
      const firstNumber = Number(firstLine?.match(/^\s*(\d+)[.)]\s+/)?.[1]) || 1
      group.itemLineIndices.forEach((lineIndex, index) => {
        nextLines[lineIndex] = nextLines[lineIndex].replace(/^(\s*)\d+([.)])(\s+)/, `$1${firstNumber + index}$2$3`)
      })
    })

  return nextLines.join('\n')
}

export function moveListItemBranchInMarkdown(
  markdown: string,
  kind: ReorderListKind,
  sourceItemTexts: string[],
  sourceIndex: number,
  targetItemTexts: string[],
  insertIndex: number,
): string | null {
  if (sourceIndex < 0 || insertIndex < 0) return null

  const structure = parseMarkdownListStructure(markdown)
  const sourceGroup = findMatchingGroup(structure.groups, kind, sourceItemTexts)
  const targetGroup = findMatchingGroup(structure.groups, kind, targetItemTexts)
  if (!sourceGroup || !targetGroup) return null
  if (sourceIndex >= sourceGroup.itemLineIndices.length || insertIndex > targetGroup.itemLineIndices.length) return null
  if (sourceGroup.clusterIndex !== targetGroup.clusterIndex) return null

  const sourceLineIndex = sourceGroup.itemLineIndices[sourceIndex]
  if (sourceLineIndex === undefined) return null
  const sourceEndLineIndex = getBranchEndLineIndex(structure.lines, structure.lineInfoByIndex, sourceLineIndex)
  const branchLineCount = sourceEndLineIndex - sourceLineIndex
  if (branchLineCount <= 0) return null
  if (
    targetGroup.parentLineIndex !== null &&
    targetGroup.parentLineIndex > sourceLineIndex &&
    targetGroup.parentLineIndex < sourceEndLineIndex
  ) {
    return null
  }

  if (sourceGroup.key === targetGroup.key) {
    const adjustedTargetIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
    if (adjustedTargetIndex === sourceIndex) return null
  }

  let insertLineIndex = getGroupInsertLineIndex(
    structure.lines,
    structure.lineInfoByIndex,
    targetGroup,
    insertIndex,
  )

  if (insertLineIndex > sourceLineIndex && insertLineIndex < sourceEndLineIndex) return null
  if (insertLineIndex > sourceLineIndex) {
    insertLineIndex -= branchLineCount
  }

  const movedLines = reindentBranchLines(
    structure.lines.slice(sourceLineIndex, sourceEndLineIndex),
    sourceGroup.indent,
    targetGroup.indent,
  ).map((line) => normalizeEmptyBulletDashMarkdownLine(line, kind))

  const remainingLines = [
    ...structure.lines.slice(0, sourceLineIndex),
    ...structure.lines.slice(sourceEndLineIndex),
  ]
  remainingLines.splice(insertLineIndex, 0, ...movedLines)
  const nextMarkdown = renumberAllOrderedMarkdownGroups(remainingLines.join('\n'))
  return nextMarkdown === markdown ? null : nextMarkdown
}

function getNormalizedSelectionLines(selectedText: string): string[] {
  return selectedText
    .split(/\n+/)
    .map(normalizeListReorderText)
    .filter((line) => line.length > 0)
}

function getListLineTextWithoutMarker(line: string, kind: ReorderListKind): string | null {
  if (kind === 'task') return line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*(.*)$/)?.[2] ?? null
  if (kind === 'numbered') return line.match(/^(\s*)\d+[.)]\s+(?!\[[ xX]\]\s)(.*)$/)?.[2] ?? null
  if (kind === 'dash') {
    if (/^\s*-{3,}\s*$/.test(line)) return null
    const match = line.match(/^(\s*)-\s*(.*)$/)
    if (match?.[2] && /^\[[ xX]\]\s*/.test(match[2])) return null
    return match?.[2] ?? null
  }
  if (/^\s*\*{3,}\s*$/.test(line)) return null
  const match = line.match(/^(\s*)[*+]\s*(.*)$/)
  if (match?.[2] && /^\[[ xX]\]\s*/.test(match[2])) return null
  return match?.[2] ?? null
}

export function unwrapMatchingListItemsMarkdown(
  markdown: string,
  selectedText: string,
  kind: ReorderListKind,
): string | null {
  const selectionLines = getNormalizedSelectionLines(selectedText)
  if (selectionLines.length === 0) return null

  const structure = parseMarkdownListStructure(markdown)
  const listLines = structure.parsedLines.filter((line) => line.kind === kind)

  for (let startIndex = 0; startIndex < listLines.length; startIndex += 1) {
    const selectedLineInfos: ParsedListLine[] = []
    for (let index = startIndex; index < listLines.length && selectedLineInfos.length < selectionLines.length; index += 1) {
      selectedLineInfos.push(listLines[index])
    }

    if (selectedLineInfos.length !== selectionLines.length) continue
    if (selectedLineInfos.some((line) => line.clusterIndex !== selectedLineInfos[0].clusterIndex)) continue
    if (!selectedLineInfos.every((line, index) => line.normalizedText === selectionLines[index])) continue

    const selectedLineIndexSet = new Set(selectedLineInfos.map((line) => line.lineIndex))
    const hasIncompleteBranch = selectedLineInfos.some((line) => {
      const branchEnd = getBranchEndLineIndex(structure.lines, structure.lineInfoByIndex, line.lineIndex)
      return structure.parsedLines.some((candidate) =>
        candidate.lineIndex > line.lineIndex &&
        candidate.lineIndex < branchEnd &&
        !selectedLineIndexSet.has(candidate.lineIndex),
      )
    })
    if (hasIncompleteBranch) continue

    const nextLines = [...structure.lines]
    for (const line of selectedLineInfos) {
      const plainText = getListLineTextWithoutMarker(nextLines[line.lineIndex], kind)
      if (plainText === null) return null
      nextLines[line.lineIndex] = `${line.indent}${plainText || EMPTY_LIST_ITEM_PLACEHOLDER}`
    }

    const nextMarkdown = renumberAllOrderedMarkdownGroups(nextLines.join('\n'))
    return nextMarkdown === markdown ? null : nextMarkdown
  }

  return null
}

export function reorderListMarkdownLines(
  markdown: string,
  itemTexts: string[],
  kind: ReorderListKind,
  sourceIndex: number,
  insertIndex: number,
): string | null {
  if (sourceIndex < 0 || sourceIndex >= itemTexts.length || insertIndex < 0 || insertIndex > itemTexts.length) return null

  const adjustedInsertIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
  if (adjustedInsertIndex === sourceIndex) return null

  const normalizedItemTexts = itemTexts.map(normalizeListReorderText)
  const lines = markdown.split('\n')

  const runs: Array<Array<{ index: number; text: string }>> = []
  let currentRun: Array<{ index: number; text: string }> = []
  lines.forEach((line, index) => {
    const text = getListMarkdownLineText(line, kind)
    if (text === null) {
      if (currentRun.length > 0) runs.push(currentRun)
      currentRun = []
      return
    }
    currentRun.push({ index, text })
  })
  if (currentRun.length > 0) runs.push(currentRun)

  for (const candidate of runs) {
    if (candidate.length !== normalizedItemTexts.length) continue
    const matches = candidate.every((info, index) => info.text === normalizedItemTexts[index])
    if (!matches) continue

    const reorderedLines = candidate.map((info) => lines[info.index])
    const [movedLine] = reorderedLines.splice(sourceIndex, 1)
    if (movedLine === undefined) return null
    reorderedLines.splice(adjustedInsertIndex, 0, movedLine)
    const firstNumber = Number(lines[candidate[0]?.index ?? 0]?.match(/^\s*(\d+)[.)]\s+/)?.[1]) || 1
    const finalLines = (kind === 'numbered' ? renumberOrderedMarkdownLines(reorderedLines, firstNumber) : reorderedLines)
      .map((line) => normalizeEmptyBulletDashMarkdownLine(line, kind))

    const nextLines = [...lines]
    candidate.forEach((info, index) => {
      nextLines[info.index] = finalLines[index]
    })
    return nextLines.join('\n')
  }

  return null
}
