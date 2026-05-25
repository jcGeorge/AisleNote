import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, ContextMenuState, Tab, WorkspaceData } from '../types/app'
import { useAppNavigationActions } from './useAppNavigationActions'

const noop = () => undefined

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
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
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
      setContextMenu: vi.fn(),
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
      closeImageToolsRef: { current: noop },
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
      onCommittedTabRenameForTips: vi.fn(),
      setTrashTabId: vi.fn(),
      setTrashSubTabId: vi.fn(),
    })

    actions.commitRename('subtab', 'sub-1', 'help! 🥺', { focusEditor: false })

    expect(calls).toEqual(['save-active-cursor-and-flush', 'update-workspace'])
    const renamedSubTab = latestWorkspace.tabs[0]?.subTabs[0]
    expect(renamedSubTab?.title).toBe('help! 🥺')
    expect(renamedSubTab).not.toHaveProperty('content')
  })
})
