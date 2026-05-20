export function shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive: boolean, button: number) {
  return arrangeModeActive && button === 0
}

export function scheduleNoteWorkspaceArrangeExit(onExitArrangeMode: (() => void) | undefined) {
  if (!onExitArrangeMode) return
  window.setTimeout(onExitArrangeMode, 0)
}
