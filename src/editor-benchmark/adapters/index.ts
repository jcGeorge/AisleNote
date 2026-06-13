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
]

export async function loadEditorBenchmarkAdapter(candidateId: string): Promise<EditorBenchmarkAdapter> {
  switch (candidateId) {
    case 'toast-ui':
      return (await import('./toast-ui-adapter')).toastUiAdapter
    default:
      throw new Error(`Unknown benchmark candidate: ${candidateId}`)
  }
}
