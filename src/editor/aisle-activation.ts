export type AisleActivationSource = 'pointer' | 'focus' | 'programmatic'

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

export function shouldFocusAislePointerActivation(currentAisleId: string, targetAisleId: string): boolean {
  void currentAisleId
  void targetAisleId
  return false
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

export function resolveProgrammaticAisleRewriteMarkdown({
  isProgrammaticRewrite,
  expectedMarkdown,
  currentMarkdown,
}: {
  isProgrammaticRewrite: boolean
  expectedMarkdown: string | undefined
  currentMarkdown: string
}): string | null {
  if (!isProgrammaticRewrite) return null
  return expectedMarkdown ?? currentMarkdown
}
