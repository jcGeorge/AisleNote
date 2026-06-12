import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { drawSelection, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view'
import type { EditorBenchmarkAdapter, MountedEditorBenchmark } from '../types'

export const codeMirrorAdapter: EditorBenchmarkAdapter = {
  id: 'codemirror-6',
  name: 'CodeMirror 6 Markdown',
  kind: 'source-markdown',
  featureGaps: [
    'Source Markdown editor, not WYSIWYG.',
    'Would need a separate preview or rich editing layer to match current notes UX.',
  ],
  migrationRisk: 'Medium: fastest likely core, but it changes the editing model away from WYSIWYG.',
  mount(container, markdownText) {
    container.classList.add('editor-benchmark-codemirror')
    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: markdownText,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
        ],
      }),
    })

    const focusAtText = (text: string) => {
      const position = Math.max(0, view.state.doc.toString().indexOf(text) + text.length)
      view.dispatch({
        selection: EditorSelection.cursor(position),
        scrollIntoView: true,
      })
      view.focus()
    }

    return {
      focusOutsideTable: () => focusAtText('Fall in line here.'),
      focusInsideTable: () => focusAtText('[copy'),
      serializeMarkdown: () => view.state.doc.toString(),
      destroy: () => view.destroy(),
    } satisfies MountedEditorBenchmark
  },
}
