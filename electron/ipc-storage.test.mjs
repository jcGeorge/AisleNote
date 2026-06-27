import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getUserSettingsFilePath, loadAppStateResult, resolveNoteLocationRevealPath, saveAppState } from './app-state-storage.mjs'
import { reconcileVaultLibraryForStartup, registerStorageIpc, resolvePreferredVaultRevealPath } from './ipc-storage.mjs'
import { VAULT_LIBRARY_CONFIG_FILE, createVaultRecord } from './vault-library.mjs'
import { STORAGE_PROFILE_CONFIG_FILE, STORAGE_PROFILE_DEFAULT_VAULT_NAME } from './storage-profile.mjs'

const tempRoots = []
const storageSessions = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-ipc-storage-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (storageSessions.length > 0) {
    storageSessions.pop()?.close?.()
  }
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState(markdown = 'markdown') {
  return {
    theme: 'cheese',
    vault: {
      activeNoteId: 'note-root',
      items: [{ type: 'note', id: 'note-root', title: 'Inbox', noteBodyId: 'body-root' }],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    messages: [],
    toastHistory: [],
    noteBodies: [{ id: 'body-root', aisles: [{ id: 'aisle-root', aisleBodyId: 'aisle-body-root' }] }],
    noteAisleBodies: [
      { id: 'aisle-body-root', markdown, tags: [], frontmatter: null, frontmatterStatus: 'none' },
    ],
    hotkeys: { shortcuts: {}, newlineShortcuts: { shortcuts: {}, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function pathFromRoot(root, relativePath) {
  return relativePath ? path.join(root, ...relativePath.split('/')) : root
}

function readVaultIndex(root) {
  return JSON.parse(readFileSync(pathFromRoot(root, '.aislenote/vault-index.json'), 'utf8'))
}

function writeLegacyPortableSettingsToEditorState(root, state) {
  const editorStatePath = pathFromRoot(root, '.aislenote/editor-state.json')
  const editorState = JSON.parse(readFileSync(editorStatePath, 'utf8'))
  writeFileSync(
    editorStatePath,
    `${JSON.stringify({
      ...editorState,
      theme: state.theme,
      hotkeys: state.hotkeys,
      ui: {
        ...(editorState.ui ?? {}),
        ...(state.ui ?? {}),
      },
    }, null, 2)}\n`,
    'utf8',
  )
}

function getRootNotePath(root) {
  const note = readVaultIndex(root).items.find((item) => item.id === 'note-root')
  expect(note?.type).toBe('note')
  return pathFromRoot(root, note.file)
}

function createIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    on: (channel, handler) => {
      listeners.set(channel, handler)
    },
  }
}

function createStorageSession(userDataPath, options = {}) {
  const ipcMain = createIpcMain()
  const session = registerStorageIpc({
    ipcMain,
    app: {
      getPath: (name) => {
        expect(name).toBe('userData')
        return userDataPath
      },
    },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: options.dialog ?? null,
    shell: options.shell ?? { trashItem: vi.fn(async (folderPath) => rmSync(folderPath, { recursive: true, force: true })) },
  })
  storageSessions.push(session)
  return { ipcMain, session }
}

async function callHandler(ipcMain, channel, payload) {
  return ipcMain.handlers.get(channel)?.(null, payload)
}

function callSyncListener(ipcMain, channel, payload) {
  const event = { returnValue: undefined, sender: { id: 1 } }
  ipcMain.listeners.get(channel)?.(event, payload)
  return event.returnValue
}

describe('preferred vault reveal paths', () => {
  it('uses the active vault folder as the reveal source', () => {
    const root = tempRoot()
    const vaultPath = path.join(root, 'vault')
    const otherVaultPath = path.join(root, 'other-vault')
    const serializedState = JSON.stringify(appState())
    mkdirSync(vaultPath, { recursive: true })
    mkdirSync(otherVaultPath, { recursive: true })
    saveAppState(vaultPath, serializedState)
    saveAppState(otherVaultPath, serializedState)

    const resolved = resolvePreferredVaultRevealPath({
      profileRootPath: vaultPath,
      payload: { type: 'live-note', location: { noteId: 'note-root' } },
      resolvePath: resolveNoteLocationRevealPath,
    })

    expect(resolved.ok).toBe(true)
    expect(resolved.absolutePath.startsWith(vaultPath)).toBe(true)
    expect(resolved.absolutePath.startsWith(otherVaultPath)).toBe(false)
  })
})

describe('startup vault folder loading', () => {
  it('leaves folder-only vault records unchanged and loads closed-app edits from the vault folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultPath = path.join(root, 'Christianity')
    mkdirSync(userDataPath, { recursive: true })

    const record = createVaultRecord(userDataPath, {
      vaultPath,
      serializedState: JSON.stringify(appState()),
    })
    const library = {
      version: 1,
      activeVaultId: record.id,
      vaults: [record],
    }
    writeFileSync(getRootNotePath(vaultPath), 'closed app folder edit', 'utf8')

    const startup = reconcileVaultLibraryForStartup(userDataPath, library)

    expect(startup.reconciliation).toBe(null)
    expect(startup.library).toEqual(library)

    const loadResult = loadAppStateResult(record.vaultPath)
    expect(loadResult.ok).toBe(true)
    const loaded = JSON.parse(loadResult.serializedState)
    expect(loaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root')?.markdown).toBe('closed app folder edit')
  })

  it('seeds a missing local app-settings file from the active vault at startup', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultPath = path.join(root, 'legacy-themed-vault')
    const state = appState('legacy markdown')
    state.theme = 'light'
    state.hotkeys.shortcuts.openSettings = 'Ctrl+,'
    state.ui = {
      ...state.ui,
      settingsSection: 'visuals',
      toolbarLayouts: [{ id: 'main', name: 'Main', items: [] }],
    }
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(vaultPath, JSON.stringify(state))
    writeLegacyPortableSettingsToEditorState(vaultPath, state)
    writeFileSync(
      path.join(userDataPath, VAULT_LIBRARY_CONFIG_FILE),
      `${JSON.stringify({
        version: 1,
        activeVaultId: 'vault-1',
        vaults: [{
          id: 'vault-1',
          vaultPath,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }],
      }, null, 2)}\n`,
      'utf8',
    )

    const { ipcMain } = createStorageSession(userDataPath)
    const localSettings = JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8'))
    const loadResult = callSyncListener(ipcMain, 'load-app-state-result')
    const loaded = JSON.parse(loadResult.serializedState)

    expect(localSettings.theme).toBe('light')
    expect(localSettings.hotkeys.shortcuts.openSettings).toBe('Ctrl+,')
    expect(localSettings.ui.settingsSection).toBe('visuals')
    expect(localSettings.ui.toolbarLayouts).toEqual([{ id: 'main', name: 'Main', items: [] }])
    expect(loaded.theme).toBe('light')
    expect(loaded.ui.settingsSection).toBe('visuals')
  })
})

describe('vault folder IPC operations', () => {
  it('does not keep the native save-dialog vault creation fallback', () => {
    const source = readFileSync(new URL('./ipc-storage.mjs', import.meta.url), 'utf8')
    expect(source).not.toContain('showSaveDialog')
    expect(source).not.toContain('chooseVaultTargetPath')
    expect(source).not.toContain('buildVaultTargetPathFromProfileRoot')
  })

  it('starts fresh desktop profiles in setup-required state and blocks app-state saves', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(
      path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE),
      `${JSON.stringify({ profileRootPath: path.join(root, 'legacy-external') }, null, 2)}\n`,
      'utf8',
    )
    saveAppState(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME), JSON.stringify(appState('legacy default')), {
      userDataPath,
    })

    const { ipcMain, session } = createStorageSession(userDataPath)

    const status = await callHandler(ipcMain, 'get-storage-profile-status')
    expect(status).toMatchObject({
      status: 'setup-required',
      profileRootPath: '',
      vaultPath: '',
      vaultName: '',
      activeVaultId: null,
      hasProfile: false,
      canWrite: false,
    })
    const loadResult = callSyncListener(ipcMain, 'load-app-state-result')
    expect(loadResult).toMatchObject({
      ok: false,
      serializedState: null,
      source: 'empty',
    })
    const saveResult = callSyncListener(ipcMain, 'save-app-state', {
      serializedState: JSON.stringify(appState('blocked')),
      baseRevision: 0,
    })
    expect(saveResult.ok).toBe(false)
    expect(session.canWriteAppState()).toBe(false)
    expect(existsSync(path.join(userDataPath, VAULT_LIBRARY_CONFIG_FILE))).toBe(true)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME))).toBe(false)
  })

  it('creates vaults directly in selected folders and removes inactive vaults from the list without deleting files', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(vaultsRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const first = await callHandler(ipcMain, 'create-vault', {
      name: 'Christianity',
      locationPath: vaultsRoot,
    })
    expect(first.ok).toBe(true)
    const firstPath = path.join(vaultsRoot, 'Christianity')
    expect(first.status.vaultPath).toBe(firstPath)
    expect(existsSync(path.join(firstPath, 'manifest.json'))).toBe(true)

    const second = await callHandler(ipcMain, 'create-vault', {
      name: 'Research',
      locationPath: vaultsRoot,
    })
    expect(second.ok).toBe(true)
    expect(second.status.vaultPath).toBe(path.join(vaultsRoot, 'Research'))

    const switched = await callHandler(ipcMain, 'switch-vault', { vaultPath: firstPath })
    expect(switched.ok).toBe(true)
    expect(switched.status.vaultName).toBe('Christianity')

    const forgotten = await callHandler(ipcMain, 'forget-vault', { vaultPath: path.join(vaultsRoot, 'Research') })
    expect(forgotten.ok).toBe(true)
    expect(existsSync(path.join(vaultsRoot, 'Research', 'manifest.json'))).toBe(true)
    expect(forgotten.status.knownVaults.map((vault) => vault.vaultName)).toEqual(['Christianity'])
  })

  it('creates a vault inside the supplied parent folder using the supplied name', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    const vaultPath = path.join(vaultsRoot, 'Project Notes')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(vaultsRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-vault', {
      name: 'Project Notes',
      locationPath: vaultsRoot,
    })

    expect(created.ok).toBe(true)
    expect(created.status.vaultName).toBe('Project Notes')
    expect(created.status.vaultPath).toBe(vaultPath)
    expect(existsSync(path.join(vaultPath, 'manifest.json'))).toBe(true)
    expect(existsSync(path.join(vaultsRoot, 'AisleNote Vault'))).toBe(false)
  })

  it('rejects vault creation without an explicit name and parent folder', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-vault')

    expect(created).toMatchObject({
      ok: false,
      error: 'Vault name is required.',
      status: {
        status: 'setup-required',
        vaultPath: '',
        canWrite: false,
      },
    })
  })

  it('renames the underlying vault folder and updates the remembered path', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(vaultsRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-vault', {
      name: 'Old Name',
      locationPath: vaultsRoot,
    })
    expect(created.ok).toBe(true)

    const rejected = await callHandler(ipcMain, 'rename-vault', { name: 'Should Not Rename Active' })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('Vault is required.')
    expect(existsSync(path.join(vaultsRoot, 'Old Name'))).toBe(true)
    expect(existsSync(path.join(vaultsRoot, 'Should Not Rename Active'))).toBe(false)

    const renamed = await callHandler(ipcMain, 'rename-vault', {
      vaultId: created.status.activeVaultId,
      vaultPath: path.join(vaultsRoot, 'Old Name'),
      name: 'New Name',
    })

    expect(renamed.ok).toBe(true)
    expect(renamed.status.vaultName).toBe('New Name')
    expect(renamed.status.vaultPath).toBe(path.join(vaultsRoot, 'New Name'))
    expect(renamed.status.knownVaults).toEqual([
      expect.objectContaining({
        vaultId: created.status.activeVaultId,
        vaultName: 'New Name',
        vaultPath: path.join(vaultsRoot, 'New Name'),
        isActive: true,
      }),
    ])
    expect(existsSync(path.join(vaultsRoot, 'Old Name'))).toBe(false)
    expect(existsSync(path.join(vaultsRoot, 'New Name', 'manifest.json'))).toBe(true)
  })

  it('renames an inactive remembered vault without switching the active vault', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(vaultsRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const first = await callHandler(ipcMain, 'create-vault', {
      name: 'Alpha',
      locationPath: vaultsRoot,
    })
    expect(first.ok).toBe(true)
    const firstVaultId = first.status.activeVaultId
    const firstPath = path.join(vaultsRoot, 'Alpha')

    const second = await callHandler(ipcMain, 'create-vault', {
      name: 'Beta',
      locationPath: vaultsRoot,
    })
    expect(second.ok).toBe(true)
    const secondVaultId = second.status.activeVaultId
    const secondPath = path.join(vaultsRoot, 'Beta')

    const rejected = await callHandler(ipcMain, 'rename-vault', {
      vaultId: 'missing-vault',
      name: 'Should Not Rename Active',
    })
    expect(rejected.ok).toBe(false)
    expect(existsSync(secondPath)).toBe(true)
    expect(existsSync(path.join(vaultsRoot, 'Should Not Rename Active'))).toBe(false)

    const renamed = await callHandler(ipcMain, 'rename-vault', {
      vaultId: firstVaultId,
      vaultPath: firstPath,
      name: 'Alpha Archive',
    })

    expect(renamed.ok).toBe(true)
    expect(renamed.status.activeVaultId).toBe(secondVaultId)
    expect(renamed.status.vaultName).toBe('Beta')
    expect(renamed.status.vaultPath).toBe(secondPath)
    expect(existsSync(firstPath)).toBe(false)
    expect(existsSync(path.join(vaultsRoot, 'Alpha Archive', 'manifest.json'))).toBe(true)
    expect(renamed.status.knownVaults).toEqual([
      expect.objectContaining({
        vaultId: firstVaultId,
        vaultName: 'Alpha Archive',
        vaultPath: path.join(vaultsRoot, 'Alpha Archive'),
        isActive: false,
      }),
      expect.objectContaining({
        vaultId: secondVaultId,
        vaultName: 'Beta',
        vaultPath: secondPath,
        isActive: true,
      }),
    ])
  })

  it('rejects creating or opening nested vault folders', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(vaultsRoot, { recursive: true })
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [vaultsRoot] })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const created = await callHandler(ipcMain, 'create-vault', {
      name: 'Parent',
      locationPath: vaultsRoot,
    })
    expect(created.ok).toBe(true)
    const parentPath = path.join(vaultsRoot, 'Parent')

    const nestedCreate = await callHandler(ipcMain, 'create-vault', {
      name: 'Child',
      locationPath: parentPath,
    })
    expect(nestedCreate.ok).toBe(false)
    expect(nestedCreate.error).toContain('Vault folders cannot be nested')

    const parentOpen = await callHandler(ipcMain, 'open-vault')
    expect(parentOpen.ok).toBe(false)
    expect(parentOpen.error).toContain('Vault folders cannot be nested')
  })

  it('rejects opening non-AisleNote Markdown folders with import guidance', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const markdownFolder = path.join(root, 'Christianity')
    mkdirSync(markdownFolder, { recursive: true })
    writeFileSync(path.join(markdownFolder, 'Sermon.md'), '# Sermon\n', 'utf8')
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [markdownFolder] })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const opened = await callHandler(ipcMain, 'open-vault')

    expect(opened.ok).toBe(false)
    expect(opened.error).toContain('not an AisleNote vault')
    expect(opened.error).toContain('Markdown import')
  })

  it('returns to setup-required after deleting the last vault without creating a default folder', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultsRoot = path.join(root, 'vaults')
    mkdirSync(vaultsRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-vault', {
      name: 'Only Vault',
      locationPath: vaultsRoot,
    })
    expect(created.ok).toBe(true)
    const vaultPath = path.join(vaultsRoot, 'Only Vault')

    const deleted = await callHandler(ipcMain, 'delete-vault', { skipConfirmation: true })

    expect(deleted.ok).toBe(true)
    expect(deleted.status).toMatchObject({
      status: 'setup-required',
      profileRootPath: '',
      vaultPath: '',
      vaultName: '',
      activeVaultId: null,
      canWrite: false,
    })
    expect(existsSync(vaultPath)).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME))).toBe(false)
  })
})
