import { useEffect, useRef, useState } from 'react'
import { editorBenchmarkCandidates, loadEditorBenchmarkAdapter } from './adapters'
import { SLOW_TABLE_LINK_MARKDOWN } from './fixtures'
import type {
  BenchmarkCandidateInfo,
  EditorBenchmarkWindowApi,
  LongTaskSummary,
  MountedEditorBenchmark,
  RenderedShapeSummary,
} from './types'

type MountedInstance = {
  candidateId: string
  mounted: MountedEditorBenchmark
}

type PerformanceWithMemory = Performance & {
  memory?: Record<string, number>
}

export function EditorBenchmarkApp() {
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef<MountedInstance[]>([])
  const longTasksRef = useRef<PerformanceEntry[]>([])
  const [status, setStatus] = useState('Ready')

  useEffect(() => {
    let observer: PerformanceObserver | null = null
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        longTasksRef.current.push(...list.getEntries())
      })
      observer.observe({ entryTypes: ['longtask'] })
    }

    const destroyAll = async () => {
      const mounted = mountedRef.current
      mountedRef.current = []
      for (const instance of mounted) {
        await instance.mounted.destroy()
      }
      if (workspaceRef.current) {
        workspaceRef.current.replaceChildren()
      }
      setStatus('Destroyed mounted benchmark editors.')
    }

    const mountCandidate: EditorBenchmarkWindowApi['mountCandidate'] = async (candidateId, instanceCount = 1) => {
      const candidate = editorBenchmarkCandidates.find((item) => item.id === candidateId)
      if (!candidate) {
        throw new Error(`Unknown benchmark candidate: ${candidateId}`)
      }
      const adapter = await loadEditorBenchmarkAdapter(candidateId)

      const workspace = workspaceRef.current
      if (!workspace) {
        throw new Error('Benchmark workspace is not mounted.')
      }

      await destroyAll()
      const nextMounted: MountedInstance[] = []
      workspace.replaceChildren()

      for (let index = 0; index < instanceCount; index += 1) {
        const shell = document.createElement('section')
        shell.className = 'editor-benchmark-instance'
        shell.dataset.candidateId = candidateId
        shell.dataset.instanceIndex = String(index)

        const label = document.createElement('div')
        label.className = 'editor-benchmark-instance-label'
        label.textContent = `${adapter.name} ${index + 1}`

        const host = document.createElement('div')
        host.className = 'editor-benchmark-editor-host'

        shell.append(label, host)
        workspace.append(shell)

        const mounted = await adapter.mount(host, SLOW_TABLE_LINK_MARKDOWN)
        nextMounted.push({ candidateId, mounted })
      }

      mountedRef.current = nextMounted
      setStatus(`Mounted ${adapter.name} (${instanceCount} instance${instanceCount === 1 ? '' : 's'}).`)
    }

    const getInstance = (instanceIndex = 0): MountedEditorBenchmark => {
      const instance = mountedRef.current[instanceIndex]
      if (!instance) {
        throw new Error(`No mounted editor instance at index ${instanceIndex}.`)
      }
      return instance.mounted
    }

    const getLongTaskSummary = (): LongTaskSummary => {
      const durations = longTasksRef.current.map((entry) => entry.duration)
      return {
        count: durations.length,
        totalMs: durations.reduce((sum, value) => sum + value, 0),
        maxMs: durations.length > 0 ? Math.max(...durations) : 0,
      }
    }

    const getRenderedShape = (instanceIndex = 0): RenderedShapeSummary => {
      const workspace = workspaceRef.current
      const shell = workspace?.querySelector<HTMLElement>(`.editor-benchmark-instance[data-instance-index="${instanceIndex}"]`)
      return {
        tableCount: shell?.querySelectorAll('table').length ?? 0,
        linkCount: shell?.querySelectorAll('a[href]').length ?? 0,
      }
    }

    window.__editorBenchmark = {
      listCandidates: () => editorBenchmarkCandidates.map(toCandidateInfo),
      preloadCandidate: async (candidateId) => {
        await loadEditorBenchmarkAdapter(candidateId)
      },
      mountCandidate,
      focusOutsideTable: async (instanceIndex = 0) => {
        await getInstance(instanceIndex).focusOutsideTable()
      },
      focusInsideTable: async (instanceIndex = 0) => {
        await getInstance(instanceIndex).focusInsideTable()
      },
      serializeMarkdown: async (instanceIndex = 0) => getInstance(instanceIndex).serializeMarkdown(),
      getRenderedShape,
      destroyAll,
      clearLongTasks: () => {
        longTasksRef.current = []
      },
      getLongTaskSummary,
      getHeapSnapshot: () => {
        const memory = (performance as PerformanceWithMemory).memory
        return memory ? { ...memory } : null
      },
    }

    return () => {
      observer?.disconnect()
      void destroyAll()
      delete window.__editorBenchmark
    }
  }, [])

  return (
    <main className="editor-benchmark-shell">
      <header className="editor-benchmark-header">
        <div>
          <h1>Editor Benchmark</h1>
          <p>
            Isolated replacement-editor spike using the slow table plus external-link Markdown fixture.
          </p>
        </div>
        <div className="editor-benchmark-status">{status}</div>
      </header>

      <section className="editor-benchmark-controls" aria-label="Manual benchmark controls">
        {editorBenchmarkCandidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => {
              void window.__editorBenchmark?.mountCandidate(candidate.id)
            }}
          >
            Mount {candidate.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            void window.__editorBenchmark?.destroyAll()
          }}
        >
          Destroy
        </button>
      </section>

      <section className="editor-benchmark-fixture" aria-label="Markdown fixture">
        <h2>Fixture</h2>
        <pre>{SLOW_TABLE_LINK_MARKDOWN}</pre>
      </section>

      <section className="editor-benchmark-workspace" ref={workspaceRef} aria-label="Benchmark workspace" />
    </main>
  )
}

function toCandidateInfo(candidate: BenchmarkCandidateInfo): BenchmarkCandidateInfo {
  return {
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    featureGaps: candidate.featureGaps,
    migrationRisk: candidate.migrationRisk,
  }
}
