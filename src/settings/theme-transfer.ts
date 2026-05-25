import type { CustomThemePalette, CustomThemePaletteSlot } from '../types/app'
import { CUSTOM_THEME_PALETTE_SLOTS, normalizeHexColor } from './defaults'

export type ThemeSettingsImportResult =
  | { ok: true; palette: CustomThemePalette; importedSlots: CustomThemePaletteSlot[] }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getPaletteCandidate(parsed: unknown): Record<string, unknown> | null {
  if (!isRecord(parsed)) return null
  if (isRecord(parsed.ui)) {
    const uiTheme =
      typeof parsed.ui.theme === 'string'
        ? parsed.ui.theme
        : typeof parsed.theme === 'string'
          ? parsed.theme
          : null
    if (isRecord(parsed.ui.customThemePalette)) return parsed.ui.customThemePalette
    if (isRecord(parsed.ui.themePalettes)) {
      if (uiTheme && isRecord(parsed.ui.themePalettes[uiTheme])) return parsed.ui.themePalettes[uiTheme]
      if (isRecord(parsed.ui.themePalettes.custom1)) return parsed.ui.themePalettes.custom1
    }
  }
  if (isRecord(parsed.palette)) return parsed.palette
  if (isRecord(parsed.customThemePalette)) return parsed.customThemePalette
  if (isRecord(parsed.themePalettes)) {
    const theme = typeof parsed.theme === 'string' ? parsed.theme : null
    if (theme && isRecord(parsed.themePalettes[theme])) return parsed.themePalettes[theme]
    if (isRecord(parsed.themePalettes.custom1)) return parsed.themePalettes.custom1
  }
  return parsed
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
    return { ok: false, error: 'invalid json.' }
  }

  const candidate = getPaletteCandidate(parsed)
  if (!candidate) return { ok: false, error: 'no theme palette found.' }

  const importedSlots = CUSTOM_THEME_PALETTE_SLOTS.filter((slot) => Object.prototype.hasOwnProperty.call(candidate, slot))
  if (importedSlots.length === 0) return { ok: false, error: 'no theme colors found.' }

  const invalidSlots = importedSlots.filter((slot) => normalizeHexColor(candidate[slot]) === null)
  if (invalidSlots.length > 0) {
    return { ok: false, error: `missing or invalid colors: ${formatSlotList(invalidSlots)}.` }
  }

  const palette = importedSlots.reduce<CustomThemePalette>((nextPalette, slot) => {
    nextPalette[slot] = normalizeHexColor(candidate[slot]) ?? nextPalette[slot]
    return nextPalette
  }, { ...currentPalette })

  return { ok: true, palette, importedSlots }
}
