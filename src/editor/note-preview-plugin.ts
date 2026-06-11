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

type NotePreviewPluginOptions = NotePreviewWidgetOptions & {
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null
  renderMode?: 'editor' | 'readonly-preview'
}

export type { NotePreviewData } from '../notes/note-preview-data'

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
  return DecorationSet.create(doc, decorations)
}

export function createNotePreviewPlugin(context: any, options: NotePreviewPluginOptions) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView
  const renderMode = options.renderMode ?? 'editor'
  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (editorState: any) => {
              return createNotePreviewDecorations({
                doc: editorState.doc,
                Decoration,
                DecorationSet,
                options,
                renderMode,
              })
            },
          },
        }),
    ],
  }
}
