import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import {
  applyAutoPurgeToAppState,
} from '../state/app-state'
import { updateSpaceInActiveDomain } from '../state/domains'
import { applyAutoPurgeToWorkspace, createId } from '../state/workspace'
import { isFrontmatterComputedValueCompatibleWithFieldType } from '../frontmatter/frontmatter'
import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  FrontmatterSettings,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NewlineOperationId,
  NewlineShortcutId,
  SettingsSection,
  ShortcutId,
  Space,
  TableControlTargetMode,
  TipId,
  VisualsSettingsSection,
  ViewMode,
} from '../types/app'
import {
  clampAutoRemoveDays,
  clampNoteFontScale,
  clampTabButtonScale,
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_CUSTOM_THEME_ID,
  DEFAULT_UI_SETTINGS,
  DEFAULT_VISUALS_SETTINGS_SECTION,
  getCustomThemePaletteSeed,
  getThemePaletteForTheme,
  isCustomTheme,
  normalizeHexColor,
  normalizeCustomThemeId,
  removeThemePaletteOverride,
  setThemePaletteOverride,
} from './defaults'
import {
  DEFAULT_TOOLBAR_LAYOUT_ID,
  createCustomToolbarLayout,
  createToolbarSpacerItem,
  createToolbarToolItem,
  getDefaultToolbarLayout,
  getDuplicateToolbarLayoutName,
  getNextCoolbarToolbarLayoutName,
  getToolbarLayouts,
  insertToolbarLayoutItemAtIndex,
  isProtectedToolbarLayoutId,
  isToolbarToolId,
  moveToolbarLayoutItem,
  moveToolbarLayoutItemToIndex,
  normalizeToolbarLayouts,
  removeToolbarLayoutItem,
  removeToolbarLayout,
  resolveToolbarLayoutId,
  updateToolbarLayout,
} from '../editor/toolbar-layouts'

type UseSettingsControllerParams = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  stateRef: MutableRefObject<AppState>
  commitAppStateNow: (nextState: AppState) => Promise<AppState>
  activeSpace: Space
  viewMode: ViewMode
  activeToolbarLayoutId: string
  onActiveToolbarLayoutIdChange: (layoutId: string) => void
}

function isFrontmatterBooleanDefaultTrue(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

export function useSettingsController({
  state,
  setState,
  stateRef,
  commitAppStateNow,
  activeSpace,
  viewMode,
  activeToolbarLayoutId,
  onActiveToolbarLayoutIdChange,
}: UseSettingsControllerParams) {
  const [section, setSection] = useState<SettingsSection>(state.ui.settingsSection)
  const [visualsSection, setVisualsSection] = useState<VisualsSettingsSection>(
    state.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION,
  )
  const [settingsDaysDraft, setSettingsDaysDraft] = useState<string>(String(DEFAULT_AUTO_REMOVE_DAYS))
  const [shortcutDrafts, setShortcutDrafts] = useState<Record<ShortcutId, string>>(DEFAULT_SHORTCUTS)
  const [newlineShortcutDrafts, setNewlineShortcutDrafts] = useState<Record<NewlineShortcutId, NewlineOperationId>>(
    DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts,
  )
  const [shortcutMenuOperationsDraft, setShortcutMenuOperationsDraft] = useState<NewlineOperationId[]>(
    DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations,
  )
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [mouseBackForwardEnabledDraft, setMouseBackForwardEnabledDraft] = useState(true)
  const [genericHistoryHotkeysEnabledDraft, setGenericHistoryHotkeysEnabledDraft] = useState(true)
  const [showParentHomeTabDraft, setShowParentHomeTabDraft] = useState(DEFAULT_UI_SETTINGS.showParentHomeTab)
  const [alwaysShowSpacesDraft, setAlwaysShowSpacesDraft] = useState(DEFAULT_UI_SETTINGS.alwaysShowSpaces ?? false)
  const [alwaysShowDomainsDraft, setAlwaysShowDomainsDraft] = useState(DEFAULT_UI_SETTINGS.alwaysShowDomains ?? false)
  const [tableAddTargetModeDraft, setTableAddTargetModeDraft] = useState(DEFAULT_UI_SETTINGS.tableAddTargetMode)
  const [tableDeleteTargetModeDraft, setTableDeleteTargetModeDraft] = useState(DEFAULT_UI_SETTINGS.tableDeleteTargetMode)
  const [tabButtonScaleDraft, setTabButtonScaleDraft] = useState(DEFAULT_UI_SETTINGS.tabButtonScale)
  const [noteFontScaleDraft, setNoteFontScaleDraft] = useState(DEFAULT_UI_SETTINGS.noteFontScale)
  const [selectedCustomTheme, setSelectedCustomTheme] = useState<CustomThemeId>(
    isCustomTheme(state.theme) ? state.theme : normalizeCustomThemeId(state.ui.selectedCustomTheme),
  )
  const [customThemePaletteDraft, setCustomThemePaletteDraft] = useState<CustomThemePalette>(
    getThemePaletteForTheme(state.theme, state.ui.themePalettes, state.ui.customThemePalette),
  )
  const [frontmatterDraft, setFrontmatterDraft] = useState<FrontmatterSettings>(state.frontmatter)
  const [toolbarEditorLayoutId, setToolbarEditorLayoutId] = useState<string>(() =>
    resolveToolbarLayoutId(state.ui.toolbarLayouts, activeToolbarLayoutId),
  )
  const [exportStatus, setExportStatus] = useState<string>('')
  const pendingSettingsFrontmatterTemplateIdRef = useRef<string | null>(null)
  const pendingSettingsSectionRef = useRef<SettingsSection | null>(null)
  const pendingVisualsSettingsSectionRef = useRef<VisualsSettingsSection | null>(null)
  useEffect(() => {
    if (viewMode !== 'settings') return
    setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
    setShortcutDrafts(state.hotkeys.shortcuts)
    setNewlineShortcutDrafts(state.hotkeys.newlineShortcuts.shortcuts)
    setShortcutMenuOperationsDraft(state.hotkeys.newlineShortcuts.menuOperations)
    setMouseBackForwardEnabledDraft(state.hotkeys.enableMouseBackForward)
    setGenericHistoryHotkeysEnabledDraft(state.hotkeys.enableGenericHistoryHotkeys)
    setShowParentHomeTabDraft(state.ui.showParentHomeTab)
    setAlwaysShowSpacesDraft(state.ui.alwaysShowSpaces ?? DEFAULT_UI_SETTINGS.alwaysShowSpaces ?? false)
    setAlwaysShowDomainsDraft(state.ui.alwaysShowDomains ?? DEFAULT_UI_SETTINGS.alwaysShowDomains ?? false)
    setTableAddTargetModeDraft(state.ui.tableAddTargetMode)
    setTableDeleteTargetModeDraft(state.ui.tableDeleteTargetMode)
    setTabButtonScaleDraft(state.ui.tabButtonScale)
    setNoteFontScaleDraft(state.ui.noteFontScale)
    setSelectedCustomTheme(isCustomTheme(state.theme) ? state.theme : normalizeCustomThemeId(state.ui.selectedCustomTheme))
    setSection(pendingSettingsSectionRef.current ?? state.ui.settingsSection)
    if (pendingSettingsSectionRef.current === state.ui.settingsSection) {
      pendingSettingsSectionRef.current = null
    }
    const currentVisualsSection = state.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION
    setVisualsSection(pendingVisualsSettingsSectionRef.current ?? currentVisualsSection)
    if (pendingVisualsSettingsSectionRef.current === currentVisualsSection) {
      pendingVisualsSettingsSectionRef.current = null
    }
    setCustomThemePaletteDraft(
      getThemePaletteForTheme(state.theme, state.ui.themePalettes, state.ui.customThemePalette),
    )
    setEditingShortcut(null)
  }, [
    viewMode,
    activeSpace.settings.autoRemoveDeletedDays,
    state.hotkeys,
    state.theme,
    state.ui.showParentHomeTab,
    state.ui.alwaysShowSpaces,
    state.ui.alwaysShowDomains,
    state.ui.tableAddTargetMode,
    state.ui.tableDeleteTargetMode,
    state.ui.tabButtonScale,
    state.ui.noteFontScale,
    state.ui.selectedCustomTheme,
    state.ui.settingsSection,
    state.ui.visualsSettingsSection,
    state.ui.customThemePalette,
    state.ui.themePalettes,
  ])

  useEffect(() => {
    if (viewMode !== 'settings') return
    const nextLayoutId = resolveToolbarLayoutId(state.ui.toolbarLayouts, activeToolbarLayoutId)
    if (toolbarEditorLayoutId === nextLayoutId) return
    setToolbarEditorLayoutId(nextLayoutId)
  }, [activeToolbarLayoutId, state.ui.toolbarLayouts, toolbarEditorLayoutId, viewMode])

  useEffect(() => {
    if (viewMode !== 'settings') return
    const pendingTemplateId = pendingSettingsFrontmatterTemplateIdRef.current
    pendingSettingsFrontmatterTemplateIdRef.current = null
    setFrontmatterDraft({
      ...state.frontmatter,
      settingsTemplateId:
        pendingTemplateId && state.frontmatter.templates.some((template) => template.id === pendingTemplateId)
          ? pendingTemplateId
          : state.frontmatter.settingsTemplateId,
    })
  }, [viewMode, state.frontmatter])

  const commitImmediateSettingsState = (buildNextState: (previous: AppState) => AppState) => {
    const nextState = applyAutoPurgeToAppState(buildNextState(stateRef.current))
    void commitAppStateNow(nextState)
  }

  const commitDebouncedSettingsState = (buildNextState: (previous: AppState) => AppState) => {
    setState(buildNextState)
  }

  const changeSection = (nextSection: SettingsSection) => {
    pendingSettingsSectionRef.current = stateRef.current.ui.settingsSection === nextSection ? null : nextSection
    setSection(nextSection)
    commitImmediateSettingsState((previous) => {
      if (previous.ui.settingsSection === nextSection) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          settingsSection: nextSection,
        },
      }
    })
    if (nextSection !== 'hotkeys') setEditingShortcut(null)
  }

  const changeVisualsSection = (nextSection: VisualsSettingsSection) => {
    pendingVisualsSettingsSectionRef.current =
      (stateRef.current.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION) === nextSection ? null : nextSection
    setVisualsSection(nextSection)
    commitImmediateSettingsState((previous) => {
      if (previous.ui.visualsSettingsSection === nextSection) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          visualsSettingsSection: nextSection,
        },
      }
    })
  }

  const toggleShortcutEdit = (shortcutId: ShortcutId) => {
    setEditingShortcut((current) => (current === shortcutId ? null : shortcutId))
  }

  const updateAutoRemoveDaysSetting = (rawValue: string, normalizeInvalid = false) => {
    setSettingsDaysDraft(rawValue)
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed)) {
      if (normalizeInvalid) {
        setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
      }
      return
    }

    const nextDays = clampAutoRemoveDays(parsed)
    commitImmediateSettingsState((previous) =>
      updateSpaceInActiveDomain(previous, previous.activeSpaceId, (space) => ({
        ...space,
        settings: { ...space.settings, autoRemoveDeletedDays: nextDays },
        data: applyAutoPurgeToWorkspace(space.data, nextDays),
      })),
    )
    if (String(nextDays) !== rawValue.trim()) {
      setSettingsDaysDraft(String(nextDays))
    }
  }

  const updateMouseBackForwardSetting = (checked: boolean) => {
    setMouseBackForwardEnabledDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableMouseBackForward: checked,
      },
    }))
  }

  const updateGenericHistoryHotkeysSetting = (checked: boolean) => {
    setGenericHistoryHotkeysEnabledDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableGenericHistoryHotkeys: checked,
      },
    }))
  }

  const updateShowParentHomeTabSetting = (checked: boolean) => {
    setShowParentHomeTabDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        showParentHomeTab: checked,
      },
    }))
  }

  const updateAlwaysShowSpacesSetting = (checked: boolean) => {
    setAlwaysShowSpacesDraft(checked)
    if (!checked) setAlwaysShowDomainsDraft(false)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        alwaysShowSpaces: checked,
        alwaysShowDomains: checked ? previous.ui.alwaysShowDomains ?? false : false,
      },
    }))
  }

  const updateAlwaysShowDomainsSetting = (checked: boolean) => {
    if (checked && !(stateRef.current.ui.alwaysShowSpaces ?? false)) return false
    setAlwaysShowDomainsDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        alwaysShowDomains: checked,
      },
    }))
    return true
  }

  const updateTableAddTargetModeSetting = (mode: TableControlTargetMode) => {
    setTableAddTargetModeDraft(mode)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        tableAddTargetMode: mode,
      },
    }))
  }

  const updateTableDeleteTargetModeSetting = (mode: TableControlTargetMode) => {
    setTableDeleteTargetModeDraft(mode)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        tableDeleteTargetMode: mode,
      },
    }))
  }

  const updateTipEnabledSetting = (tipId: TipId, enabled: boolean) => {
    commitImmediateSettingsState((previous) => {
      const disabledTipIds = enabled
        ? previous.ui.disabledTipIds.filter((id) => id !== tipId)
        : previous.ui.disabledTipIds.includes(tipId)
          ? previous.ui.disabledTipIds
          : [...previous.ui.disabledTipIds, tipId]
      return {
        ...previous,
        ui: {
          ...previous.ui,
          disabledTipIds,
        },
      }
    })
  }

  const updateTabButtonScaleSetting = (rawValue: string) => {
    const nextScale = clampTabButtonScale(Number.parseFloat(rawValue))
    setTabButtonScaleDraft(nextScale)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        tabButtonScale: nextScale,
      },
    }))
  }

  const updateNoteFontScaleSetting = (rawValue: string) => {
    const nextScale = clampNoteFontScale(Number.parseFloat(rawValue))
    setNoteFontScaleDraft(nextScale)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        noteFontScale: nextScale,
      },
    }))
  }

  const updateThemeSetting = (theme: AppTheme) => {
    const current = stateRef.current
    if (isCustomTheme(theme)) {
      setSelectedCustomTheme(theme)
    }
    setCustomThemePaletteDraft(getThemePaletteForTheme(theme, current.ui.themePalettes, current.ui.customThemePalette))
    commitImmediateSettingsState((previous) => {
      return {
        ...previous,
        theme,
        ui: {
          ...previous.ui,
          selectedCustomTheme: isCustomTheme(theme) ? theme : previous.ui.selectedCustomTheme,
        },
      }
    })
  }

  const updateSelectedCustomThemeSetting = (theme: CustomThemeId) => {
    const current = stateRef.current
    setSelectedCustomTheme(theme)
    if (isCustomTheme(current.theme)) {
      setCustomThemePaletteDraft(getThemePaletteForTheme(theme, current.ui.themePalettes, current.ui.customThemePalette))
    }
    commitImmediateSettingsState((previous) => ({
      ...previous,
      theme: isCustomTheme(previous.theme) ? theme : previous.theme,
      ui: {
        ...previous.ui,
        selectedCustomTheme: theme,
      },
    }))
  }

  const updateCustomThemePaletteSetting = (slot: CustomThemePaletteSlot, rawValue: string) => {
    const normalized = normalizeHexColor(rawValue)
    setCustomThemePaletteDraft((previous) => ({ ...previous, [slot]: normalized ?? rawValue }))
    if (!normalized) return
    commitDebouncedSettingsState((previous) => {
      const nextPalette = {
        ...getThemePaletteForTheme(previous.theme, previous.ui.themePalettes, previous.ui.customThemePalette),
        [slot]: normalized,
      }
      return {
        ...previous,
        ui: {
          ...previous.ui,
          customThemePalette: previous.theme === DEFAULT_CUSTOM_THEME_ID ? nextPalette : previous.ui.customThemePalette,
          themePalettes: setThemePaletteOverride(previous.ui.themePalettes, previous.theme, nextPalette),
        },
      }
    })
  }

  const resetCustomThemePaletteSetting = () => {
    const theme = stateRef.current.theme
    setCustomThemePaletteDraft(getCustomThemePaletteSeed(theme))
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        customThemePalette: previous.theme === DEFAULT_CUSTOM_THEME_ID ? null : previous.ui.customThemePalette,
        themePalettes: removeThemePaletteOverride(previous.ui.themePalettes, previous.theme),
      },
    }))
  }

  const seedCustomThemePaletteFromCurrentTheme = () => {
    const current = stateRef.current
    const targetTheme = normalizeCustomThemeId(selectedCustomTheme, DEFAULT_CUSTOM_THEME_ID)
    const palette = getThemePaletteForTheme(current.theme, current.ui.themePalettes, current.ui.customThemePalette)
    setCustomThemePaletteDraft(palette)
    setSelectedCustomTheme(targetTheme)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      theme: targetTheme,
      ui: {
        ...previous.ui,
        selectedCustomTheme: targetTheme,
        customThemePalette: targetTheme === DEFAULT_CUSTOM_THEME_ID ? palette : previous.ui.customThemePalette,
        themePalettes: setThemePaletteOverride(previous.ui.themePalettes, targetTheme, palette),
      },
    }))
  }

  const updateShortcutSetting = (shortcutId: ShortcutId, nextShortcut: string) => {
    setShortcutDrafts((previous) => ({ ...previous, [shortcutId]: nextShortcut }))
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        shortcuts: {
          ...previous.hotkeys.shortcuts,
          [shortcutId]: nextShortcut,
        },
      },
    }))
  }

  const updateNewlineShortcutSetting = (shortcutId: NewlineShortcutId, operation: NewlineOperationId) => {
    setNewlineShortcutDrafts((previous) => ({ ...previous, [shortcutId]: operation }))
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        newlineShortcuts: {
          ...previous.hotkeys.newlineShortcuts,
          shortcuts: {
            ...previous.hotkeys.newlineShortcuts.shortcuts,
            [shortcutId]: operation,
          },
        },
      },
    }))
  }

  const updateShortcutMenuOperationsSetting = (menuOperations: NewlineOperationId[]) => {
    setShortcutMenuOperationsDraft(menuOperations)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        newlineShortcuts: {
          ...previous.hotkeys.newlineShortcuts,
          menuOperations,
        },
      },
    }))
  }

  const updateStageManagerOpenDestinationSetting = (checked: boolean) => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        stageManagerOpenDestinationAfterApply: checked,
      },
    }))
  }

  const commitToolbarLayouts = (buildNextLayouts: (layouts: AppState['ui']['toolbarLayouts']) => AppState['ui']['toolbarLayouts']) => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        toolbarLayouts: normalizeToolbarLayouts(buildNextLayouts(previous.ui.toolbarLayouts)),
      },
    }))
  }

  const selectToolbarLayoutForEditing = (layoutId: string) => {
    const nextLayoutId = getToolbarLayouts(stateRef.current.ui.toolbarLayouts).some((layout) => layout.id === layoutId)
      ? layoutId
      : DEFAULT_TOOLBAR_LAYOUT_ID
    setToolbarEditorLayoutId(nextLayoutId)
    onActiveToolbarLayoutIdChange(nextLayoutId)
  }

  const createToolbarLayoutSetting = () => {
    const layouts = getToolbarLayouts(stateRef.current.ui.toolbarLayouts)
    const layout = createCustomToolbarLayout(getNextCoolbarToolbarLayoutName(layouts), getDefaultToolbarLayout().items)
    commitToolbarLayouts((layouts) => [...normalizeToolbarLayouts(layouts), layout])
    setToolbarEditorLayoutId(layout.id)
    onActiveToolbarLayoutIdChange(layout.id)
  }

  const duplicateToolbarLayoutSetting = (layoutId: string) => {
    const layouts = getToolbarLayouts(stateRef.current.ui.toolbarLayouts)
    const source = layouts.find((layout) => layout.id === layoutId) ?? getDefaultToolbarLayout()
    const layout = createCustomToolbarLayout(getDuplicateToolbarLayoutName(source.name, layouts), source.items)
    commitToolbarLayouts((layouts) => [...normalizeToolbarLayouts(layouts), layout])
    setToolbarEditorLayoutId(layout.id)
    onActiveToolbarLayoutIdChange(layout.id)
  }

  const renameToolbarLayoutSetting = (layoutId: string, name: string) => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    const nextName = name.trim() || 'toolbar'
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        name: nextName,
      })),
    )
  }

  const deleteToolbarLayoutSetting = (layoutId: string) => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    commitToolbarLayouts((layouts) => removeToolbarLayout(layouts, layoutId))
    if (toolbarEditorLayoutId === layoutId) setToolbarEditorLayoutId(DEFAULT_TOOLBAR_LAYOUT_ID)
    if (activeToolbarLayoutId === layoutId) onActiveToolbarLayoutIdChange(DEFAULT_TOOLBAR_LAYOUT_ID)
  }

  const addToolbarToolSetting = (layoutId: string, toolId: string, targetIndex?: number) => {
    if (isProtectedToolbarLayoutId(layoutId) || !isToolbarToolId(toolId)) return
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        items: insertToolbarLayoutItemAtIndex(
          layout.items,
          createToolbarToolItem(toolId),
          typeof targetIndex === 'number' ? targetIndex : layout.items.length,
        ),
      })),
    )
  }

  const addToolbarSpacerSetting = (layoutId: string, targetIndex?: number) => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        items: insertToolbarLayoutItemAtIndex(
          layout.items,
          createToolbarSpacerItem(),
          typeof targetIndex === 'number' ? targetIndex : layout.items.length,
        ),
      })),
    )
  }

  const removeToolbarItemSetting = (layoutId: string, itemId: string) => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        items: removeToolbarLayoutItem(layout.items, itemId),
      })),
    )
  }

  const moveToolbarItemSetting = (layoutId: string, itemId: string, direction: 'up' | 'down') => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        items: moveToolbarLayoutItem(layout.items, itemId, direction),
      })),
    )
  }

  const moveToolbarItemToIndexSetting = (layoutId: string, itemId: string, targetIndex: number) => {
    if (isProtectedToolbarLayoutId(layoutId)) return
    commitToolbarLayouts((layouts) =>
      updateToolbarLayout(layouts, layoutId, (layout) => ({
        ...layout,
        items: moveToolbarLayoutItemToIndex(layout.items, itemId, targetIndex),
      })),
    )
  }

  const updateToolbarEditorShowNamesSetting = (enabled: boolean) => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        toolbarEditorShowNames: enabled,
      },
    }))
  }

  const frontmatterDraftDirty = JSON.stringify(frontmatterDraft) !== JSON.stringify(state.frontmatter)

  const updateFrontmatterDraft = (updater: (
    templates: FrontmatterTemplate[],
    settingsTemplateId: string,
    lastAppliedTemplateId: string,
  ) => {
    templates: FrontmatterTemplate[]
    settingsTemplateId: string
    lastAppliedTemplateId: string
  }) => {
    setFrontmatterDraft((previous) => updater(previous.templates, previous.settingsTemplateId, previous.lastAppliedTemplateId))
  }

  const setSettingsFrontmatterTemplate = (templateId: string) => {
    if (viewMode !== 'settings') {
      pendingSettingsFrontmatterTemplateIdRef.current = templateId
    }
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => ({
      templates,
      settingsTemplateId: templateId === '' || templates.some((template) => template.id === templateId) ? templateId : settingsTemplateId,
      lastAppliedTemplateId,
    }))
  }

  const createFrontmatterTemplate = () => {
    const template: FrontmatterTemplate = {
      id: createId(),
      name: 'new template',
      fields: [],
    }
    updateFrontmatterDraft((templates, _settingsTemplateId, lastAppliedTemplateId) => ({
      templates: [...templates, template],
      settingsTemplateId: template.id,
      lastAppliedTemplateId,
    }))
  }

  const updateFrontmatterTemplate = (templateId: string, patch: Partial<Pick<FrontmatterTemplate, 'name'>>) => {
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              ...patch,
              name: typeof patch.name === 'string' ? patch.name : template.name,
            }
          : template,
      ),
      settingsTemplateId,
      lastAppliedTemplateId,
    }))
  }

  const deleteFrontmatterTemplate = (templateId: string) => {
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => {
      if (templates.length <= 1) return { templates, settingsTemplateId, lastAppliedTemplateId }
      const nextTemplates = templates.filter((template) => template.id !== templateId)
      return {
        templates: nextTemplates,
        settingsTemplateId: settingsTemplateId === templateId ? '' : settingsTemplateId,
        lastAppliedTemplateId: lastAppliedTemplateId === templateId ? '' : lastAppliedTemplateId,
      }
    })
  }

  const addFrontmatterTemplateField = (templateId: string) => {
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? (() => {
              const existingKeys = new Set(template.fields.map((field) => field.key.trim()).filter(Boolean))
              let key = 'field'
              let index = 2
              while (existingKeys.has(key)) {
                key = `field ${index}`
                index += 1
              }
              const field: FrontmatterTemplateField = {
                id: createId(),
                key,
                type: 'text',
                defaultValue: '',
                computed: 'none',
              }
              return {
                ...template,
                fields: [...template.fields, field],
              }
            })()
          : template,
      ),
      settingsTemplateId,
      lastAppliedTemplateId,
    }))
  }

  const updateFrontmatterTemplateField = (
    templateId: string,
    fieldId: string,
    patch: Partial<FrontmatterTemplateField>,
  ) => {
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              fields: template.fields.map((field) => {
                if (field.id !== fieldId) return field
                const requestedKey = typeof patch.key === 'string' ? patch.key.trim() : field.key
                const duplicateKey = template.fields.some(
                  (candidate) => candidate.id !== fieldId && candidate.key.trim() === requestedKey,
                )
                const nextType = patch.type ?? field.type
                const requestedComputed = patch.computed ?? field.computed
                const nextDefaultValue = nextType === 'boolean'
                  ? (isFrontmatterBooleanDefaultTrue(patch.defaultValue ?? field.defaultValue) ? 'true' : 'false')
                  : patch.defaultValue ?? field.defaultValue
                return {
                  ...field,
                  ...patch,
                  type: nextType,
                  defaultValue: nextDefaultValue,
                  computed: isFrontmatterComputedValueCompatibleWithFieldType(requestedComputed, nextType)
                    ? requestedComputed
                    : 'none',
                  key: requestedKey && !duplicateKey ? requestedKey : field.key,
                }
              }),
            }
          : template,
      ),
      settingsTemplateId,
      lastAppliedTemplateId,
    }))
  }

  const deleteFrontmatterTemplateField = (templateId: string, fieldId: string) => {
    updateFrontmatterDraft((templates, settingsTemplateId, lastAppliedTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              fields: template.fields.filter((field) => field.id !== fieldId),
            }
          : template,
      ),
      settingsTemplateId,
      lastAppliedTemplateId,
    }))
  }

  const saveFrontmatterTemplates = () => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      frontmatter: frontmatterDraft,
    }))
  }

  const discardFrontmatterTemplateChanges = () => {
    setFrontmatterDraft(stateRef.current.frontmatter)
  }

  return {
    section,
    visualsSection,
    shortcutDrafts,
    newlineShortcutDrafts,
    shortcutMenuOperationsDraft,
    editingShortcut,
    mouseBackForwardEnabledDraft,
    genericHistoryHotkeysEnabledDraft,
    settingsDaysDraft,
    exportStatus,
    tabButtonScaleDraft,
    noteFontScaleDraft,
    selectedCustomTheme,
    customThemePaletteDraft,
    showParentHomeTabDraft,
    alwaysShowSpacesDraft,
    alwaysShowDomainsDraft,
    tableAddTargetModeDraft,
    tableDeleteTargetModeDraft,
    frontmatterDraft,
    frontmatterDraftDirty,
    toolbarLayouts: getToolbarLayouts(state.ui.toolbarLayouts),
    activeToolbarLayoutId,
    toolbarEditorLayoutId,
    toolbarEditorShowNames: state.ui.toolbarEditorShowNames ?? DEFAULT_UI_SETTINGS.toolbarEditorShowNames ?? false,
    setEditingShortcut,
    setExportStatus,
    changeSection,
    changeVisualsSection,
    updateSelectedCustomThemeSetting,
    toggleShortcutEdit,
    updateAutoRemoveDaysSetting,
    updateMouseBackForwardSetting,
    updateGenericHistoryHotkeysSetting,
    updateShowParentHomeTabSetting,
    updateAlwaysShowSpacesSetting,
    updateAlwaysShowDomainsSetting,
    updateTableAddTargetModeSetting,
    updateTableDeleteTargetModeSetting,
    updateTipEnabledSetting,
    updateTabButtonScaleSetting,
    updateNoteFontScaleSetting,
    updateThemeSetting,
    updateCustomThemePaletteSetting,
    resetCustomThemePaletteSetting,
    seedCustomThemePaletteFromCurrentTheme,
    updateShortcutSetting,
    updateNewlineShortcutSetting,
    updateShortcutMenuOperationsSetting,
    updateStageManagerOpenDestinationSetting,
    selectToolbarLayoutForEditing,
    createToolbarLayoutSetting,
    duplicateToolbarLayoutSetting,
    renameToolbarLayoutSetting,
    deleteToolbarLayoutSetting,
    addToolbarToolSetting,
    addToolbarSpacerSetting,
    removeToolbarItemSetting,
    moveToolbarItemSetting,
    moveToolbarItemToIndexSetting,
    updateToolbarEditorShowNamesSetting,
    setSettingsFrontmatterTemplate,
    createFrontmatterTemplate,
    updateFrontmatterTemplate,
    deleteFrontmatterTemplate,
    addFrontmatterTemplateField,
    updateFrontmatterTemplateField,
    deleteFrontmatterTemplateField,
    saveFrontmatterTemplates,
    discardFrontmatterTemplateChanges,
  }
}
