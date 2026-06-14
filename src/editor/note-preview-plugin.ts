import {
  createNotePreviewWidgetElement,
  createReadonlyNotePreviewWidgetElement,
  type NotePreviewWidgetOptions,
} from './note-preview-widget'
import {
  buildMarkdownNoteReferenceToken,
  NOTE_PREVIEW_REFERENCE_RE,
  parseMarkdownNoteReferenceDestination,
  parseMarkdownNoteReferenceToken,
  type NotePreviewReferencePayload,
  type NotePreviewSourceRange,
} from '../notes/note-references'
import { measureSlowOperation } from '../performance/performance-logging'

type NotePreviewPluginOptions = NotePreviewWidgetOptions & {
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null
  renderMode?: 'editor' | 'readonly-preview'
}

export type { NotePreviewData } from '../notes/note-preview-data'

type TextSegment = {
  from: number
  to: number
  text: string
  href: string
}

type PreviewTextLinkRange = {
  from: number
  to: number
  href: string
  label: string
}

type ResolvedPreviewTextLink = {
  payload: NotePreviewReferencePayload
  label: string
  from: number
  to: number
}

function getNodeTypeName(node: any): string {
  return String(node?.type?.name ?? '').toLowerCase()
}

function getImageNodeSource(node: any): string {
  const attrs = node?.attrs ?? {}
  const source = attrs.imageUrl ?? attrs.src
  return typeof source === 'string' ? source.trim() : ''
}

function getImageNodeAltText(node: any): string {
  const attrs = node?.attrs ?? {}
  const alt = attrs.altText ?? attrs.alt
  return typeof alt === 'string' ? alt.trim() : ''
}

function getTextNodeLinkHref(node: any): string {
  const marks = Array.isArray(node?.marks) ? node.marks : []
  const linkMark = marks.find(
    (mark: any) =>
      mark?.type?.name === 'link' &&
      (typeof mark?.attrs?.linkUrl === 'string' || typeof mark?.attrs?.href === 'string'),
  )
  const href = linkMark?.attrs?.linkUrl ?? linkMark?.attrs?.href
  return typeof href === 'string' ? href.trim() : ''
}

function normalizePreviewImageNodeSource(source: string): string {
  const unescaped = source.trim().replace(/\\([\\[\]()<>#-])/g, '$1')
  return parseMarkdownNoteReferenceDestination(unescaped) || unescaped
}

function resolvePreviewImageNode(
  node: any,
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null,
): { payload: NotePreviewReferencePayload; label: string } | null {
  if (node?.isText) return null
  const typeName = getNodeTypeName(node)
  if (typeName !== 'image') return null
  const source = getImageNodeSource(node)
  if (!source) return null
  const label = getImageNodeAltText(node)
  const token = buildMarkdownNoteReferenceToken({
    embed: true,
    target: normalizePreviewImageNodeSource(source),
    label,
  })
  const payload = token ? resolvePreviewToken(token) : null
  return payload ? { payload, label } : null
}

function collectTextSegments(doc: any): TextSegment[] {
  const segments: TextSegment[] = []
  doc.descendants((node: any, pos: number) => {
    if (!node?.isText || typeof node.text !== 'string' || node.text.length === 0) return true
    segments.push({
      from: pos,
      to: pos + node.text.length,
      text: node.text,
      href: getTextNodeLinkHref(node),
    })
    return true
  })
  return segments
}

function collectPreviewTextLinkRanges(segments: readonly TextSegment[]): PreviewTextLinkRange[] {
  const ranges: PreviewTextLinkRange[] = []
  segments.forEach((segment) => {
    if (!segment.href) return
    const previous = ranges[ranges.length - 1]
    if (previous && previous.href === segment.href && previous.to === segment.from) {
      previous.to = segment.to
      previous.label += segment.text
      return
    }
    ranges.push({
      from: segment.from,
      to: segment.to,
      href: segment.href,
      label: segment.text,
    })
  })
  return ranges
}

function getPreviewTextLinkMarkerFrom(segments: readonly TextSegment[], range: PreviewTextLinkRange): number | null {
  if (range.label.startsWith('!')) return range.from
  const previousSegment = segments.find((segment) => segment.to === range.from)
  return previousSegment?.text.endsWith('!') ? range.from - 1 : null
}

function resolvePreviewTextLink(
  segments: readonly TextSegment[],
  range: PreviewTextLinkRange,
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null,
): ResolvedPreviewTextLink | null {
  const markerFrom = getPreviewTextLinkMarkerFrom(segments, range)
  if (markerFrom === null) return null
  const label = (range.label.startsWith('!') ? range.label.slice(1) : range.label).trim()
  const token = buildMarkdownNoteReferenceToken({
    embed: true,
    target: range.href,
    label,
  })
  const payload = token ? resolvePreviewToken(token) : null
  return payload
    ? {
        payload,
        label,
        from: markerFrom,
        to: range.to,
      }
    : null
}

function collectPreviewTextLinks(
  doc: any,
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null,
): ResolvedPreviewTextLink[] {
  const segments = collectTextSegments(doc)
  return collectPreviewTextLinkRanges(segments)
    .map((range) => resolvePreviewTextLink(segments, range, resolvePreviewToken))
    .filter((link): link is ResolvedPreviewTextLink => Boolean(link))
}

function addPreviewWidgetDecoration({
  decorations,
  Decoration,
  payload,
  options,
  renderMode,
  from,
  sourceRange,
  key,
  label = '',
}: {
  decorations: unknown[]
  Decoration: any
  payload: NotePreviewReferencePayload
  options: NotePreviewPluginOptions
  renderMode: 'editor' | 'readonly-preview'
  from: number
  sourceRange: NotePreviewSourceRange
  key: string
  label?: string
}) {
  decorations.push(
    renderMode === 'readonly-preview'
      ? Decoration.widget(from, () => createReadonlyNotePreviewWidgetElement(payload, options), {
          key,
          side: -1,
        })
      : Decoration.widget(from, () => createNotePreviewWidgetElement(payload, options, sourceRange, label), {
          key,
          side: -1,
          destroy: (node: HTMLElement & { destroyNotePreview?: () => void }) => node.destroyNotePreview?.(),
        }),
  )
}

function createNotePreviewDecorations({
  doc,
  Decoration,
  DecorationSet,
  options,
  renderMode,
}: {
  doc: any
  Decoration: any
  DecorationSet: any
  options: NotePreviewPluginOptions
  renderMode: 'editor' | 'readonly-preview'
}) {
  const decorations: unknown[] = []
  doc.descendants((node: any, pos: number) => {
    const imageReference = resolvePreviewImageNode(node, options.resolvePreviewToken)
    if (imageReference) {
      const from = pos
      const to = pos + Math.max(1, Number(node?.nodeSize) || 1)
      const sourceRange = { from, to }
      addPreviewWidgetDecoration({
        decorations,
        Decoration,
        payload: imageReference.payload,
        options,
        renderMode,
        from,
        sourceRange,
        key: `${renderMode === 'readonly-preview' ? 'readonly-' : ''}note-preview-image-${from}-${to}-${imageReference.payload.id}`,
        label: imageReference.label,
      })
      decorations.push(Decoration.node(from, to, { class: 'note-context-node-hidden' }))
      return false
    }

    if (!node.isText || typeof node.text !== 'string') return true
    if (!node.text.includes('![')) return true
    for (const match of node.text.matchAll(NOTE_PREVIEW_REFERENCE_RE)) {
      const payload = options.resolvePreviewToken(match[0])
      if (!payload) continue
      const label = parseMarkdownNoteReferenceToken(match[0])?.label ?? ''
      const from = pos + (match.index ?? 0)
      const to = from + match[0].length
      const sourceRange = { from, to }
      addPreviewWidgetDecoration({
        decorations,
        Decoration,
        payload,
        options,
        renderMode,
        from,
        sourceRange,
        key: `${renderMode === 'readonly-preview' ? 'readonly-' : ''}note-preview-${payload.id}`,
        label,
      })
      decorations.push(Decoration.inline(from, to, { class: 'note-context-token-hidden' }))
    }
    return true
  })
  collectPreviewTextLinks(doc, options.resolvePreviewToken).forEach((link) => {
    const sourceRange = { from: link.from, to: link.to }
    addPreviewWidgetDecoration({
      decorations,
      Decoration,
      payload: link.payload,
      options,
      renderMode,
      from: link.from,
      sourceRange,
      key: `${renderMode === 'readonly-preview' ? 'readonly-' : ''}note-preview-link-${link.from}-${link.to}-${link.payload.id}`,
      label: link.label,
    })
    decorations.push(Decoration.inline(link.from, link.to, { class: 'note-context-token-hidden' }))
  })
  return DecorationSet.create(doc, decorations)
}

export function createNotePreviewPlugin(context: any, options: NotePreviewPluginOptions) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView
  const renderMode = options.renderMode ?? 'editor'
  let cachedDecorationDoc: any = null
  let cachedDecorationSet: unknown = null
  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (editorState: any) => {
              const doc = editorState.doc
              if (doc === cachedDecorationDoc && cachedDecorationSet) return cachedDecorationSet
              const decorationSet = measureSlowOperation('note-preview decorations', () => {
                return createNotePreviewDecorations({
                  doc,
                  Decoration,
                  DecorationSet,
                  options,
                  renderMode,
                })
              })
              cachedDecorationDoc = doc
              cachedDecorationSet = decorationSet
              return decorationSet
            },
          },
        }),
    ],
  }
}
