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
  return Boolean(targetAisleId && currentAisleId !== targetAisleId)
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
