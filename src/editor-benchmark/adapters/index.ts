import type { BenchmarkCandidateInfo, EditorBenchmarkAdapter } from '../types'

export const editorBenchmarkCandidates: BenchmarkCandidateInfo[] = [
  {
    id: 'toast-ui',
    name: 'Toast UI Editor baseline',
    kind: 'wysiwyg-markdown',
    featureGaps: [
      'Baseline uses Toast UI WYSIWYG and app display prep/blank restore, without app media/note-preview plugins.',
    ],
    migrationRisk: 'Low if retained, but current app diagnostics already show constructor/change/blank-restore costs.',
  },
  {
    id: 'codemirror-6',
    name: 'CodeMirror 6 Markdown',
    kind: 'source-markdown',
    featureGaps: [
      'Source Markdown editor, not WYSIWYG.',
      'Would need a separate preview or rich editing layer to match current notes UX.',
    ],
    migrationRisk: 'Medium: fastest likely core, but it changes the editing model away from WYSIWYG.',
  },
  {
    id: 'mdxeditor',
    name: 'MDXEditor minimal WYSIWYG',
    kind: 'wysiwyg-markdown',
    featureGaps: [
      'Toolbar, app-specific commands, and custom note/media behavior are not included in this spike.',
      'MDX support is unused here; this is testing its Markdown WYSIWYG core.',
    ],
    migrationRisk: 'Medium: React/Lexical foundation with Markdown input/output, but toolbar and custom behaviors need replacement.',
  },
  {
    id: 'lexical-direct',
    name: 'Lexical direct minimal rich editor',
    kind: 'wysiwyg-markdown',
    featureGaps: [
      'Direct Lexical needs custom Markdown table transformers for a production-quality Markdown table round trip.',
      'Toolbar, commands, paste handling, and app-specific note/media behavior would be custom migration work.',
    ],
    migrationRisk: 'High: strong editor foundation, but direct migration requires owning Markdown table behavior and more editor plumbing.',
  },
  {
    id: 'tiptap',
    name: 'Tiptap minimal Markdown',
    kind: 'wysiwyg-markdown',
    featureGaps: [
      'Markdown support is tested through Tiptap markdown extension rather than the app storage pipeline.',
      'Tiptap keeps the app on a ProseMirror-derived editor stack.',
    ],
    migrationRisk: 'Medium-high: familiar ProseMirror concepts, but Markdown layer and custom toolbar behavior need validation.',
  },
]

export async function loadEditorBenchmarkAdapter(candidateId: string): Promise<EditorBenchmarkAdapter> {
  switch (candidateId) {
    case 'toast-ui':
      return (await import('./toast-ui-adapter')).toastUiAdapter
    case 'codemirror-6':
      return (await import('./code-mirror-adapter')).codeMirrorAdapter
    case 'mdxeditor':
      await preparePrismGlobal()
      return (await import('./mdx-editor-adapter')).mdxEditorAdapter
    case 'lexical-direct':
      return (await import('./lexical-direct-adapter')).lexicalDirectAdapter
    case 'tiptap':
      return (await import('./tiptap-adapter')).tiptapAdapter
    default:
      throw new Error(`Unknown benchmark candidate: ${candidateId}`)
  }
}

async function preparePrismGlobal(): Promise<void> {
  const prismModule = await import('prismjs')
  const prism = 'default' in prismModule ? prismModule.default : prismModule
  const globalWithPrism = globalThis as typeof globalThis & { Prism?: unknown }
  globalWithPrism.Prism = prism
}
