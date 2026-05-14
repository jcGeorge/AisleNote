export type ReorderListKind = 'task' | 'bullet' | 'dash' | 'numbered'

export const EMPTY_LIST_ITEM_PLACEHOLDER = '\u200b'

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
