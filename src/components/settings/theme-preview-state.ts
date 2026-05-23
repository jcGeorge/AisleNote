export type ThemePreviewRail = 'domain' | 'space' | 'parent' | 'subtab'
export type ThemePreviewRailSample = 0 | 1 | 2
export type ThemePreviewTask = 'done' | 'open'
export type ThemePreviewRailSelection = Record<ThemePreviewRail, ThemePreviewRailSample>
export type ThemePreviewTaskState = Record<ThemePreviewTask, boolean>

export const DEFAULT_THEME_PREVIEW_RAIL_SELECTION: ThemePreviewRailSelection = {
  domain: 0,
  space: 1,
  parent: 1,
  subtab: 0,
}

export const DEFAULT_THEME_PREVIEW_TASK_STATE: ThemePreviewTaskState = {
  done: true,
  open: false,
}

export function selectThemePreviewRailSample(
  selection: ThemePreviewRailSelection,
  rail: ThemePreviewRail,
  sample: ThemePreviewRailSample,
): ThemePreviewRailSelection {
  if (selection[rail] === sample) return selection
  return { ...selection, [rail]: sample }
}

export function toggleThemePreviewTaskState(
  tasks: ThemePreviewTaskState,
  task: ThemePreviewTask,
): ThemePreviewTaskState {
  return { ...tasks, [task]: !tasks[task] }
}
