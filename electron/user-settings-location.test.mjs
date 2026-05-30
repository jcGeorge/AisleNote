import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getUserSettingsFilePath, writeAppSettingsForState } from './app-state-storage.mjs'
import {
  createUserSettingsLocation,
  recreateMissingUserSettingsLocationFile,
  refreshLocalUserSettingsFromLocation,
  resolveUserSettingsLocation,
  validateUserSettingsFolderCandidate,
  writeUserSettingsLocationConfig,
  writeUserSettingsLocationFromState,
} from './user-settings-location.mjs'

function withTempDir(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tabs-settings-location-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function serializedAppState(theme = 'dawn') {
  return JSON.stringify({
    theme,
    hotkeys: { shortcuts: {} },
    ui: {
      settingsSection: 'data',
      dataSettingsSection: 'settings',
      toolbarLayouts: [],
    },
    domains: [],
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
        status: {
          status: 'ready',
          syncStatus: 'local',
          source: 'local-cache',
        },
      })
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

  it('falls back to local cache when custom settings are missing or invalid', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const missingRoot = path.join(root, 'missing-cloud-settings')
      const invalidRoot = path.join(root, 'invalid-cloud-settings')
      mkdirSync(path.join(invalidRoot, 'settings'), { recursive: true })
      writeFileSync(path.join(invalidRoot, 'settings', 'app-settings.json'), '{"theme":"dawn"}\n', 'utf8')

      expect(refreshLocalUserSettingsFromLocation(userDataPath, createUserSettingsLocation(userDataPath, missingRoot)))
        .toMatchObject({
          ok: false,
          status: {
            status: 'warning',
            syncStatus: 'fallback',
            source: 'local-cache',
          },
        })
      expect(refreshLocalUserSettingsFromLocation(userDataPath, createUserSettingsLocation(userDataPath, invalidRoot)))
        .toMatchObject({
          ok: false,
          status: {
            status: 'warning',
            event: 'settings-sync-invalid',
          },
        })
    }))

  it('recreates a missing cloud settings file from current settings', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)
      mkdirSync(settingsRootPath, { recursive: true })

      const result = recreateMissingUserSettingsLocationFile(userDataPath, location, serializedAppState('blues'))

      expect(result).toMatchObject({
        ok: true,
        status: {
          event: 'settings-sync-recreated',
          syncStatus: 'synced',
        },
      })
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(settingsRootPath), 'utf8')).theme).toBe('blues')
      expect(JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8')).theme).toBe('blues')
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

  it('does not recreate an unreachable settings root during automatic mirror writes', () =>
    withTempDir((root) => {
      const userDataPath = path.join(root, 'user-data')
      const settingsRootPath = path.join(root, 'missing-cloud-settings')
      const location = createUserSettingsLocation(userDataPath, settingsRootPath)

      expect(writeUserSettingsLocationFromState(userDataPath, location, serializedAppState('custom1'))).toMatchObject({
        ok: false,
        status: {
          event: 'settings-sync-unreachable',
          syncStatus: 'fallback',
        },
      })
      expect(existsSync(settingsRootPath)).toBe(false)
    }))

  it('rejects notebook folders as live settings folders', () =>
    withTempDir((root) => {
      const activeNotebook = path.join(root, 'notebook')
      const otherNotebook = path.join(root, 'other-notebook')
      mkdirSync(path.join(otherNotebook, 'notes'), { recursive: true })
      writeFileSync(path.join(otherNotebook, 'notes', 'manifest.json'), '{"schemaVersion":1}', 'utf8')

      expect(validateUserSettingsFolderCandidate(activeNotebook, activeNotebook)).toMatchObject({ ok: false })
      expect(validateUserSettingsFolderCandidate(otherNotebook, activeNotebook)).toMatchObject({ ok: false })
      expect(validateUserSettingsFolderCandidate(path.join(root, 'settings-only'), activeNotebook)).toEqual({ ok: true })
    }))
})
