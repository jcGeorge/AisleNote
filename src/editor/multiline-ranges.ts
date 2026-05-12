import type { EditorTextLineRange } from '../types/app'

const CODE_BLOCK_NODE_TYPE = 'codeBlock'
const HARD_BREAK_NODE_TYPE = 'hardBreak'

const createTextLineRange = (
  start: number,
  end: number,
  text: string,
  nodeType: string | undefined,
): EditorTextLineRange => ({
  start,
  end,
  length: Math.max(0, end - start),
  text,
  nodeType,
})

const appendCodeBlockLineRanges = (ranges: EditorTextLineRange[], node: any, pos: number) => {
  let lineStart = pos + 1
  let lineText = ''
  const contentEnd = pos + 1 + Math.max(0, node.content.size)

  node.forEach((child: any, childOffset: number) => {
    const childText = child?.text ?? child?.textContent ?? ''
    if (!childText) return

    const childStart = pos + 1 + childOffset
    let segmentStart = 0

    for (let index = 0; index < childText.length; index += 1) {
      if (childText[index] !== '\n') continue

      const breakStart = childStart + index
      lineText += childText.slice(segmentStart, index)
      ranges.push(createTextLineRange(lineStart, breakStart, lineText, CODE_BLOCK_NODE_TYPE))
      lineStart = breakStart + 1
      lineText = ''
      segmentStart = index + 1
    }

    lineText += childText.slice(segmentStart)
  })

  ranges.push(createTextLineRange(lineStart, contentEnd, lineText, CODE_BLOCK_NODE_TYPE))
}

const appendHardBreakLineRanges = (ranges: EditorTextLineRange[], node: any, pos: number) => {
  let lineStart = pos + 1
  let lineText = ''
  const nodeType = node?.type?.name
  const contentEnd = pos + 1 + Math.max(0, node.content.size)

  node.forEach((child: any, childOffset: number) => {
    if (child?.type?.name !== HARD_BREAK_NODE_TYPE) {
      lineText += child?.textContent ?? ''
      return
    }

    const breakStart = pos + 1 + childOffset
    ranges.push(createTextLineRange(lineStart, breakStart, lineText, nodeType))
    lineStart = breakStart + Math.max(1, child.nodeSize ?? 1)
    lineText = ''
  })

  ranges.push(createTextLineRange(lineStart, contentEnd, lineText, nodeType))
}

export function getEditorTextLineRanges(view: any): EditorTextLineRange[] {
  const ranges: EditorTextLineRange[] = []

  view.state.doc.nodesBetween(0, view.state.doc.content.size, (node: any, pos: number) => {
    if (!node?.isTextblock) return

    if (node?.type?.name === CODE_BLOCK_NODE_TYPE) {
      appendCodeBlockLineRanges(ranges, node, pos)
      return false
    }

    appendHardBreakLineRanges(ranges, node, pos)
    return false
  })

  return ranges
}

export function findEditorTextLineRangeIndex(ranges: EditorTextLineRange[], position: number): number {
  const exactStartIndex = ranges.findIndex((range) => position === range.start)
  if (exactStartIndex >= 0) return exactStartIndex

  const containingIndex = ranges.findIndex((range) => position > range.start && position <= range.end)
  if (containingIndex >= 0) return containingIndex

  return ranges.findIndex((range) => position >= range.start && position <= range.end + 1)
}

export function isCodeBlockTextLineRange(range: EditorTextLineRange | undefined): boolean {
  return range?.nodeType === CODE_BLOCK_NODE_TYPE
}
