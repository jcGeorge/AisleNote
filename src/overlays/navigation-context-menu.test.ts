import type { Dispatch, MouseEvent, SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import type { AppState, ContextMenuState, ModalState, NoteLocation } from '../types/app'
import {
  LAST_DOMAIN_TOAST,
  LAST_PARENT_TAB_TOAST,
  LAST_SPACE_TOAST,
  useAppOverlayActions as createAppOverlayActions,
} from './useAppOverlayActions'

const makeContextMenuEvent = () =>
  ({
    clientX: 12,
    clientY: 34,
    preventDefault: vi.fn(),
  }) as unknown as MouseEvent<HTMLButtonElement>

function makeActions(options: {
  navigationContextMenusDisabled: boolean
  state?: AppState
  viewMode?: 'main' | 'trash'
  contextMenu?: ContextMenuState | null
  setState?: ReturnType<typeof vi.fn>
  setContextMenu?: ReturnType<typeof vi.fn>
  setModal?: ReturnType<typeof vi.fn>
  setMenuOpen?: ReturnType<typeof vi.fn>
  setTrashDomainId?: ReturnType<typeof vi.fn>
  setTrashSpaceId?: ReturnType<typeof vi.fn>
  setTrashTabId?: ReturnType<typeof vi.fn>
  setTrashSubTabId?: ReturnType<typeof vi.fn>
  pushToast?: ReturnType<typeof vi.fn>
  updateActiveSpaceData?: ReturnType<typeof vi.fn>
}) {
  const state = options.state ?? DEFAULT_STATE
  const stateRef = { current: state }
  return createAppOverlayActions({
    state,
    stateRef,
    setState: (options.setState ?? vi.fn()) as Dispatch<SetStateAction<AppState>>,
    viewMode: options.viewMode ?? 'main',
    navigationContextMenusDisabled: options.navigationContextMenusDisabled,
    contextMenu: options.contextMenu ?? null,
    setContextMenu: (options.setContextMenu ?? vi.fn()) as Dispatch<SetStateAction<ContextMenuState | null>>,
    modal: null,
    setModal: (options.setModal ?? vi.fn()) as Dispatch<SetStateAction<ModalState | null>>,
    setMenuOpen: (options.setMenuOpen ?? vi.fn()) as Dispatch<SetStateAction<boolean>>,
    setEditing: vi.fn(),
    activeSpaceId: state.activeSpaceId,
    activeNoteLocation: {} as NoteLocation,
    updateActiveSpaceData: options.updateActiveSpaceData ?? vi.fn(),
    saveActiveCursorBeforeNavigation: vi.fn(),
    setTrashDomainId: options.setTrashDomainId as Dispatch<SetStateAction<string>>,
    setTrashSpaceId: options.setTrashSpaceId as Dispatch<SetStateAction<string>>,
    setTrashTabId: (options.setTrashTabId ?? vi.fn()) as Dispatch<SetStateAction<string>>,
    setTrashSubTabId: (options.setTrashSubTabId ?? vi.fn()) as Dispatch<SetStateAction<string | null>>,
    insertNoteReference: vi.fn(() => false),
    exportSpace: vi.fn(),
    pushToast: options.pushToast ?? vi.fn(),
  })
}

describe('navigation context menu suppression', () => {
  it('disables live navigation context menus while an arrange item is being dragged', () => {
    const setContextMenu = vi.fn()
    const setMenuOpen = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: true,
      setContextMenu,
      setMenuOpen,
    })
    const events = Array.from({ length: 5 }, makeContextMenuEvent)

    actions.openContextMenuForTab(events[0], 'tab-a')
    actions.openContextMenuForSubTab(events[1], 'tab-a', 'sub-a')
    actions.openContextMenuForHomeTab(events[2], 'tab-a')
    actions.openContextMenuForSpace(events[3], 'space-a')
    actions.openContextMenuForDomain(events[4], 'domain-a')

    expect(events.every((event) => event.preventDefault instanceof Function)).toBe(true)
    for (const event of events) {
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    }
    expect(setMenuOpen).toHaveBeenCalledTimes(5)
    expect(setMenuOpen).toHaveBeenCalledWith(false)
    expect(setContextMenu).toHaveBeenCalledTimes(5)
    expect(setContextMenu).toHaveBeenCalledWith(null)
    expect(setContextMenu).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tab' }))
    expect(setContextMenu).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'subtab' }))
    expect(setContextMenu).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'home-tab' }))
    expect(setContextMenu).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'space' }))
    expect(setContextMenu).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'domain' }))
  })

  it('keeps live navigation context menus available when no arrange item is being dragged', () => {
    const setContextMenu = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      setContextMenu,
    })
    const event = makeContextMenuEvent()

    actions.openContextMenuForTab(event, 'tab-a')

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(setContextMenu).toHaveBeenCalledWith({ type: 'tab', tabId: 'tab-a', x: 12, y: 34 })
  })

  it('opens de-couple modals with the context-menu tab as the launch context', () => {
    const sourceSpace = DEFAULT_STATE.spaces[0]
    const sourceTab = sourceSpace.data.tabs[0]
    const duplicateTab = { ...sourceTab, id: 'tab-copy', title: 'Copy', subTabs: [] }
    const activeSpace = {
      ...sourceSpace,
      data: {
        ...sourceSpace.data,
        tabs: [...sourceSpace.data.tabs, duplicateTab],
      },
    }
    const state: AppState = {
      ...DEFAULT_STATE,
      spaces: [activeSpace],
      domains: [{ ...DEFAULT_STATE.domains[0], spaces: [activeSpace] }],
      activeSpaceId: activeSpace.id,
    }
    const setModal = vi.fn()
    const setContextMenu = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      state,
      contextMenu: { type: 'tab', tabId: 'tab-copy', x: 0, y: 0 },
      setContextMenu,
      setModal,
    })

    actions.openDeduplicateModalFromContext()

    expect(setModal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deduplicate-note',
        noteBodyId: sourceTab.noteBodyId,
        location: {
          domainId: state.activeDomainId,
          spaceId: activeSpace.id,
          tabId: 'tab-copy',
          subTabId: null,
        },
      }),
    )
    expect(setContextMenu).toHaveBeenCalledWith(null)
  })

  it('restores standalone deleted spaces from the trash context menu and clears stale trash selection', () => {
    const domain = DEFAULT_STATE.domains[0]
    const deletedSpace = {
      ...domain.spaces[0],
      id: 'deleted-space',
      name: 'Deleted Space',
    }
    const state: AppState = {
      ...DEFAULT_STATE,
      deletedSpaces: [
        {
          id: 'deleted-space-entry',
          domainId: domain.id,
          domainName: domain.name,
          space: deletedSpace,
          deletedAt: 1,
        },
      ],
    }
    const setState = vi.fn()
    const setTrashDomainId = vi.fn()
    const setTrashSpaceId = vi.fn()
    const setTrashTabId = vi.fn()
    const setTrashSubTabId = vi.fn()
    const pushToast = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      state,
      viewMode: 'trash',
      contextMenu: {
        type: 'trash-space',
        source: 'deleted-space',
        deletedSpaceEntryId: 'deleted-space-entry',
        domainId: domain.id,
        spaceId: 'deleted-space',
        x: 0,
        y: 0,
      },
      setState,
      setTrashDomainId,
      setTrashSpaceId,
      setTrashTabId,
      setTrashSubTabId,
      pushToast,
    })

    actions.restoreFromContext()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({
        activeDomainId: domain.id,
        activeSpaceId: 'deleted-space',
      }),
    )
    expect(setTrashDomainId).toHaveBeenCalledWith('')
    expect(setTrashSpaceId).toHaveBeenCalledWith('')
    expect(setTrashTabId).toHaveBeenCalledWith('__trash_home__')
    expect(setTrashSubTabId).toHaveBeenCalledWith(null)
    expect(pushToast).toHaveBeenCalledWith('Space restored from trash.', 'success')
  })

  it('rejects deleting the only live parent tab from normal navigation actions', () => {
    const pushToast = vi.fn()
    const updateActiveSpaceData = vi.fn((updater: (data: AppState['spaces'][number]['data']) => AppState['spaces'][number]['data']) => {
      expect(updater(DEFAULT_STATE.spaces[0].data)).toBe(DEFAULT_STATE.spaces[0].data)
    })
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      pushToast,
      updateActiveSpaceData,
    })

    actions.deleteTarget({ type: 'tab', tabId: DEFAULT_STATE.spaces[0].data.tabs[0].id }, false)

    expect(updateActiveSpaceData).toHaveBeenCalledTimes(1)
    expect(pushToast).toHaveBeenCalledWith(LAST_PARENT_TAB_TOAST, 'warning')
  })

  it('permanently deletes live spaces from normal navigation actions without trashing them', () => {
    const secondSpace = { ...DEFAULT_STATE.spaces[0], id: 'space-b', name: 'Second space' }
    const spaces = [DEFAULT_STATE.spaces[0], secondSpace]
    const state: AppState = {
      ...DEFAULT_STATE,
      spaces,
      domains: [
        {
          ...DEFAULT_STATE.domains[0],
          spaces,
        },
      ],
    }
    let nextState = state
    const setState = vi.fn((update: SetStateAction<AppState>) => {
      nextState = typeof update === 'function' ? update(nextState) : update
    })
    const pushToast = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      state,
      setState,
      pushToast,
    })

    actions.deleteTarget({ type: 'space', spaceId: 'space-b' }, true)

    expect(nextState.domains[0].spaces.map((space) => space.id)).toEqual([DEFAULT_STATE.spaces[0].id])
    expect(nextState.deletedSpaces).toEqual([])
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('rejects deleting the only live space from normal navigation actions', () => {
    const setState = vi.fn((update: SetStateAction<AppState>) => {
      if (typeof update === 'function') update(DEFAULT_STATE)
    })
    const pushToast = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      setState,
      pushToast,
    })

    actions.deleteTarget({ type: 'space', spaceId: DEFAULT_STATE.activeSpaceId }, true)

    expect(pushToast).toHaveBeenCalledWith(LAST_SPACE_TOAST, 'warning')
  })

  it('rejects deleting the only live domain with notebook deletion guidance', () => {
    const setState = vi.fn((update: SetStateAction<AppState>) => {
      if (typeof update === 'function') update(DEFAULT_STATE)
    })
    const pushToast = vi.fn()
    const actions = makeActions({
      navigationContextMenusDisabled: false,
      setState,
      pushToast,
    })

    actions.deleteTarget({ type: 'domain', domainId: DEFAULT_STATE.activeDomainId }, true)

    expect(pushToast).toHaveBeenCalledWith(LAST_DOMAIN_TOAST, 'warning')
  })
})
