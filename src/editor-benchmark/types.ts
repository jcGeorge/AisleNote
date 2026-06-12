export type CandidateKind = 'source-markdown' | 'wysiwyg-markdown'

export type RoundTripStatus = 'pass' | 'warn' | 'fail'

export type BenchmarkCandidateInfo = {
  id: string
  name: string
  kind: CandidateKind
  featureGaps: string[]
  migrationRisk: string
}

export type MountedEditorBenchmark = {
  focusOutsideTable: () => Promise<void> | void
  focusInsideTable: () => Promise<void> | void
  serializeMarkdown: () => Promise<string> | string
  destroy: () => Promise<void> | void
}

export type EditorBenchmarkAdapter = BenchmarkCandidateInfo & {
  mount: (container: HTMLElement, markdown: string) => Promise<MountedEditorBenchmark> | MountedEditorBenchmark
}

export type LongTaskSummary = {
  count: number
  totalMs: number
  maxMs: number
}

export type RenderedShapeSummary = {
  tableCount: number
  linkCount: number
}

export type EditorBenchmarkWindowApi = {
  listCandidates: () => BenchmarkCandidateInfo[]
  preloadCandidate: (candidateId: string) => Promise<void>
  mountCandidate: (candidateId: string, instanceCount?: number) => Promise<void>
  focusOutsideTable: (instanceIndex?: number) => Promise<void>
  focusInsideTable: (instanceIndex?: number) => Promise<void>
  serializeMarkdown: (instanceIndex?: number) => Promise<string>
  getRenderedShape: (instanceIndex?: number) => RenderedShapeSummary
  destroyAll: () => Promise<void>
  clearLongTasks: () => void
  getLongTaskSummary: () => LongTaskSummary
  getHeapSnapshot: () => Record<string, number> | null
}

declare global {
  interface Window {
    __editorBenchmark?: EditorBenchmarkWindowApi
  }
}

export {}
