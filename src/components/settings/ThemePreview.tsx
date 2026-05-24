import type { CSSProperties, KeyboardEvent } from 'react'
import {
  DEFAULT_CUSTOM_THEME_PALETTE,
  isCustomTheme,
  isThemePaletteSeed,
  normalizeHexColor,
} from '../../settings/defaults'
import type {
  AppTheme,
  CustomThemePalette,
  CustomThemePaletteSlot,
  ToolbarToolId,
} from '../../types/app'
import { ToolbarToolVisual } from '../editor/ToolbarToolVisual'
import type {
  ThemePreviewRail,
  ThemePreviewRailSample,
  ThemePreviewRailSelection,
  ThemePreviewTask,
  ThemePreviewTaskState,
} from './theme-preview-state'

const THEME_PREVIEW_RAILS: Array<{
  id: ThemePreviewRail
  label: string
  ariaLabel: string
  sampleCount: 2 | 3
  className: string
  selectedClassName: string
  useAriaSelected?: boolean
}> = [
  {
    id: 'domain',
    label: 'domain',
    ariaLabel: 'domain rail',
    sampleCount: 2,
    className: 'compact-scope-btn compact-domain-btn',
    selectedClassName: 'is-active',
  },
  {
    id: 'space',
    label: 'space',
    ariaLabel: 'space rail',
    sampleCount: 2,
    className: 'compact-scope-btn compact-space-btn',
    selectedClassName: 'is-active',
  },
  {
    id: 'parent',
    label: 'parent',
    ariaLabel: 'parent rail',
    sampleCount: 2,
    className: 'btn btn-sm tab-btn parent-tab-btn',
    selectedClassName: '',
    useAriaSelected: true,
  },
  {
    id: 'subtab',
    label: 'sub',
    ariaLabel: 'subtab rail',
    sampleCount: 2,
    className: 'btn btn-sm tab-btn subtab-btn',
    selectedClassName: '',
    useAriaSelected: true,
  },
]

const THEME_PREVIEW_SAMPLE_INDICES: ThemePreviewRailSample[] = [0, 1, 2]
const THEME_PREVIEW_TOOLBAR_TOOLS: ToolbarToolId[] = ['heading', 'dashList', 'taskList', 'image', 'table']

const BUILT_IN_THEME_PREVIEW_NAV_RAIL_BG: Partial<Record<AppTheme, string>> = {
  dark: '#0f1b32',
  light: '#eef4fb',
  dawn: '#b99a45',
  blues: '#8797b0',
}

const BUILT_IN_THEME_PREVIEW_NAV_RAIL_BORDER: Partial<Record<AppTheme, string>> = {
  dark: 'color-mix(in srgb, #24334d 70%, transparent)',
  light: 'rgba(134, 157, 195, 0.24)',
  dawn: 'rgba(93, 75, 34, 0.24)',
  blues: 'rgba(47, 65, 98, 0.24)',
}

const BUILT_IN_THEME_PREVIEW_EDITOR_TOOLBAR_BG: Partial<Record<AppTheme, string>> = {
  dark: '#0f1b32',
  light: '#f4f7fc',
  dawn: '#c7b37a',
  blues: '#8fa0b8',
}

const BUILT_IN_THEME_PREVIEW_EDITOR_BORDER: Partial<Record<AppTheme, string>> = {
  dark: '#24334d',
  light: '#d2dbe9',
  dawn: '#8a744a',
  blues: '#61728f',
}

type ThemePreviewProps = {
  theme: AppTheme
  customThemePaletteDraft: CustomThemePalette
  tabButtonScaleDraft: number
  noteFontScaleDraft: number
  railSelection: ThemePreviewRailSelection
  tasks: ThemePreviewTaskState
  onRailSampleSelect: (rail: ThemePreviewRail, sample: ThemePreviewRailSample) => void
  onTaskToggle: (task: ThemePreviewTask) => void
}

function getPaletteColorPickerValue(palette: CustomThemePalette, slot: CustomThemePaletteSlot) {
  return normalizeHexColor(palette[slot]) ?? DEFAULT_CUSTOM_THEME_PALETTE[slot]
}

export function ThemePreview({
  theme,
  customThemePaletteDraft,
  tabButtonScaleDraft,
  noteFontScaleDraft,
  railSelection,
  tasks,
  onRailSampleSelect,
  onTaskToggle,
}: ThemePreviewProps) {
  const getPaletteValue = (slot: CustomThemePaletteSlot) => getPaletteColorPickerValue(customThemePaletteDraft, slot)
  const derivedPreviewNavRailBg =
    `color-mix(in srgb, ${getPaletteValue('surface')} 78%, ${getPaletteValue('page')})`
  const derivedPreviewNavRailBorder = `color-mix(in srgb, ${getPaletteValue('border')} 62%, transparent)`
  const derivedPreviewEditorBorder =
    `color-mix(in srgb, ${getPaletteValue('border')} 74%, ${getPaletteValue('canvas')})`
  const previewUsesBuiltInSeed = !isCustomTheme(theme) && isThemePaletteSeed(theme, customThemePaletteDraft)
  const previewNavRailBg = previewUsesBuiltInSeed
    ? BUILT_IN_THEME_PREVIEW_NAV_RAIL_BG[theme] ?? derivedPreviewNavRailBg
    : derivedPreviewNavRailBg
  const previewNavRailBorder = previewUsesBuiltInSeed
    ? BUILT_IN_THEME_PREVIEW_NAV_RAIL_BORDER[theme] ?? derivedPreviewNavRailBorder
    : derivedPreviewNavRailBorder
  const previewEditorToolbarBg = previewUsesBuiltInSeed
    ? BUILT_IN_THEME_PREVIEW_EDITOR_TOOLBAR_BG[theme] ?? getPaletteValue('surface')
    : getPaletteValue('surface')
  const previewEditorBorder = previewUsesBuiltInSeed
    ? BUILT_IN_THEME_PREVIEW_EDITOR_BORDER[theme] ?? derivedPreviewEditorBorder
    : derivedPreviewEditorBorder
  const previewThemeClassName = [
    'visuals-theme-preview',
    !isCustomTheme(theme) ? `theme-${theme}` : '',
    !previewUsesBuiltInSeed ? 'theme-custom-derived' : '',
  ].filter(Boolean).join(' ')
  const palettePreviewStyle = {
    '--visuals-preview-canvas': getPaletteValue('canvas'),
    '--visuals-preview-page': getPaletteValue('page'),
    '--visuals-preview-surface': getPaletteValue('surface'),
    '--visuals-preview-surface-raised': getPaletteValue('surfaceRaised'),
    '--visuals-preview-text': getPaletteValue('text'),
    '--visuals-preview-border': getPaletteValue('border'),
    '--visuals-preview-primary': getPaletteValue('primary'),
    '--visuals-preview-danger': getPaletteValue('danger'),
    '--visuals-preview-warning': getPaletteValue('warning'),
    '--visuals-preview-success': getPaletteValue('success'),
    '--nav-rail-bg': previewNavRailBg,
    '--nav-rail-border': previewNavRailBorder,
    '--app-text-bright': `color-mix(in srgb, ${getPaletteValue('text')} 92%, white)`,
    '--app-text-muted': getPaletteValue('mutedText'),
    '--domain-rail-accent': getPaletteValue('domainRail'),
    '--space-rail-accent': getPaletteValue('spaceRail'),
    '--parent-rail-accent': getPaletteValue('parentRail'),
    '--subtab-rail-accent': getPaletteValue('subtabRail'),
    '--tab-button-scale': String(tabButtonScaleDraft),
    '--note-font-scale': String(noteFontScaleDraft),
    '--editor-bg': getPaletteValue('canvas'),
    '--editor-border': previewEditorBorder,
    '--editor-toolbar-bg': previewEditorToolbarBg,
    '--visuals-preview-panel-bg': getPaletteValue('canvas'),
    '--editor-text': getPaletteValue('text'),
    '--editor-muted-text': getPaletteValue('mutedText'),
    '--editor-heading-text': `color-mix(in srgb, ${getPaletteValue('text')} 90%, white)`,
    '--toolbar-custom-icon-color': getPaletteValue('text'),
    '--toast-bg': `color-mix(in srgb, ${getPaletteValue('canvas')} 82%, ${getPaletteValue('surface')})`,
    '--toast-border': getPaletteValue('border'),
    '--toast-text': `color-mix(in srgb, ${getPaletteValue('text')} 92%, white)`,
    '--toast-shadow': `0 12px 32px color-mix(in srgb, ${getPaletteValue('canvas')} 56%, transparent)`,
    '--toast-success': getPaletteValue('success'),
    '--toast-warning': getPaletteValue('warning'),
    '--toast-error': getPaletteValue('danger'),
  } as CSSProperties

  const handleTaskKeyDown = (task: ThemePreviewTask, event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTaskToggle(task)
  }

  const renderTask = (task: ThemePreviewTask, label: string) => {
    const checked = tasks[task]
    return (
      <li
        className={`task-list-item${checked ? ' checked' : ''}`}
        data-task=""
        data-task-checked={checked ? '' : undefined}
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onTaskToggle(task)}
        onKeyDown={(event) => handleTaskKeyDown(task, event)}
      >
        {label}
      </li>
    )
  }

  return (
    <div className={previewThemeClassName} aria-label="theme color preview" style={palettePreviewStyle}>
      <div className="visuals-preview-canvas">
        <div className="visuals-preview-rail-stack" aria-label="theme example buttons">
          {THEME_PREVIEW_RAILS.map((rail) => (
            <div
              key={rail.id}
              className={`visuals-preview-rail-row is-count-${rail.sampleCount}`}
              aria-label={`${rail.ariaLabel} samples`}
            >
              {THEME_PREVIEW_SAMPLE_INDICES.slice(0, rail.sampleCount).map((sample) => {
                const selected = railSelection[rail.id] === sample
                const className = [
                  'visuals-preview-pill',
                  rail.className,
                  selected && rail.selectedClassName ? rail.selectedClassName : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <button
                    key={`${rail.id}-${sample}`}
                    type="button"
                    aria-label={`${rail.ariaLabel} sample ${sample + 1}`}
                    aria-pressed={selected}
                    aria-selected={rail.useAriaSelected ? selected : undefined}
                    className={className}
                    onClick={() => onRailSampleSelect(rail.id, sample)}
                  >
                    {rail.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div
          className="visuals-preview-toolbar note-shared-toolbar is-interaction-disabled toastui-editor-toolbar"
          role="toolbar"
          aria-label="theme preview toolbar"
          aria-disabled="true"
        >
          <div className="toastui-editor-defaultUI-toolbar app-shared-editor-toolbar">
            <div className="toastui-editor-toolbar-group visuals-preview-toolbar-group">
              {THEME_PREVIEW_TOOLBAR_TOOLS.map((toolId) => (
                <ToolbarToolVisual
                  key={toolId}
                  toolId={toolId}
                  buttonProps={{
                    className: 'visuals-preview-toolbar-tool',
                    disabled: true,
                    tabIndex: -1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="visuals-preview-panel">
          <div className="visuals-preview-editor-sample toastui-editor-contents">
            <h3 className="visuals-preview-heading">header</h3>
            <ul className="visuals-preview-list tabs-dash-list" data-tabs-list-marker="dash">
              <li>dash</li>
            </ul>
            <ul className="visuals-preview-list">
              <li>bullet</li>
            </ul>
            <ol className="visuals-preview-list">
              <li>number</li>
            </ol>
            <ul className="visuals-preview-list visuals-preview-task-list">
              {renderTask('done', 'done task')}
              {renderTask('open', 'open task')}
            </ul>
          </div>
          <div className="visuals-preview-toast-stack app-toast-layer" aria-label="toast samples">
            <div className="app-toast app-toast-error visuals-preview-toast">danger toast</div>
            <div className="app-toast app-toast-warning visuals-preview-toast">warning toast</div>
            <div className="app-toast app-toast-success visuals-preview-toast">success toast</div>
          </div>
        </div>
      </div>
    </div>
  )
}
