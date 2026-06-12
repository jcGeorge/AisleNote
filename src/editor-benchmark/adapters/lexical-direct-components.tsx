import { useEffect } from 'react'
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { CodeHighlightNode, CodeNode } from '@lexical/code'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { type LexicalEditor } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'

type LexicalBenchmarkEditorProps = {
  markdownText: string
  onReady: (editor: LexicalEditor) => void
}

export function LexicalBenchmarkEditor({ markdownText, onReady }: LexicalBenchmarkEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'editor-benchmark-lexical',
        nodes: [
          AutoLinkNode,
          CodeHighlightNode,
          CodeNode,
          HeadingNode,
          LinkNode,
          ListItemNode,
          ListNode,
          QuoteNode,
          TableCellNode,
          TableNode,
          TableRowNode,
        ],
        onError(error) {
          throw error
        },
        editorState: () => {
          $convertFromMarkdownString(markdownText, TRANSFORMERS)
        },
      }}
    >
      <RichTextPlugin
        contentEditable={<ContentEditable className="editor-benchmark-lexical-content" />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <LinkPlugin />
      <TablePlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <LexicalReadyProbe onReady={onReady} />
    </LexicalComposer>
  )
}

function LexicalReadyProbe({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    onReady(editor)
  }, [editor, onReady])
  return null
}
