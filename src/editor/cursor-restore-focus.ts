export function shouldFocusPendingCursorRestore(
  pendingFocusAisleId: string | null | undefined,
  targetAisleId: string,
) {
  return Boolean(pendingFocusAisleId && pendingFocusAisleId === targetAisleId)
}
