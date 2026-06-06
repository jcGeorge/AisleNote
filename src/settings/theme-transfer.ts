import type { CustomThemePalette, CustomThemePaletteSlot } from '../types/app'
import { CUSTOM_THEME_PALETTE_SLOTS, normalizeHexColor } from './defaults'

export type ThemeSettingsImportResult =
  | { ok: true; palette: CustomThemePalette; importedSlots: CustomThemePaletteSlot[] }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatSlotList(slots: CustomThemePaletteSlot[]) {
  const visible = slots.slice(0, 4).join(', ')
  return slots.length > 4 ? `${visible}, and ${slots.length - 4} more` : visible
}

export function serializeThemeSettings(palette: CustomThemePalette): string {
  return JSON.stringify(palette, null, 2)
}

export function parseThemeSettingsImport(raw: string, currentPalette: CustomThemePalette): ThemeSettingsImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Invalid JSON.' }
  }

  if (!isRecord(parsed)) return { ok: false, error: 'No theme palette found.' }
  const candidate = parsed

  const importedSlots = CUSTOM_THEME_PALETTE_SLOTS.filter((slot) => Object.prototype.hasOwnProperty.call(candidate, slot))
  if (importedSlots.length === 0) return { ok: false, error: 'No theme colors found.' }

  const invalidSlots = importedSlots.filter((slot) => normalizeHexColor(candidate[slot]) === null)
  if (invalidSlots.length > 0) {
    return { ok: false, error: `Missing or invalid colors: ${formatSlotList(invalidSlots)}.` }
  }

  const palette = importedSlots.reduce<CustomThemePalette>((nextPalette, slot) => {
    nextPalette[slot] = normalizeHexColor(candidate[slot]) ?? nextPalette[slot]
    return nextPalette
  }, { ...currentPalette })

  return { ok: true, palette, importedSlots }
}
