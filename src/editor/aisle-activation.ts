export type AisleActivationSource = 'pointer' | 'focus' | 'programmatic'
export const AISLE_ACTIVATION_WARNING_THRESHOLD_MS = 25

export function shouldUseFastSameAisleActivation({
  switchingAisle,
  editorRefMatches,
  pluginKeyMatches,
  activeAisleStateMatches,
}: {
  switchingAisle: boolean
  editorRefMatches: boolean
  pluginKeyMatches: boolean
  activeAisleStateMatches: boolean
}) {
  return !switchingAisle && editorRefMatches && pluginKeyMatches && activeAisleStateMatches
}

export function shouldClearPendingCursorRestoreForAisleActivation(
  source: AisleActivationSource | undefined,
): boolean {
  return source === 'pointer'
}

export function getActiveAisleRefSyncValue({
  currentAisleId,
  resolvedActiveAisleId,
  activeAisleIds,
}: {
  currentAisleId: string
  resolvedActiveAisleId: string
  activeAisleIds: string[]
}): string {
  return currentAisleId && activeAisleIds.includes(currentAisleId) ? currentAisleId : resolvedActiveAisleId
}

export function shouldDeferAisleCycleForMouseActivation(
  pendingActivation: { aisleId: string; settled: boolean } | null | undefined,
  currentAisleId: string,
): boolean {
  return Boolean(pendingActivation && !pendingActivation.settled && pendingActivation.aisleId === currentAisleId)
}

export type AisleActivationDiagnosticInput = {
  requestedAisleId: string
  previousAisleId: string
  source: AisleActivationSource
  result: string
  durationMs: number
  focus: boolean
  flushPrevious: boolean
  mountedEditorCount: number
}

export type AisleActivationDiagnosticSummary = {
  requestedAisleId: string
  previousAisleId: string
  count: number
  sources: AisleActivationSource[]
  results: string[]
  maxDurationMs: number
  focusRequested: boolean
  flushPreviousRequested: boolean
  mountedEditorCount: number
}

export function createAisleActivationDiagnosticSummary(
  input: AisleActivationDiagnosticInput,
): AisleActivationDiagnosticSummary {
  return {
    requestedAisleId: input.requestedAisleId,
    previousAisleId: input.previousAisleId,
    count: 1,
    sources: [input.source],
    results: [input.result],
    maxDurationMs: input.durationMs,
    focusRequested: input.focus,
    flushPreviousRequested: input.flushPrevious,
    mountedEditorCount: input.mountedEditorCount,
  }
}

function appendUnique<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values : [...values, value]
}

export function mergeAisleActivationDiagnosticSummary(
  summary: AisleActivationDiagnosticSummary,
  input: AisleActivationDiagnosticInput,
): AisleActivationDiagnosticSummary {
  return {
    requestedAisleId: summary.requestedAisleId,
    previousAisleId: summary.previousAisleId,
    count: summary.count + 1,
    sources: appendUnique(summary.sources, input.source),
    results: appendUnique(summary.results, input.result),
    maxDurationMs: Math.max(summary.maxDurationMs, input.durationMs),
    focusRequested: summary.focusRequested || input.focus,
    flushPreviousRequested: summary.flushPreviousRequested || input.flushPrevious,
    mountedEditorCount: Math.max(summary.mountedEditorCount, input.mountedEditorCount),
  }
}
