export type AislePreviewSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'context-preview'; label: string }

export function getAislePreviewSegments(markdown: string): AislePreviewSegment[] {
  const source = String(markdown ?? '')
  return source.trim() ? [{ type: 'markdown', markdown: source }] : []
}
