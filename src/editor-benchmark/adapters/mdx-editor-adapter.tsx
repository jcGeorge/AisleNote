import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import type { EditorBenchmarkAdapter, MountedEditorBenchmark } from '../types'
import { focusInsideTableText, focusOutsideTableText, waitForAnimationFrame, waitForEditable } from './dom'

export const mdxEditorAdapter: EditorBenchmarkAdapter = {
  id: 'mdxeditor',
  name: 'MDXEditor minimal WYSIWYG',
  kind: 'wysiwyg-markdown',
  featureGaps: [
    'Toolbar, app-specific commands, and custom note/media behavior are not included in this spike.',
    'MDX support is unused here; this is testing its Markdown WYSIWYG core.',
  ],
  migrationRisk: 'Medium: React/Lexical foundation with Markdown input/output, but toolbar and custom behaviors need replacement.',
  async mount(container, markdownText) {
    container.classList.add('editor-benchmark-mdxeditor')
    const root: Root = createRoot(container)
    const editorRef = createRef<MDXEditorMethods>()

    root.render(
      <MDXEditor
        ref={editorRef}
        markdown={markdownText}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          tablePlugin(),
          markdownShortcutPlugin(),
        ]}
      />,
    )

    await waitForEditable(container)
    await waitForAnimationFrame()

    return {
      focusOutsideTable: () => focusOutsideTableText(container),
      focusInsideTable: () => focusInsideTableText(container),
      serializeMarkdown: () => editorRef.current?.getMarkdown() ?? '',
      destroy: () => root.unmount(),
    } satisfies MountedEditorBenchmark
  },
}
