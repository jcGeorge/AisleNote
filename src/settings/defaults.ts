import type { AppState } from '../types/app'
import { normalizeNoteCursorLocations } from '../notes/note-cursors'

export const DEFAULT_AUTO_REMOVE_DAYS = 7
export const MIN_AUTO_REMOVE_DAYS = 1
export const MAX_AUTO_REMOVE_DAYS = 365

export const DEFAULT_UI_SETTINGS: AppState['ui'] = {
  showParentHomeTab: true,
  stageManagerOpenDestinationAfterApply: true,
  tabButtonScale: 1,
  noteFontScale: 1,
  noteCursorLocations: {},
}

export const MIN_TAB_BUTTON_SCALE = 1
export const MAX_TAB_BUTTON_SCALE = 1.6
export const TAB_BUTTON_SCALE_STEP = 0.05
export const MIN_NOTE_FONT_SCALE = 0.9
export const MAX_NOTE_FONT_SCALE = 1.8
export const NOTE_FONT_SCALE_STEP = 0.05

export function clampAutoRemoveDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REMOVE_DAYS
  return Math.min(MAX_AUTO_REMOVE_DAYS, Math.max(MIN_AUTO_REMOVE_DAYS, Math.floor(value)))
}

export function clampTabButtonScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.tabButtonScale
  const rounded = Math.round(value / TAB_BUTTON_SCALE_STEP) * TAB_BUTTON_SCALE_STEP
  return Math.min(MAX_TAB_BUTTON_SCALE, Math.max(MIN_TAB_BUTTON_SCALE, Number(rounded.toFixed(2))))
}

export function clampNoteFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SETTINGS.noteFontScale
  const rounded = Math.round(value / NOTE_FONT_SCALE_STEP) * NOTE_FONT_SCALE_STEP
  return Math.min(MAX_NOTE_FONT_SCALE, Math.max(MIN_NOTE_FONT_SCALE, Number(rounded.toFixed(2))))
}

export function normalizeUiSettings(raw: unknown): AppState['ui'] {
  if (!raw || typeof raw !== 'object') return DEFAULT_UI_SETTINGS
  const obj = raw as Record<string, unknown>
  return {
    showParentHomeTab:
      typeof obj.showParentHomeTab === 'boolean' ? obj.showParentHomeTab : DEFAULT_UI_SETTINGS.showParentHomeTab,
    stageManagerOpenDestinationAfterApply:
      typeof obj.stageManagerOpenDestinationAfterApply === 'boolean'
        ? obj.stageManagerOpenDestinationAfterApply
        : DEFAULT_UI_SETTINGS.stageManagerOpenDestinationAfterApply,
    tabButtonScale:
      typeof obj.tabButtonScale === 'number'
        ? clampTabButtonScale(obj.tabButtonScale)
        : DEFAULT_UI_SETTINGS.tabButtonScale,
    noteFontScale:
      typeof obj.noteFontScale === 'number'
        ? clampNoteFontScale(obj.noteFontScale)
        : DEFAULT_UI_SETTINGS.noteFontScale,
    noteCursorLocations: normalizeNoteCursorLocations(obj.noteCursorLocations),
  }
}
