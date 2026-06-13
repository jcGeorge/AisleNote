import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const outputDir = resolve(repoRoot, 'editor-benchmark-results')
const port = Number(process.env.EDITOR_BENCHMARK_PORT ?? 5187)
const benchmarkUrl = `http://127.0.0.1:${port}/editor-benchmark.html`
const outsideText = ' outside text latency check with plain words 12345'
const insideText = ' inside table link typing latency check 1234567890'

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    BROWSER: 'none',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let viteOutput = ''
vite.stdout.on('data', (chunk) => {
  viteOutput += chunk.toString()
})
vite.stderr.on('data', (chunk) => {
  viteOutput += chunk.toString()
})

try {
  await waitForHttp(benchmarkUrl)
  const results = await runBenchmark()
  await writeReports(results)
  console.log(`Editor benchmark complete: ${resolve(outputDir, 'latest.md')}`)
} catch (error) {
  console.error('Editor benchmark failed.')
  if (viteOutput.trim()) {
    console.error('\nVite output:\n')
    console.error(viteOutput.trim())
  }
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
} finally {
  vite.kill('SIGTERM')
}

async function runBenchmark() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const startedAt = new Date().toISOString()

  try {
    await page.goto(benchmarkUrl, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean(window.__editorBenchmark), undefined, { timeout: 30000 })

    const candidates = await page.evaluate(() => window.__editorBenchmark?.listCandidates() ?? [])
    const candidateResults = []
    for (const candidate of candidates) {
      candidateResults.push(await runCandidate(page, candidate))
    }

    return {
      generatedAt: startedAt,
      url: benchmarkUrl,
      fixture: 'small Markdown table with external lucide.dev links',
      candidates: candidateResults,
      recommendation: createRecommendation(candidateResults),
    }
  } finally {
    await browser.close()
  }
}

async function runCandidate(page, candidate) {
  await page.evaluate(() => window.__editorBenchmark?.destroyAll())
  await page.evaluate(() => window.__editorBenchmark?.clearLongTasks())

  const result = {
    candidate,
    ok: false,
    error: null,
    mountMs: 0,
    firstFocusOutsideMs: 0,
    firstFocusInsideMs: 0,
    typeOutside: emptySummary(),
    typeInside: emptySummary(),
    serializeMs: 0,
    destroyMs: 0,
    remountMs: 0,
    fourEditorSwitch: emptySummary(),
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    heap: null,
    renderedShape: { tableCount: 0, linkCount: 0 },
    roundTrip: { status: 'fail', notes: ['Candidate did not complete.'] },
    markdownChars: 0,
  }

  try {
    await page.evaluate((candidateId) => window.__editorBenchmark?.preloadCandidate(candidateId), candidate.id)
    result.mountMs = await measure(() => page.evaluate((candidateId) => window.__editorBenchmark?.mountCandidate(candidateId), candidate.id))
    result.renderedShape = await page.evaluate(() => window.__editorBenchmark?.getRenderedShape() ?? { tableCount: 0, linkCount: 0 })
    result.firstFocusOutsideMs = await measure(() => page.evaluate(() => window.__editorBenchmark?.focusOutsideTable()))
    result.typeOutside = summarizeDurations(await typeTextByCharacter(page, outsideText))
    result.firstFocusInsideMs = await measure(() => page.evaluate(() => window.__editorBenchmark?.focusInsideTable()))
    result.typeInside = summarizeDurations(await typeTextByCharacter(page, insideText))

    let markdown = ''
    result.serializeMs = await measure(async () => {
      markdown = await page.evaluate(() => window.__editorBenchmark?.serializeMarkdown() ?? '')
    })
    result.markdownChars = markdown.length
    result.roundTrip = assessMarkdownRoundTrip(markdown, candidate, result.renderedShape)

    result.destroyMs = await measure(() => page.evaluate(() => window.__editorBenchmark?.destroyAll()))
    result.remountMs = await measure(async () => {
      await page.evaluate((candidateId) => window.__editorBenchmark?.mountCandidate(candidateId), candidate.id)
    })
    await page.evaluate(() => window.__editorBenchmark?.destroyAll())

    await page.evaluate((candidateId) => window.__editorBenchmark?.mountCandidate(candidateId, 4), candidate.id)
    const switchDurations = []
    for (const instanceIndex of [0, 1, 2, 3, 0, 3, 1]) {
      switchDurations.push(await measure(() => page.evaluate((index) => window.__editorBenchmark?.focusInsideTable(index), instanceIndex)))
    }
    result.fourEditorSwitch = summarizeDurations(switchDurations)
    result.heap = await page.evaluate(() => window.__editorBenchmark?.getHeapSnapshot() ?? null)
    result.longTasks = await page.evaluate(() => window.__editorBenchmark?.getLongTaskSummary() ?? { count: 0, totalMs: 0, maxMs: 0 })
    await page.evaluate(() => window.__editorBenchmark?.destroyAll())

    result.ok = true
    return result
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    try {
      await page.evaluate(() => window.__editorBenchmark?.destroyAll())
    } catch {
      // Ignore cleanup errors so the candidate failure remains the reported issue.
    }
    return result
  }
}

async function typeTextByCharacter(page, text) {
  const durations = []
  for (const character of text) {
    durations.push(await measure(async () => {
      await page.keyboard.type(character)
      await waitForNextAnimationFrame(page)
    }))
  }
  return durations
}

async function waitForNextAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => resolve(null))))
}

async function measure(operation) {
  const startedAt = performance.now()
  await operation()
  return performance.now() - startedAt
}

function summarizeDurations(values) {
  if (values.length === 0) return emptySummary()
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: values.length,
    p50: roundMs(percentile(sorted, 0.5)),
    p95: roundMs(percentile(sorted, 0.95)),
    max: roundMs(sorted[sorted.length - 1] ?? 0),
    total: roundMs(values.reduce((sum, value) => sum + value, 0)),
  }
}

function emptySummary() {
  return { count: 0, p50: 0, p95: 0, max: 0, total: 0 }
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1)
  return sortedValues[index] ?? 0
}

function assessMarkdownRoundTrip(markdown, candidate, renderedShape) {
  const requiredTokens = [
    '# Completed items',
    'https://lucide.dev/icons/files',
    'https://lucide.dev/icons/table-of-contents',
    'https://lucide.dev/icons/delete',
  ]
  const notes = []
  const missingTokens = requiredTokens.filter((token) => !markdown.includes(token))
  if (missingTokens.length > 0) {
    notes.push(`Missing required fixture tokens: ${missingTokens.join(', ')}`)
  }

  const hasMarkdownTableShape = markdown.includes('|') && markdown.includes('---')
  const hasHtmlTableShape = /<table[\s>]/i.test(markdown)
  if (!hasMarkdownTableShape && !hasHtmlTableShape) {
    notes.push('Serialized output no longer has a recognizable table shape.')
  } else if (!hasMarkdownTableShape && hasHtmlTableShape) {
    notes.push('Serialized output kept table content as HTML instead of Markdown table syntax.')
  }

  if (candidate.kind === 'wysiwyg-markdown' && renderedShape.tableCount === 0) {
    notes.push('Rendered editor did not expose a table element, so the table was not actually WYSIWYG in this harness.')
  }

  return {
    status: missingTokens.length > 0 || (candidate.kind === 'wysiwyg-markdown' && renderedShape.tableCount === 0)
      ? 'fail'
      : notes.length > 0
        ? 'warn'
        : 'pass',
    notes: notes.length > 0 ? notes : ['Fixture heading, table shape, and sampled external links survived.'],
  }
}

function createRecommendation(results) {
  const successful = results.filter((result) => result.ok)
  const toast = successful.find((result) => result.candidate.id === 'toast-ui')

  if (toast && meetsToastUiKeepThreshold(toast)) {
    return 'Toast UI met the benchmark thresholds.'
  }

  return 'Toast UI did not meet the benchmark thresholds; inspect production editor diagnostics and Toast-specific plugins before changing editor foundations.'
}

function meetsToastUiKeepThreshold(result) {
  return (
    result.mountMs < 250 &&
    result.typeOutside.p95 < 50 &&
    result.typeInside.p95 < 50 &&
    result.typeOutside.max < 100 &&
    result.typeInside.max < 100 &&
    result.roundTrip.status !== 'fail'
  )
}

async function writeReports(results) {
  await mkdir(outputDir, { recursive: true })
  await writeFile(resolve(outputDir, 'latest.json'), `${JSON.stringify(results, null, 2)}\n`)
  await writeFile(resolve(outputDir, 'latest.md'), createMarkdownReport(results))
}

function createMarkdownReport(results) {
  const lines = [
    '# Toast UI Editor Benchmark',
    '',
    `Generated: ${results.generatedAt}`,
    `Fixture: ${results.fixture}`,
    '',
    '## Raw Numbers',
    '',
    '| Candidate | OK | Mount ms | Rendered table/links | Focus out ms | Type out p50/p95/max | Focus in ms | Type in p50/p95/max | Serialize ms | Destroy ms | Remount ms | Switch p50/p95/max | Long tasks | Round trip |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...results.candidates.map(formatResultRow),
    '',
    '## Candidates Tested',
    '',
    ...results.candidates.flatMap(formatCandidateSection),
    '',
    '## Recommendation',
    '',
    results.recommendation,
    '',
  ]

  return `${lines.join('\n')}\n`
}

function formatResultRow(result) {
  const typeOutside = formatSummary(result.typeOutside)
  const typeInside = formatSummary(result.typeInside)
  const switchSummary = formatSummary(result.fourEditorSwitch)
  const longTasks = `${result.longTasks.count} / ${roundMs(result.longTasks.totalMs)}ms`
  return [
    `| ${result.candidate.name}`,
    result.ok ? 'yes' : 'no',
    formatNumber(result.mountMs),
    `${result.renderedShape.tableCount}/${result.renderedShape.linkCount}`,
    formatNumber(result.firstFocusOutsideMs),
    typeOutside,
    formatNumber(result.firstFocusInsideMs),
    typeInside,
    formatNumber(result.serializeMs),
    formatNumber(result.destroyMs),
    formatNumber(result.remountMs),
    switchSummary,
    longTasks,
    result.roundTrip.status,
  ].join(' | ') + ' |'
}

function formatCandidateSection(result) {
  return [
    `### ${result.candidate.name}`,
    '',
    `- ID: \`${result.candidate.id}\``,
    `- Kind: ${result.candidate.kind}`,
    `- Status: ${result.ok ? 'completed' : `failed: ${result.error ?? 'unknown error'}`}`,
    `- Rendered shape: ${result.renderedShape.tableCount} table element(s), ${result.renderedShape.linkCount} link element(s).`,
    `- Markdown round trip: ${result.roundTrip.status}; ${result.roundTrip.notes.join(' ')}`,
    `- Feature gaps: ${result.candidate.featureGaps.join(' ')}`,
    `- Migration risk: ${result.candidate.migrationRisk}`,
    '',
  ]
}

function formatSummary(summary) {
  return `${summary.p50}/${summary.p95}/${summary.max}`
}

function formatNumber(value) {
  return String(roundMs(value))
}

function roundMs(value) {
  return Math.round(value * 10) / 10
}

async function waitForHttp(url) {
  const deadline = Date.now() + 30000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for Vite benchmark server at ${url}: ${lastError instanceof Error ? lastError.message : 'no response'}`)
}
