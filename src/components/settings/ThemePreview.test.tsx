import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getThemePaletteForTheme } from '../../settings/defaults'
import type { AppTheme } from '../../types/app'
import { ThemePreview } from './ThemePreview'
import {
  DEFAULT_THEME_PREVIEW_RAIL_SELECTION,
  DEFAULT_THEME_PREVIEW_TASK_STATE,
} from './theme-preview-state'

describe('ThemePreview', () => {
  const getPalette = (theme: AppTheme) => getThemePaletteForTheme(theme, {})

  it('renders theme rails, toolbar, editor samples, task samples, and toasts', () => {
    const html = renderToStaticMarkup(
      <ThemePreview
        theme="dawn"
        customThemePaletteDraft={getPalette('dawn')}
        tabButtonScaleDraft={1}
        noteFontScaleDraft={1}
        railSelection={DEFAULT_THEME_PREVIEW_RAIL_SELECTION}
        tasks={DEFAULT_THEME_PREVIEW_TASK_STATE}
        onRailSampleSelect={() => undefined}
        onTaskToggle={() => undefined}
      />,
    )

    expect(html).toContain('class="visuals-theme-preview theme-dawn" aria-label="theme color preview"')
    expect(html).toContain('aria-label="theme example buttons"')
    expect(html).toContain('class="visuals-preview-rail-row is-count-2" aria-label="domain rail samples"')
    expect(html).toContain(
      'aria-label="domain rail sample 1" aria-pressed="true" class="visuals-preview-pill compact-scope-btn compact-domain-btn is-active">domain',
    )
    expect(html).toContain(
      'aria-label="parent rail sample 2" aria-pressed="true" aria-selected="true" class="visuals-preview-pill btn btn-sm tab-btn parent-tab-btn">parent',
    )
    expect(html).toContain('aria-label="theme preview toolbar"')
    expect(html.match(/visuals-preview-toolbar-tool/g)?.length).toBe(5)
    expect(html).toContain('<h3 class="visuals-preview-heading">header</h3>')
    expect(html).toContain('<p class="visuals-preview-tag-line"><span class="tabs-tag-token">#tag</span></p>')
    expect(html).toContain('<ul class="visuals-preview-list tabs-dash-list" data-tabs-list-marker="dash"><li>dash</li></ul>')
    expect(html).toContain(
      '<li class="task-list-item checked" data-task="" data-task-checked="" role="checkbox" aria-checked="true" tabindex="0">done task</li>',
    )
    expect(html).toContain(
      '<li class="task-list-item" data-task="" role="checkbox" aria-checked="false" tabindex="0">open task</li>',
    )
    expect(html).toContain('class="app-toast app-toast-error visuals-preview-toast"')
    expect(html).toContain('class="app-toast app-toast-warning visuals-preview-toast"')
    expect(html).toContain('class="app-toast app-toast-success visuals-preview-toast"')
    expect(html).toContain('--visuals-preview-page:#8a744a')
    expect(html).toContain('--visuals-preview-panel-bg:#d8c9a3')
    expect(html).toContain('--nav-rail-bg:#b99a45')
    expect(html).toContain('--editor-toolbar-bg:#c7b37a')
    expect(html).toContain('--editor-tag-text:#fff7ed')
    expect(html).toContain('--editor-tag-bg:#0f766e')
    expect(html).toContain('--editor-toolbar-icon-primary:#555555')
    expect(html).toContain('--editor-toolbar-icon-secondary:#8a744a')
    expect(html).toContain('toolbar-tool-icon-table')
    expect(html).not.toContain('toastui-editor-toolbar-icons')
    expect(html).not.toContain('--editor-toolbar-dash-icon-text')
  })

  it('keeps edited built-in theme previews on built-in chrome', () => {
    const html = renderToStaticMarkup(
      <ThemePreview
        theme="dawn"
        customThemePaletteDraft={{
          ...getPalette('dawn'),
          parentRail: '#123456',
        }}
        tabButtonScaleDraft={1}
        noteFontScaleDraft={1}
        railSelection={DEFAULT_THEME_PREVIEW_RAIL_SELECTION}
        tasks={DEFAULT_THEME_PREVIEW_TASK_STATE}
        onRailSampleSelect={() => undefined}
        onTaskToggle={() => undefined}
      />,
    )

    expect(html).toContain('class="visuals-theme-preview theme-dawn" aria-label="theme color preview"')
    expect(html).not.toContain('theme-custom-derived')
    expect(html).toContain('--parent-rail-accent:#123456')
    expect(html).toContain('--visuals-preview-page:#8a744a')
    expect(html).toContain('--nav-rail-bg:#b99a45')
    expect(html).not.toContain('color-mix(in srgb, #d4c39a 78%, #8a744a)')
  })
})
