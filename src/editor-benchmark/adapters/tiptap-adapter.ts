import { Editor as TiptapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import type { EditorBenchmarkAdapter, MountedEditorBenchmark } from '../types'
import { focusInsideTableText, focusOutsideTableText, waitForAnimationFrame, waitForEditable } from './dom'

export const tiptapAdapter: EditorBenchmarkAdapter = {
  id: 'tiptap',
  name: 'Tiptap minimal Markdown',
  kind: 'wysiwyg-markdown',
  featureGaps: [
    'Markdown support is tested through Tiptap markdown extension rather than the app storage pipeline.',
    'Tiptap keeps the app on a ProseMirror-derived editor stack.',
  ],
  migrationRisk: 'Medium-high: familiar ProseMirror concepts, but Markdown layer and custom toolbar behavior need validation.',
  async mount(container, markdownText) {
    container.classList.add('editor-benchmark-tiptap')
    const editor = new TiptapEditor({
      element: container,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        TableKit.configure({
          table: { resizable: false },
        }),
        Markdown,
      ],
      content: markdownText,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'editor-benchmark-tiptap-content',
        },
      },
    })

    await waitForEditable(container)
    await waitForAnimationFrame()

    return {
      focusOutsideTable: () => focusOutsideTableText(container),
      focusInsideTable: () => focusInsideTableText(container),
      serializeMarkdown: () => editor.getMarkdown(),
      destroy: () => editor.destroy(),
    } satisfies MountedEditorBenchmark
  },
}
