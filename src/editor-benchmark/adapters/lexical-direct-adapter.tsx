import { createRoot, type Root } from 'react-dom/client'
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown'
import { type LexicalEditor } from 'lexical'
import type { EditorBenchmarkAdapter, MountedEditorBenchmark } from '../types'
import { focusInsideTableText, focusOutsideTableText, waitForAnimationFrame, waitForEditable } from './dom'
import { LexicalBenchmarkEditor } from './lexical-direct-components'

export const lexicalDirectAdapter: EditorBenchmarkAdapter = {
  id: 'lexical-direct',
  name: 'Lexical direct minimal rich editor',
  kind: 'wysiwyg-markdown',
  featureGaps: [
    'Direct Lexical needs custom Markdown table transformers for a production-quality Markdown table round trip.',
    'Toolbar, commands, paste handling, and app-specific note/media behavior would be custom migration work.',
  ],
  migrationRisk: 'High: strong editor foundation, but direct migration requires owning Markdown table behavior and more editor plumbing.',
  async mount(container, markdownText) {
    container.classList.add('editor-benchmark-lexical')
    const root: Root = createRoot(container)
    const editorPromise = new Promise<LexicalEditor>((resolve) => {
      root.render(<LexicalBenchmarkEditor markdownText={markdownText} onReady={resolve} />)
    })

    const editor = await editorPromise
    await waitForEditable(container)
    await waitForAnimationFrame()

    return {
      focusOutsideTable: () => focusOutsideTableText(container),
      focusInsideTable: () => focusInsideTableText(container),
      serializeMarkdown: () => editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS)),
      destroy: () => root.unmount(),
    } satisfies MountedEditorBenchmark
  },
}
