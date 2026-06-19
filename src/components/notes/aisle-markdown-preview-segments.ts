import type { AppState } from '../../types/app'
import { normalizeEscapedMarkdownLinks } from '../../markdown/markdown-utils'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  parsePreviewToken,
  type NotePreviewReferencePayload,
} from '../../notes/note-references'

export type AislePreviewSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'note-preview'; token: string; payload: NotePreviewReferencePayload }

export function getAislePreviewSegments(markdown: string, appState?: AppState | null): AislePreviewSegment[] {
  const source = normalizeEscapedMarkdownLinks(markdown)
  if (!source.trim()) return []
  if (!appState) return [{ type: 'markdown', markdown: source }]

  const segments: AislePreviewSegment[] = []
  let cursor = 0
  const referenceRe = new RegExp(NOTE_PREVIEW_REFERENCE_RE.source, 'g')
  for (const match of source.matchAll(referenceRe)) {
    const token = match[0]
    const from = match.index ?? 0
    if (!token.startsWith('!')) continue
    const payload = parsePreviewToken(token, appState)
    if (!payload) continue
    const markdownBefore = source.slice(cursor, from)
    if (markdownBefore.trim()) segments.push({ type: 'markdown', markdown: markdownBefore })
    segments.push({ type: 'note-preview', token, payload })
    cursor = from + token.length
  }
  const markdownAfter = source.slice(cursor)
  if (markdownAfter.trim()) segments.push({ type: 'markdown', markdown: markdownAfter })
  return segments.length > 0 ? segments : [{ type: 'markdown', markdown: source }]
}
