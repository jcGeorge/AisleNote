import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, ContextMenuState, PendingCreatedEdit, Tab, WorkspaceData } from '../types/app'
import { useAppNavigationActions } from './useAppNavigationActions'

const noop = () => undefined

afterEach(() => {
  vi.unstubAllGlobals()
})

function createWorkspace(): { workspace: WorkspaceData; activeTab: Tab } {
  const activeTab: Tab = {
    id: 'parent-1',
    title: 'Parent',
    noteBodyId: 'body-parent',
    activeSubTabId: 'sub-1',
    subTabs: [
      {
        id: 'sub-1',
        title: 'help!',
        noteBodyId: 'body-sub',
      },
    ],
  }
  return {
    activeTab,
    workspace: {
      activeTabId: activeTab.id,
      tabs: [activeTab],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function createState(workspace: WorkspaceData): AppState {
  const space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: workspace,
  }
  const domain = {
    id: 'domain-1',
    name: 'Domain',
    activeSpaceId: space.id,
    spaces: [space],
  }
  return {
    theme: 'dark',
    activeDomainId: domain.id,
    domains: [domain],
    deletedDomains: [],
    deletedSpaces: [],
    noteBodies: [
      {
        id: 'body-sub',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-1', markdown: 'first aisle mirror' },
      { id: 'aisle-body-2', markdown: 'second aisle text' },
    ],
    activeSpaceId: space.id,
    spaces: [space],
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
}

function useRenameHarness(options: {
  pendingCreatedEdit?: Extract<PendingCreatedEdit, { type: 'space' | 'domain' }> | null
  requestAnimationFrame?: boolean
} = {}) {
  const source = createWorkspace()
  const activeTab = { ...source.activeTab, activeSubTabId: null }
  const workspace: WorkspaceData = {
    ...source.workspace,
    activeTabId: activeTab.id,
    tabs: [activeTab],
  }
  let latestState = createState(workspace)
  const setState = vi.fn((action: AppState | ((previous: AppState) => AppState)) => {
    latestState = typeof action === 'function' ? action(latestState) : action
  })
  const activateAisleEditor = vi.fn(() => true)
  const editorFocus = vi.fn()

  if (options.requestAnimationFrame) {
    vi.stubGlobal('window', {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(1)
        return 1
      }),
    })
  }

  const actions = useAppNavigationActions({
    state: latestState,
    setState,
    viewMode: 'main',
    setViewMode: vi.fn(),
    contextMenu: null as ContextMenuState | null,
    setMenuOpen: vi.fn(),
    setEditing: vi.fn(),
    editingRef: { current: null },
    renameDraftRef: { current: null },
    workspace,
    activeTab,
    activeNoteBodyId: activeTab.noteBodyId,
    resolvedActiveAisleId: 'aisle-1',
    editorRef: { current: { focus: editorFocus } as never },
    pendingCreatedEditRef: { current: options.pendingCreatedEdit ?? null },
    skipRenameBlurRef: { current: null },
    pendingFocusToAisleIdRef: { current: null },
    pendingCursorRestoreRef: { current: null },
    closeEditorEphemeraRef: { current: noop },
    activateAisleEditorRef: { current: activateAisleEditor },
    arrangeModeActive: false,
    exitArrangeMode: noop,
    saveActiveCursorBeforeNavigation: noop,
    updateActiveSpaceData: noop,
    setTrashTabId: vi.fn(),
    setTrashSubTabId: vi.fn(),
  })

  return {
    actions,
    activateAisleEditor,
    editorFocus,
    get latestState() {
      return latestState
    },
  }
}

describe('app navigation rename actions', () => {
  it('renames a sub-tab with emoji without mutating note content', () => {
    const { workspace, activeTab } = createWorkspace()
    let latestWorkspace = workspace
    const calls: string[] = []

    const actions = useAppNavigationActions({
      state: createState(workspace),
      setState: vi.fn(),
      viewMode: 'main',
      setViewMode: vi.fn(),
      contextMenu: null as ContextMenuState | null,
      setMenuOpen: vi.fn(),
      setEditing: vi.fn(),
      editingRef: { current: null },
      renameDraftRef: { current: null },
      workspace,
      activeTab,
      activeNoteBodyId: 'body-sub',
      resolvedActiveAisleId: 'aisle-2',
      editorRef: { current: null },
      pendingCreatedEditRef: { current: null },
      skipRenameBlurRef: { current: null },
      pendingFocusToAisleIdRef: { current: null },
      pendingCursorRestoreRef: { current: null },
      closeEditorEphemeraRef: { current: noop },
      activateAisleEditorRef: { current: () => false },
      arrangeModeActive: false,
      exitArrangeMode: noop,
      saveActiveCursorBeforeNavigation: () => {
        calls.push('save-active-cursor-and-flush')
      },
      updateActiveSpaceData: (updater) => {
        calls.push('update-workspace')
        latestWorkspace = updater(latestWorkspace)
      },
      setTrashTabId: vi.fn(),
      setTrashSubTabId: vi.fn(),
    })

    actions.commitRename('subtab', 'sub-1', 'help! 🥺', { focusEditor: false })

    expect(calls).toEqual(['save-active-cursor-and-flush', 'update-workspace'])
    const renamedSubTab = latestWorkspace.tabs[0]?.subTabs[0]
    expect(renamedSubTab?.title).toBe('help! 🥺')
    expect(renamedSubTab).not.toHaveProperty('content')
  })

  it('focuses the active parent home note after pending-created space and domain Enter commits', () => {
    const spaceHarness = useRenameHarness({
      pendingCreatedEdit: {
        type: 'space',
        id: 'space-1',
        sourceDomainId: 'domain-1',
        previousActiveSpaceId: 'previous-space',
      },
      requestAnimationFrame: true,
    })
    spaceHarness.actions.commitRename('space', 'space-1', 'Renamed Space', { focusEditor: true })

    expect(spaceHarness.latestState.spaces[0]?.name).toBe('Renamed Space')
    expect(spaceHarness.activateAisleEditor).toHaveBeenCalledWith('body-parent::aisle-1', {
      focus: true,
      allowDuringPendingRename: true,
    })
    expect(spaceHarness.editorFocus).not.toHaveBeenCalled()

    const domainHarness = useRenameHarness({
      pendingCreatedEdit: {
        type: 'domain',
        id: 'domain-1',
        previousActiveDomainId: 'previous-domain',
        previousActiveSpaceId: 'previous-space',
      },
      requestAnimationFrame: true,
    })
    domainHarness.actions.commitRename('domain', 'domain-1', 'Renamed Domain', { focusEditor: true })

    expect(domainHarness.latestState.domains[0]?.name).toBe('Renamed Domain')
    expect(domainHarness.activateAisleEditor).toHaveBeenCalledWith('body-parent::aisle-1', {
      focus: true,
      allowDuringPendingRename: true,
    })
    expect(domainHarness.editorFocus).not.toHaveBeenCalled()
  })

  it('does not focus space or domain renames unless an Enter commit finishes a pending-created edit', () => {
    const pendingBlurHarness = useRenameHarness({
      pendingCreatedEdit: {
        type: 'space',
        id: 'space-1',
        sourceDomainId: 'domain-1',
        previousActiveSpaceId: 'previous-space',
      },
      requestAnimationFrame: true,
    })
    pendingBlurHarness.actions.commitRename('space', 'space-1', 'Renamed Space')

    expect(pendingBlurHarness.activateAisleEditor).not.toHaveBeenCalled()
    expect(pendingBlurHarness.editorFocus).not.toHaveBeenCalled()

    const existingSpaceHarness = useRenameHarness({ requestAnimationFrame: true })
    existingSpaceHarness.actions.commitRename('space', 'space-1', 'Existing Space', { focusEditor: true })

    expect(existingSpaceHarness.activateAisleEditor).not.toHaveBeenCalled()
    expect(existingSpaceHarness.editorFocus).not.toHaveBeenCalled()

    const existingDomainHarness = useRenameHarness({ requestAnimationFrame: true })
    existingDomainHarness.actions.commitRename('domain', 'domain-1', 'Existing Domain', { focusEditor: true })

    expect(existingDomainHarness.activateAisleEditor).not.toHaveBeenCalled()
    expect(existingDomainHarness.editorFocus).not.toHaveBeenCalled()
  })
})
