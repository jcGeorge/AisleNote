import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getUserSettingsFilePath, writeAppSettingsForState } from './app-state-storage.mjs'
import {
  USER_SETTINGS_LOCATION_CONFIG_FILE,
  createUserSettingsLocation,
  recreateMissingUserSettingsLocationFile,
  refreshLocalUserSettingsFromLocation,
  resetUserSettingsLocationToDefaults,
  resolveUserSettingsLocation,
  validateUserSettingsFolderCandidate,
  writeUserSettingsLocationConfig,
  writeUserSettingsLocationFromState,
} from './user-settings-location.mjs'

function withTempDir(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-settings-location-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function serializedAppState(theme = 'cheese') {
  return JSON.stringify({
    theme,
    hotkeys: { shortcuts: {} },
    ui: {
      settingsSection: 'data',
      dataSettingsSection: 'settings',
      toolbarLayouts: [],
    },
    notebook: {
      activeNoteId: 'note-1',
      items: [{ type: 'note', id: 'note-1', title: 'Note', noteBodyId: 'body-1' }],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [],
  })
}

describe('user settings location storage', () => {
  it('defaults to the local app-support settings cache', () =>
    withTempDir((userDataPath) => {
      const location = resolveUserSettingsLocation(userDataPath)
      expect(location).toMatchObject({
        settingsRootPath: userDataPath,
        settingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        localSettingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        isDefault: true,
      })

      expect(refreshLocalUserSettingsFromLocation(userDataPath, location)).toMatchObject({
        ok: true,
        created: true,
        status: {
          status: 'ready',
          event: 'local-settings-created',
          syncStatus: 'local',
          source: 'local-cache',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('dark')
    }))

  it('loads valid cloud settings into the local cache', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      mkdirSync(userDataPath, { recursive: true })
      writeAppSettingsForState(settingsRootPath, serializedAppState('light'))
      writeUserSettingsLocationConfig(userDataPath, settingsRootPath)

      const location = resolveUserSettingsLocation(userDataPath)
      const refresh = refreshLocalUserSettingsFromLocation(userDataPath, location)

      expect(refresh).toMatchObject({
        ok: true,
        copied: true,
        status: {
          status: 'ready',
          syncStatus: 'synced',
          source: 'settings-folder',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('light')
    }))

  it('detaches missing settings roots and still falls back for invalid reachable settings', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const missingRoot = path.join(root, 'missing-cloud-settings')
      const invalidRoot = path.join(root, 'invalid-cloud-settings')
      mkdirSync(path.join(invalidRoot, 'settings'), { recursive: true })
      writeFileSync(path.join(invalidRoot, 'settings', 'app-settings.json'), '{"theme":"cheese"}\n', 'utf8')
      writeUserSettingsLocationConfig(userDataPath, missingRoot)

      const missingRefresh = refreshLocalUserSettingsFromLocation(userDataPath, resolveUserSettingsLocation(userDataPath))

      expect(missingRefresh).toMatchObject({
        ok: true,
        detached: true,
        location: {
          settingsRootPath: userDataPath,
          isDefault: true,
        },
        status: {
          status: 'warning',
          event: 'settings-folder-unreachable-reset',
          syncStatus: 'local',
          source: 'local-cache',
          isDefault: true,
          canWrite: true,
          error: 'Settings folder could not be reached. Switched to local app settings.',
        },
      })
      expect(resolveUserSettingsLocation(userDataPath)).toMatchObject({
        settingsRootPath: userDataPath,
        isDefault: true,
      })
      expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('dark')

      expect(refreshLocalUserSettingsFromLocation(userDataPath, createUserSettingsLocation(userDataPath, invalidRoot)))
        .toMatchObject({
          ok: false,
          status: {
            status: 'warning',
            event: 'settings-sync-invalid',
          },
        })
    }))

  it('recreates missing cloud settings from valid local cache during launch refresh', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      mkdirSync(settingsRootPath, { recursive: true })
      writeAppSettingsForState(userDataPath, serializedAppState('light'))

      const refresh = refreshLocalUserSettingsFromLocation(userDataPath, location)

      expect(refresh).toMatchObject({
        ok: true,
        recreated: true,
        status: {
          status: 'warning',
          event: 'settings-sync-recreated',
          syncStatus: 'synced',
          source: 'local-cache',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('light')
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('light')
    }))

  it('creates default local and cloud settings when both are missing but the cloud root is reachable', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      mkdirSync(settingsRootPath, { recursive: true })

      const refresh = refreshLocalUserSettingsFromLocation(userDataPath, location)

      expect(refresh).toMatchObject({
        ok: true,
        recreated: true,
        status: {
          status: 'warning',
          event: 'settings-sync-recreated',
          syncStatus: 'synced',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('dark')
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('dark')
    }))

  it('recreates a missing cloud settings file from current settings', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      mkdirSync(settingsRootPath, { recursive: true })

      const result = recreateMissingUserSettingsLocationFile(userDataPath, location, serializedAppState('light'))

      expect(result).toMatchObject({
        ok: true,
        status: {
          event: 'settings-sync-recreated',
          syncStatus: 'synced',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('light')
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('light')
    }))

  it('mirrors app settings changes to reachable custom settings folders', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      mkdirSync(settingsRootPath, { recursive: true })

      expect(writeUserSettingsLocationFromState(userDataPath, location, serializedAppState('custom1'))).toMatchObject({
        ok: true,
        status: {
          event: 'settings-sync-saved',
          syncStatus: 'synced',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('custom1')
    }))

  it('resets local and reachable cloud settings to defaults', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      writeAppSettingsForState(userDataPath, serializedAppState('custom1'))
      writeAppSettingsForState(settingsRootPath, serializedAppState('light'))

      const result = resetUserSettingsLocationToDefaults(userDataPath, location)

      expect(result).toMatchObject({
        ok: true,
        status: {
          event: 'settings-reset-defaults',
          syncStatus: 'synced',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('dark')
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('dark')
    }))

  it('detaches a deleted settings root during reset to defaults', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'missing-cloud-settings')
      writeAppSettingsForState(userDataPath, serializedAppState('custom1'))
      writeUserSettingsLocationConfig(userDataPath, settingsRootPath)

      const result = resetUserSettingsLocationToDefaults(userDataPath, resolveUserSettingsLocation(userDataPath))

      expect(result).toMatchObject({
        ok: true,
        detached: true,
        location: {
          settingsRootPath: userDataPath,
          isDefault: true,
        },
        status: {
          status: 'warning',
          event: 'settings-folder-unreachable-reset',
          syncStatus: 'local',
          source: 'local-cache',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('dark')
      expect(existsSync(settingsRootPath)).toBe(false)
      expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
    }))

  it('does not recreate an unreachable settings root during automatic mirror writes', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'missing-cloud-settings')
      writeUserSettingsLocationConfig(userDataPath, settingsRootPath)
      const location = resolveUserSettingsLocation(userDataPath)

      const result = writeUserSettingsLocationFromState(userDataPath, location, serializedAppState('custom1'))

      expect(result).toMatchObject({
        ok: true,
        detached: true,
        location: {
          settingsRootPath: userDataPath,
          isDefault: true,
        },
        status: {
          event: 'settings-folder-unreachable-reset',
          syncStatus: 'local',
        },
      })
      expect(existsSync(settingsRootPath)).toBe(false)
      expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('custom1')
    }))

  it('rejects notebook folders as live settings folders', () =>
    withTempDir((root) => {
      const activeNotebook = path.join(root, 'notebook')
      const otherNotebook = path.join(root, 'other-notebook')
      mkdirSync(otherNotebook, { recursive: true })
      writeFileSync(path.join(otherNotebook, 'manifest.json'), '{"schemaVersion":1}', 'utf8')

      expect(validateUserSettingsFolderCandidate(activeNotebook, activeNotebook)).toMatchObject({ ok: false })
      expect(validateUserSettingsFolderCandidate(otherNotebook, activeNotebook)).toMatchObject({ ok: false })
      expect(validateUserSettingsFolderCandidate(path.join(root, 'settings-only'), activeNotebook)).toEqual({ ok: true })
    }))
})
