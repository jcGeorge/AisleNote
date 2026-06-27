import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'
import {
  VAULT_LIBRARY_CONFIG_FILE,
  createVaultRecord,
  createVaultRecordFromExistingFolder,
  createProfileFromVaultLibrary,
  initializeVaultLibrary,
  writeVaultLibrary,
} from './vault-library.mjs'
import {
  STORAGE_PROFILE_CONFIG_FILE,
  STORAGE_PROFILE_DEFAULT_VAULT_NAME,
} from './storage-profile.mjs'

const tempRoots = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-vault-library-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState(markdown = 'original markdown') {
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
      {
        id: 'aisle-body-root',
        markdown,
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      },
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

function writeRawLibrary(userDataPath, library) {
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(
    path.join(userDataPath, VAULT_LIBRARY_CONFIG_FILE),
    `${JSON.stringify(library, null, 2)}\n`,
    'utf8',
  )
}

function readRawLibrary(userDataPath) {
  return JSON.parse(readFileSync(path.join(userDataPath, VAULT_LIBRARY_CONFIG_FILE), 'utf8'))
}

function readVaultIndex(root) {
  return JSON.parse(readFileSync(path.join(root, '.aislenote', 'vault-index.json'), 'utf8'))
}

function getRootNotePath(root) {
  const note = readVaultIndex(root).items.find((item) => item.id === 'note-root')
  expect(note?.type).toBe('note')
  return path.join(root, ...note.file.split('/'))
}

function getMarkdown(root) {
  const result = loadAppStateResult(root)
  expect(result.ok).toBe(true)
  const state = JSON.parse(result.serializedState)
  return state.noteAisleBodies.find((body) => body.id === 'aisle-body-root')?.markdown
}

describe('vault library folders', () => {
  it('initializes a fresh desktop profile with no active vault', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })

    const library = initializeVaultLibrary(userDataPath)
    const profile = createProfileFromVaultLibrary(userDataPath, library)

    expect(library).toEqual({ version: 1, activeVaultId: null, vaults: [] })
    expect(profile).toMatchObject({
      setupRequired: true,
      profileRootPath: '',
      vaultPath: '',
      vaultId: null,
      vaultName: '',
      knownVaultPaths: [],
    })
    expect(readRawLibrary(userDataPath)).toEqual(library)
  })

  it('creates vault records directly in the selected vault folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultPath = path.join(root, 'Vaults', 'Christianity')
    mkdirSync(userDataPath, { recursive: true })

    const record = createVaultRecord(userDataPath, {
      vaultPath,
      serializedState: JSON.stringify(appState()),
    })
    const library = writeVaultLibrary(userDataPath, {
      version: 1,
      activeVaultId: record.id,
      vaults: [record],
    })

    expect(record.vaultPath).toBe(path.resolve(vaultPath))
    expect(record).not.toHaveProperty('localMirrorPath')
    expect(record).not.toHaveProperty('syncTargetPath')
    expect(existsSync(path.join(vaultPath, 'manifest.json'))).toBe(true)
    expect(getMarkdown(vaultPath)).toBe('original markdown')
    expect(readRawLibrary(userDataPath).vaults[0]).toEqual(library.vaults[0])
  })

  it('cleans up the old app-private default vault without migrating storage-profile.json', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const defaultVaultPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME)
    const externalVaultPath = path.join(root, 'external-vault')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(defaultVaultPath, JSON.stringify(appState('old default markdown')), { userDataPath })
    saveAppState(externalVaultPath, JSON.stringify(appState('external markdown')), {
      userDataPath,
      vaultId: 'external-vault',
    })
    writeFileSync(
      path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE),
      `${JSON.stringify({ profileRootPath: externalVaultPath }, null, 2)}\n`,
      'utf8',
    )

    const library = initializeVaultLibrary(userDataPath)

    expect(library).toEqual({ version: 1, activeVaultId: null, vaults: [] })
    expect(existsSync(defaultVaultPath)).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))).toBe(false)
    expect(existsSync(path.join(externalVaultPath, 'manifest.json'))).toBe(true)
  })

  it('filters remembered records that point at the old app-private default folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const defaultVaultPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME)
    const externalVaultPath = path.join(root, 'external-vault')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(defaultVaultPath, JSON.stringify(appState('old default markdown')), {
      userDataPath,
      vaultId: 'default-vault',
    })
    saveAppState(externalVaultPath, JSON.stringify(appState('external markdown')), {
      userDataPath,
      vaultId: 'external-vault',
    })
    writeRawLibrary(userDataPath, {
      version: 1,
      activeVaultId: 'default-vault',
      vaults: [
        {
          id: 'default-vault',
          vaultPath: defaultVaultPath,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'external-vault',
          vaultPath: externalVaultPath,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    })

    const library = initializeVaultLibrary(userDataPath)

    expect(library.activeVaultId).toBe('external-vault')
    expect(library.vaults).toHaveLength(1)
    expect(library.vaults[0]).toMatchObject({
      id: 'external-vault',
      vaultPath: path.resolve(externalVaultPath),
    })
    expect(existsSync(defaultVaultPath)).toBe(false)
    expect(getMarkdown(externalVaultPath)).toBe('external markdown')
  })

  it('opens an existing folder without a separate vault name', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultPath = path.join(root, 'Christianity')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(vaultPath, JSON.stringify(appState()), {
      userDataPath,
      vaultId: 'existing-vault',
    })

    const result = createVaultRecordFromExistingFolder(userDataPath, vaultPath)
    expect(result.ok).toBe(true)
    const library = writeVaultLibrary(userDataPath, {
      version: 1,
      activeVaultId: result.record.id,
      vaults: [result.record],
    })
    const profile = createProfileFromVaultLibrary(userDataPath, library)

    expect(result.record).toMatchObject({
      id: 'existing-vault',
      vaultPath: path.resolve(vaultPath),
    })
    expect(profile.vaultName).toBe('Christianity')
    expect(readFileSync(getRootNotePath(vaultPath), 'utf8')).toBe('original markdown')
  })
})
