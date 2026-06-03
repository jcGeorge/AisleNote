const VISUALIZER_NODE_LABEL_LINE_LIMIT = 13
const VISUALIZER_NODE_LABEL_ELLIPSIS = '...'

function normalizeVisualizerNodeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim()
}

function truncateLabelStart(text: string, limit: number): string {
  if (text.length <= limit) return text
  if (limit <= VISUALIZER_NODE_LABEL_ELLIPSIS.length) return text.slice(0, limit)
  return `${text.slice(0, limit - VISUALIZER_NODE_LABEL_ELLIPSIS.length).trimEnd()}${VISUALIZER_NODE_LABEL_ELLIPSIS}`
}

function truncateLabelEnd(text: string, limit: number): string {
  if (text.length <= limit) return text
  if (limit <= VISUALIZER_NODE_LABEL_ELLIPSIS.length) return text.slice(-limit)
  return `${VISUALIZER_NODE_LABEL_ELLIPSIS}${text.slice(-(limit - VISUALIZER_NODE_LABEL_ELLIPSIS.length)).trimStart()}`
}

function wrapVisualizerNodeLabelWords(label: string, limit: number): string[] | null {
  const words = label.split(' ')
  if (words.some((word) => word.length > limit)) return null
  const lines: string[] = []
  let currentLine = ''
  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= limit) {
      currentLine = candidate
      return
    }
    lines.push(currentLine)
    currentLine = word
  })
  if (currentLine) lines.push(currentLine)
  return lines.length <= 2 ? lines : null
}

export function formatVisualizerNodeLabel(label: string, lineLimit = VISUALIZER_NODE_LABEL_LINE_LIMIT): string[] {
  const normalized = normalizeVisualizerNodeLabel(label)
  const limit = Math.max(1, Math.floor(lineLimit))
  if (!normalized) return ['']
  if (normalized.length <= limit) return [normalized]

  const wrappedLines = wrapVisualizerNodeLabelWords(normalized, limit)
  if (wrappedLines) return wrappedLines

  const words = normalized.split(' ')
  let firstLine = ''
  let firstEndIndex = 0
  while (firstEndIndex < words.length) {
    const candidate = firstLine ? `${firstLine} ${words[firstEndIndex]}` : words[firstEndIndex]
    if (candidate.length > limit) break
    firstLine = candidate
    firstEndIndex += 1
  }
  if (!firstLine) {
    firstLine = truncateLabelStart(words[0] ?? normalized, limit)
    firstEndIndex = Math.min(1, words.length)
  }

  let secondLine = ''
  let secondStartIndex = words.length
  while (secondStartIndex > firstEndIndex) {
    const word = words[secondStartIndex - 1]
    const candidate = secondLine ? `${word} ${secondLine}` : word
    if (candidate.length > limit) break
    secondLine = candidate
    secondStartIndex -= 1
  }
  if (!secondLine) {
    secondLine = truncateLabelEnd(words[words.length - 1] ?? normalized, limit)
    secondStartIndex = Math.max(firstEndIndex, words.length - 1)
  }

  const omittedMiddleWords = firstEndIndex < secondStartIndex
  if (
    omittedMiddleWords &&
    !firstLine.endsWith(VISUALIZER_NODE_LABEL_ELLIPSIS) &&
    firstLine.length + VISUALIZER_NODE_LABEL_ELLIPSIS.length <= limit
  ) {
    firstLine = `${firstLine}${VISUALIZER_NODE_LABEL_ELLIPSIS}`
  }
  if (
    omittedMiddleWords &&
    !secondLine.startsWith(VISUALIZER_NODE_LABEL_ELLIPSIS) &&
    secondLine.length + VISUALIZER_NODE_LABEL_ELLIPSIS.length <= limit
  ) {
    secondLine = `${VISUALIZER_NODE_LABEL_ELLIPSIS}${secondLine}`
  }

  return [firstLine, secondLine]
}
