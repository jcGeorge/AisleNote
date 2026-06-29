const HTML_BLOCK_WRAPPER_TAGS =
  'address|article|aside|body|center|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|header|main|nav|p|section|summary'
const HTML_BLOCK_WRAPPER_CLOSE_RE = new RegExp(`</(?:${HTML_BLOCK_WRAPPER_TAGS})\\s*>`, 'gi')
const HTML_BLOCK_WRAPPER_OPEN_RE = new RegExp(`<(?:${HTML_BLOCK_WRAPPER_TAGS})\\b[^>]*>`, 'gi')
const HTML_HEADING_OPEN_RE = /<h([1-6])\b[^>]*>/gi
const HTML_HEADING_CLOSE_RE = /<\/h[1-6]\s*>/gi
const HTML_LINE_BREAK_RE = /<br\b[^>]*\/?>/gi
const HTML_HR_RE = /<hr\b[^>]*\/?>/gi
const HTML_LIST_ITEM_OPEN_RE = /<li\b[^>]*>/gi
const HTML_LIST_ITEM_CLOSE_RE = /<\/li\s*>/gi

export function getPrintMarkdownSource(markdown: string) {
  return String(markdown ?? '')
    .replace(HTML_LINE_BREAK_RE, '\n')
    .replace(HTML_HR_RE, '\n\n---\n\n')
    .replace(HTML_HEADING_OPEN_RE, (_match, level: string) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(HTML_HEADING_CLOSE_RE, '\n\n')
    .replace(HTML_LIST_ITEM_OPEN_RE, '\n- ')
    .replace(HTML_LIST_ITEM_CLOSE_RE, '\n')
    .replace(HTML_BLOCK_WRAPPER_CLOSE_RE, '\n\n')
    .replace(HTML_BLOCK_WRAPPER_OPEN_RE, '\n\n')
}
