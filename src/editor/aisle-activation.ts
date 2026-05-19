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
