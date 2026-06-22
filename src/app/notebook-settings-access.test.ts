import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const notebookAppSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './NotebookApp.tsx'), 'utf8')
const appCssSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.css'), 'utf8')
const baseCssSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/base.css'), 'utf8')
const settingsCssSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/settings.css'), 'utf8')
const lightCssSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/themes/light.css'), 'utf8')
const dawnCssSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/themes/dawn.css'), 'utf8')

describe('notebook settings access', () => {
  it('renders explicit settings entry points for expanded and collapsed sidebars', () => {
    expect(notebookAppSource).toContain('const handleSidebarSettingsClick = useCallback(() => {')
    expect(notebookAppSource).toContain("if (viewMode === 'settings') {")
    expect(notebookAppSource).toContain("setViewMode('main')")
    expect(notebookAppSource).toContain("openUtilityView('settings')")
    expect(notebookAppSource).toContain('onClick={handleSidebarSettingsClick}')
    expect(notebookAppSource).toContain('Settings')
    expect(notebookAppSource).toContain('aria-label="Open settings"')
    expect(notebookAppSource).toContain('title="Open settings"')
    expect(notebookAppSource).toContain('iconId="settings"')
    expect(appCssSource).toContain('.notebook-sidebar .notebook-icon-button:active')
    expect(appCssSource).toContain('.notebook-sidebar .notebook-icon-button:focus-visible')
    expect(appCssSource).toContain('border-color: transparent;')
    expect(appCssSource).toContain('background: transparent;')
    expect(appCssSource).toContain('outline: 2px solid var(--notebook-sidebar-accent);')
    expect(appCssSource).toContain('background: var(--notebook-sidebar-active-bg);')
    expect(notebookAppSource).not.toContain('Utility\\n')
  })

  it('uses notebook-native hotkeys and hides the dormant scratchpad row', () => {
    expect(notebookAppSource).toContain('useNotebookHotkeys({')
    expect(notebookAppSource).not.toContain('useGlobalHotkeys')
    expect(notebookAppSource).toContain("{ id: 'openSettings', label: 'Open settings' }")
    expect(notebookAppSource).toContain("{ id: 'newNote', label: 'New note' }")
    expect(notebookAppSource).toContain("{ id: 'newFolder', label: 'New folder' }")
    expect(notebookAppSource).not.toContain('Toggle scratchpad')
  })

  it('uses platform-aware notebook hotkey recorder buttons', () => {
    expect(notebookAppSource).toContain('buildShortcutFromKeyboardEvent')
    expect(notebookAppSource).toContain('settings-shortcut-btn')
    expect(notebookAppSource).toContain('formatShortcutLabel(shortcut, isMacPlatform)')
    expect(notebookAppSource).not.toContain('placeholder={formatShortcutLabel(DEFAULT_SHORTCUTS[row.id] ?? \'\', isMacPlatform)}')
  })

  it('restores shortcut menu configuration in notebook settings', () => {
    expect(notebookAppSource).toContain('ShortcutMenuSettingsPanel')
    expect(notebookAppSource).toContain('NEWLINE_OPERATION_LABELS.operationsMenu')
    expect(notebookAppSource).toContain('updateShortcutMenuOperationsSetting')
    expect(notebookAppSource).toContain('onOpenTableOfContents: openTableOfContentsFromEditorShortcut')
    expect(notebookAppSource).toContain("operation === 'tableOfContents'")
  })

  it('removes obsolete permanent delete setting from active notebook settings', () => {
    expect(notebookAppSource).not.toContain('Confirm permanent delete')
    expect(notebookAppSource).not.toContain('trashDeleteForRealRequiresConfirmation')
    expect(notebookAppSource).toContain("window.confirm('Permanently delete this item? This cannot be undone.')")
  })

  it('uses restored notebook misc and frontmatter settings controls', () => {
    expect(notebookAppSource).toContain('settings-segmented-control settings-flag-segmented-control')
    expect(notebookAppSource).toContain('NotebookSettingsSwitch')
    expect(notebookAppSource).toContain('frontmatterDraft')
    expect(notebookAppSource).toContain('Template changes apply only after saving.')
    expect(notebookAppSource).toContain('MIN_SCRATCHPAD_AISLE_LIMIT')
    expect(notebookAppSource).toContain('MAX_SCRATCHPAD_AISLE_LIMIT')
    expect(notebookAppSource).toContain('DEFAULT_SCRATCHPAD_AISLE_LIMIT')
    expect(notebookAppSource).toContain('clampScratchpadAisleLimit(event.target.value)')
    expect(notebookAppSource).toContain("{ id: 'focused-aisle', label: 'Current aisle' }")
    expect(notebookAppSource).not.toContain('Math.max(1, Math.min(12')
  })

  it('keeps notebook settings labels normal weight and switches pill-shaped', () => {
    expect(appCssSource).toContain('.notebook-utility-content label:not([class])')
    expect(appCssSource).toContain('font-weight: 400;')
    expect(settingsCssSource).toContain('width: 2.35rem;')
    expect(settingsCssSource).toContain('height: 1.22rem;')
    expect(settingsCssSource).toContain('border-radius: 999px;')
  })

  it('shows percent readouts for visual scale sliders with standard text and matching active tracks', () => {
    expect(notebookAppSource).toContain('formatScalePercent(noteFontScale)')
    expect(notebookAppSource).toContain('formatScalePercent(toolbarButtonScale)')
    expect(notebookAppSource).toContain('getRangeProgressStyle(noteFontScale, MIN_NOTE_FONT_SCALE, MAX_NOTE_FONT_SCALE)')
    expect(notebookAppSource).toContain('getRangeProgressStyle(toolbarButtonScale, MIN_TOOLBAR_BUTTON_SCALE, MAX_TOOLBAR_BUTTON_SCALE)')
    expect(notebookAppSource).toContain('id="note-font-scale-value"')
    expect(notebookAppSource).toContain('id="toolbar-button-scale-value"')
    expect(notebookAppSource).toContain('MIN_NOTE_FONT_SCALE')
    expect(notebookAppSource).toContain('MAX_NOTE_FONT_SCALE')
    expect(notebookAppSource).toContain('MIN_TOOLBAR_BUTTON_SCALE')
    expect(notebookAppSource).toContain('MAX_TOOLBAR_BUTTON_SCALE')
    expect(settingsCssSource).toContain('min-width: 3.4rem;')
    expect(settingsCssSource).toContain('font-variant-numeric: tabular-nums;')
    expect(settingsCssSource).toContain('--settings-range-progress: 0%;')
    expect(settingsCssSource).toContain('var(--settings-range-thumb-bg) var(--settings-range-progress)')
    expect(baseCssSource).toContain('--settings-range-value-text: var(--app-text-heading);')
    expect(lightCssSource).toContain('--settings-range-value-text: var(--app-text-heading);')
    expect(dawnCssSource).toContain('--settings-range-value-text: var(--app-text-heading);')
    expect(baseCssSource).not.toContain('--settings-range-value-text: var(--custom-palette-primary);')
    expect(baseCssSource).not.toContain('--settings-range-value-text: var(--app-primary);')
  })
})
