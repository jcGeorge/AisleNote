import {
  collectProseMirrorTextPositions,
} from './prosemirror-utils'
import {
  createContextPreviewWidgetElement,
  createInternalNoteLinkWidgetElement,
  type NotePreviewWidgetOptions,
} from './note-preview-widget'
import {
  decodeContextPayload,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  NOTE_CONTEXT_REFERENCE_RE,
  parseInternalNoteReferenceUrl,
} from '../notes/note-references'

type NotePreviewPluginOptions = NotePreviewWidgetOptions

export type { ContextPreviewData } from '../notes/note-preview-data'

export function createContextPreviewPlugin(context: any, options: NotePreviewPluginOptions) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView
  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (editorState: any) => {
              const decorations: unknown[] = []
              const docText = collectProseMirrorTextPositions(editorState.doc)
              editorState.doc.descendants((node: any, pos: number) => {
                if (!node.isText || typeof node.text !== 'string') return
                for (const match of node.text.matchAll(NOTE_CONTEXT_REFERENCE_RE)) {
                  const payload = decodeContextPayload(match[1])
                  if (!payload) continue
                  const from = pos + (match.index ?? 0)
                  const to = from + match[0].length
                  decorations.push(
                    Decoration.widget(from, () => createContextPreviewWidgetElement(payload, options), {
                      key: `note-preview-${payload.id}`,
                      side: -1,
                      destroy: (node: HTMLElement & { destroyNotePreview?: () => void }) => node.destroyNotePreview?.(),
                    }),
                  )
                  decorations.push(Decoration.inline(from, to, { class: 'note-context-token-hidden' }))
                }
              })
              for (const match of docText.text.matchAll(INTERNAL_NOTE_LINK_MARKDOWN_RE)) {
                if (match[0].startsWith('!')) continue
                const target = parseInternalNoteReferenceUrl(match[2])
                if (!target) continue

                const startIndex = match.index ?? 0
                const endIndex = startIndex + match[0].length - 1
                const from = docText.positions[startIndex]
                const last = docText.positions[endIndex]
                const rangePositions = docText.positions.slice(startIndex, endIndex + 1)
                if (from === undefined || last === undefined || from < 0 || last < from || rangePositions.some((position) => position < 0)) {
                  continue
                }

                decorations.push(
                  Decoration.widget(
                    from,
                    () => createInternalNoteLinkWidgetElement(match[1], target, match[2], options.navigateToNoteLocation),
                    {
                      key: `internal-note-link-${from}-${last}-${match[2]}`,
                      side: -1,
                    },
                  ),
                )
                decorations.push(Decoration.inline(from, last + 1, { class: 'internal-note-link-source-hidden' }))
              }
              return DecorationSet.create(editorState.doc, decorations)
            },
          },
        }),
    ],
  }
}
