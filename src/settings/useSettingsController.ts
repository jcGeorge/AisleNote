import {
  useEffect,
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
import { appPersistenceService } from '../storage/app-persistence-service'
import type {
  AppState,
  AppTheme,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NewlineOperationId,
  NewlineShortcutId,
  SettingsSection,
  ShortcutId,
  Space,
  ViewMode,
} from '../types/app'
import {
  clampAutoRemoveDays,
  clampNoteFontScale,
  clampTabButtonScale,
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
} from './defaults'

type UseSettingsControllerParams = {
  state: AppState
  stateRef: MutableRefObject<AppState>
  setState: Dispatch<SetStateAction<AppState>>
  activeSpace: Space
  viewMode: ViewMode
  storageHydrated: boolean
}

export function useSettingsController({
  state,
  stateRef,
  setState,
  activeSpace,
  viewMode,
  storageHydrated,
}: UseSettingsControllerParams) {
  const [section, setSection] = useState<SettingsSection>('hotkeys')
  const [settingsDaysDraft, setSettingsDaysDraft] = useState<string>(String(DEFAULT_AUTO_REMOVE_DAYS))
  const [shortcutDrafts, setShortcutDrafts] = useState<Record<ShortcutId, string>>(DEFAULT_SHORTCUTS)
  const [newlineShortcutDrafts, setNewlineShortcutDrafts] = useState<Record<NewlineShortcutId, NewlineOperationId>>(
    DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts,
  )
  const [newlineMenuOperationsDraft, setNewlineMenuOperationsDraft] = useState<NewlineOperationId[]>(
    DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations,
  )
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [mouseBackForwardEnabledDraft, setMouseBackForwardEnabledDraft] = useState(true)
  const [genericHistoryHotkeysEnabledDraft, setGenericHistoryHotkeysEnabledDraft] = useState(true)
  const [showParentHomeTabDraft, setShowParentHomeTabDraft] = useState(DEFAULT_UI_SETTINGS.showParentHomeTab)
  const [tabButtonScaleDraft, setTabButtonScaleDraft] = useState(DEFAULT_UI_SETTINGS.tabButtonScale)
  const [noteFontScaleDraft, setNoteFontScaleDraft] = useState(DEFAULT_UI_SETTINGS.noteFontScale)
  const [exportStatus, setExportStatus] = useState<string>('')

  useEffect(() => {
    if (viewMode !== 'settings') return
    setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
    setShortcutDrafts(state.hotkeys.shortcuts)
    setNewlineShortcutDrafts(state.hotkeys.newlineShortcuts.shortcuts)
    setNewlineMenuOperationsDraft(state.hotkeys.newlineShortcuts.menuOperations)
    setMouseBackForwardEnabledDraft(state.hotkeys.enableMouseBackForward)
    setGenericHistoryHotkeysEnabledDraft(state.hotkeys.enableGenericHistoryHotkeys)
    setShowParentHomeTabDraft(state.ui.showParentHomeTab)
    setTabButtonScaleDraft(state.ui.tabButtonScale)
    setNoteFontScaleDraft(state.ui.noteFontScale)
    setEditingShortcut(null)
  }, [
    viewMode,
    activeSpace.settings.autoRemoveDeletedDays,
    state.hotkeys,
    state.ui.showParentHomeTab,
    state.ui.tabButtonScale,
    state.ui.noteFontScale,
  ])

  const commitImmediateSettingsState = (buildNextState: (previous: AppState) => AppState) => {
    const nextState = applyAutoPurgeToAppState(buildNextState(stateRef.current))
    stateRef.current = nextState
    setState(nextState)
    if (storageHydrated) {
      appPersistenceService.saveSerializedState(JSON.stringify(nextState))
    }
  }

  const changeSection = (nextSection: SettingsSection) => {
    setSection(nextSection)
    if (nextSection !== 'hotkeys') setEditingShortcut(null)
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
    commitImmediateSettingsState((previous) => (previous.theme === theme ? previous : { ...previous, theme }))
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

  const updateNewlineMenuOperationsSetting = (menuOperations: NewlineOperationId[]) => {
    setNewlineMenuOperationsDraft(menuOperations)
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

  const updateFrontmatterSettings = (updater: (templates: FrontmatterTemplate[], activeTemplateId: string) => {
    templates: FrontmatterTemplate[]
    activeTemplateId: string
  }) => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      frontmatter: updater(previous.frontmatter.templates, previous.frontmatter.activeTemplateId),
    }))
  }

  const setActiveFrontmatterTemplate = (templateId: string) => {
    updateFrontmatterSettings((templates, activeTemplateId) => ({
      templates,
      activeTemplateId: templates.some((template) => template.id === templateId) ? templateId : activeTemplateId,
    }))
  }

  const createFrontmatterTemplate = () => {
    const template: FrontmatterTemplate = {
      id: createId(),
      name: 'new template',
      fields: [],
    }
    updateFrontmatterSettings((templates) => ({
      templates: [...templates, template],
      activeTemplateId: template.id,
    }))
  }

  const updateFrontmatterTemplate = (templateId: string, patch: Partial<Pick<FrontmatterTemplate, 'name'>>) => {
    updateFrontmatterSettings((templates, activeTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              ...patch,
              name: typeof patch.name === 'string' ? patch.name : template.name,
            }
          : template,
      ),
      activeTemplateId,
    }))
  }

  const deleteFrontmatterTemplate = (templateId: string) => {
    updateFrontmatterSettings((templates, activeTemplateId) => {
      if (templates.length <= 1) return { templates, activeTemplateId }
      const nextTemplates = templates.filter((template) => template.id !== templateId)
      return {
        templates: nextTemplates,
        activeTemplateId: activeTemplateId === templateId ? nextTemplates[0].id : activeTemplateId,
      }
    })
  }

  const addFrontmatterTemplateField = (templateId: string) => {
    const field: FrontmatterTemplateField = {
      id: createId(),
      key: 'field',
      type: 'text',
      defaultValue: '',
      computed: 'none',
    }
    updateFrontmatterSettings((templates, activeTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              fields: [...template.fields, field],
            }
          : template,
      ),
      activeTemplateId,
    }))
  }

  const updateFrontmatterTemplateField = (
    templateId: string,
    fieldId: string,
    patch: Partial<FrontmatterTemplateField>,
  ) => {
    updateFrontmatterSettings((templates, activeTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              fields: template.fields.map((field) =>
                field.id === fieldId
                  ? {
                      ...field,
                      ...patch,
                      key: typeof patch.key === 'string' ? patch.key : field.key,
                    }
                  : field,
              ),
            }
          : template,
      ),
      activeTemplateId,
    }))
  }

  const deleteFrontmatterTemplateField = (templateId: string, fieldId: string) => {
    updateFrontmatterSettings((templates, activeTemplateId) => ({
      templates: templates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              fields: template.fields.filter((field) => field.id !== fieldId),
            }
          : template,
      ),
      activeTemplateId,
    }))
  }

  return {
    section,
    shortcutDrafts,
    newlineShortcutDrafts,
    newlineMenuOperationsDraft,
    editingShortcut,
    mouseBackForwardEnabledDraft,
    genericHistoryHotkeysEnabledDraft,
    settingsDaysDraft,
    exportStatus,
    tabButtonScaleDraft,
    noteFontScaleDraft,
    showParentHomeTabDraft,
    setEditingShortcut,
    setExportStatus,
    changeSection,
    toggleShortcutEdit,
    updateAutoRemoveDaysSetting,
    updateMouseBackForwardSetting,
    updateGenericHistoryHotkeysSetting,
    updateShowParentHomeTabSetting,
    updateTabButtonScaleSetting,
    updateNoteFontScaleSetting,
    updateThemeSetting,
    updateShortcutSetting,
    updateNewlineShortcutSetting,
    updateNewlineMenuOperationsSetting,
    updateStageManagerOpenDestinationSetting,
    setActiveFrontmatterTemplate,
    createFrontmatterTemplate,
    updateFrontmatterTemplate,
    deleteFrontmatterTemplate,
    addFrontmatterTemplateField,
    updateFrontmatterTemplateField,
    deleteFrontmatterTemplateField,
  }
}
