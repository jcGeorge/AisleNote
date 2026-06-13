export type EditorMarkdownSyncSnapshot = {
  canonicalMarkdown: string
  displayMarkdown: string
}

export type EditorMarkdownSyncOptions = {
  normalizeForPersistence: (markdown: string) => string
  normalizeForDisplay: (markdown: string) => string
}

export type EditorDisplayRewriteDiagnosticInput = {
  aisleId: string
  reason: string
  currentCanonicalMarkdown: string
  expectedCanonicalMarkdown: string
  expectedDisplayMarkdown: string
}

export type EditorChangeCommitInput = {
  isProgrammaticDisplayChange: boolean
  currentCanonicalMarkdown: string
  nextCanonicalMarkdown: string
}

export type LazyContentCommitFallbackInput = {
  pendingMarkdown?: string | null
  cachedMarkdown?: string | null
  committedMarkdown: string
}

function getStableMarkdownLength(markdown: string): number {
  return String(markdown ?? '').length
}

export function getEditorMarkdownSyncSnapshot(
  markdown: string,
  { normalizeForPersistence, normalizeForDisplay }: EditorMarkdownSyncOptions,
): EditorMarkdownSyncSnapshot {
  const canonicalMarkdown = normalizeForPersistence(markdown)
  return {
    canonicalMarkdown,
    displayMarkdown: normalizeForDisplay(canonicalMarkdown),
  }
}

export function shouldApplyEditorDisplayRewrite({
  currentCanonicalMarkdown,
  expectedCanonicalMarkdown,
}: {
  currentCanonicalMarkdown: string
  expectedCanonicalMarkdown: string
}): boolean {
  return currentCanonicalMarkdown !== expectedCanonicalMarkdown
}

export function shouldScheduleContentCommitForEditorChange({
  isProgrammaticDisplayChange,
  currentCanonicalMarkdown,
  nextCanonicalMarkdown,
}: EditorChangeCommitInput): boolean {
  if (!isProgrammaticDisplayChange) return true
  return currentCanonicalMarkdown !== nextCanonicalMarkdown
}

export function hasMountedLinkedAisleEditor({
  sourceAisleId,
  mountedAisleIds,
  getAisleBodyIdForAisleId,
}: {
  sourceAisleId: string
  mountedAisleIds: Iterable<string>
  getAisleBodyIdForAisleId: (aisleId: string) => string
}): boolean {
  const sourceAisleBodyId = getAisleBodyIdForAisleId(sourceAisleId)
  for (const mountedAisleId of mountedAisleIds) {
    if (mountedAisleId === sourceAisleId) continue
    if (getAisleBodyIdForAisleId(mountedAisleId) === sourceAisleBodyId) return true
  }
  return false
}

export function chooseLazyContentCommitFallbackMarkdown({
  pendingMarkdown,
  cachedMarkdown,
  committedMarkdown,
}: LazyContentCommitFallbackInput): string {
  return pendingMarkdown ?? cachedMarkdown ?? committedMarkdown
}

export function getEditorDisplayRewriteDiagnosticDetails({
  aisleId,
  reason,
  currentCanonicalMarkdown,
  expectedCanonicalMarkdown,
  expectedDisplayMarkdown,
}: EditorDisplayRewriteDiagnosticInput) {
  return {
    aisleId,
    reason,
    currentCanonicalLength: getStableMarkdownLength(currentCanonicalMarkdown),
    expectedCanonicalLength: getStableMarkdownLength(expectedCanonicalMarkdown),
    expectedDisplayLength: getStableMarkdownLength(expectedDisplayMarkdown),
    canonicalMismatch: currentCanonicalMarkdown !== expectedCanonicalMarkdown,
    displayDiffersFromCanonical: expectedDisplayMarkdown !== expectedCanonicalMarkdown,
  }
}
