import {
  getAislePreviewMarkdown,
} from '../../editor/aisle-edit-draft'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  getPreviewReferenceTokenLengthAt,
  parseMarkdownNoteReferenceToken,
} from '../../notes/note-references'

export type AislePreviewSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'context-preview'; label: string }

export function getAislePreviewSegments(markdown: string): AislePreviewSegment[] {
  const previewMarkdown = getAislePreviewMarkdown(markdown)
  const segments: AislePreviewSegment[] = []
  let lastIndex = 0
  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0

  for (const match of previewMarkdown.matchAll(NOTE_PREVIEW_REFERENCE_RE)) {
    const parsed = getPreviewReferenceTokenLengthAt(match[0], 0) === match[0].length
      ? parseMarkdownNoteReferenceToken(match[0])
      : null
    if (!parsed?.embed) continue
    const start = match.index ?? 0
    const before = previewMarkdown.slice(lastIndex, start)
    if (before.trim()) segments.push({ type: 'markdown', markdown: before })

    const fallbackLabel = parsed.label
    segments.push({ type: 'context-preview', label: fallbackLabel || 'note preview' })
    lastIndex = start + match[0].length
  }

  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0
  const after = previewMarkdown.slice(lastIndex)
  if (after.trim()) segments.push({ type: 'markdown', markdown: after })
  return segments
}
