const HEAVY_PREVIEW_LINK_THRESHOLD = 8
const HEAVY_PREVIEW_TABLE_ROW_THRESHOLD = 6
const MARKDOWN_LINK_RE = /!?\[[^\]\n]+\]\([^)]+\)/g

export function isMarkdownPreviewLikelyExpensive(markdown: string): boolean {
  const source = String(markdown ?? '')
  if (!source) return false
  const linkCount = source.match(MARKDOWN_LINK_RE)?.length ?? 0
  if (linkCount >= HEAVY_PREVIEW_LINK_THRESHOLD) return true
  if (linkCount <= 0) return false
  let tableRowCount = 0
  for (const line of source.split('\n')) {
    if (line.includes('|')) tableRowCount += 1
    if (tableRowCount >= HEAVY_PREVIEW_TABLE_ROW_THRESHOLD) return true
  }
  return false
}
