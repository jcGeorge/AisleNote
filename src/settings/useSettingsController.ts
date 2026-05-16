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
import { appPersistenceService } from '../storage/app-persistence-service'
import { isFrontmatterComputedValueCompatibleWithFieldType } from '../frontmatter/frontmatter'
import type {
  AppState,
  AppTheme,
  FrontmatterSettings,
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

function isFrontmatterBooleanDefaultTrue(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
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
  const [frontmatterDraft, setFrontmatterDraft] = useState<FrontmatterSettings>(state.frontmatter)
  const [exportStatus, setExportStatus] = useState<string>('')
  const pendingSettingsFrontmatterTemplateIdRef = useRef<string | null>(null)

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
    frontmatterDraft,
    frontmatterDraftDirty,
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
