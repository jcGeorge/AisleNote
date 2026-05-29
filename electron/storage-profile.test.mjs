import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getStorageProfileConfigPath,
  getStorageProfileNotesPath,
  resolveStorageProfile,
  writeStorageProfileConfig,
} from './storage-profile.mjs'

function withTempUserDataPath(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-user-data-'))
  try {
    return run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

describe('Electron storage profile config', () => {
  it('uses the app support profile by default', () =>
    withTempUserDataPath((userDataPath) => {
      expect(resolveStorageProfile(userDataPath)).toEqual({
        profileRootPath: userDataPath,
        notesPath: path.join(userDataPath, 'notes'),
        isDefault: true,
      })
    }))

  it('persists a custom sync folder outside notes', () =>
    withTempUserDataPath((userDataPath) => {
      const syncFolder = path.join(userDataPath, '..', 'tabs-sync-folder')

      const profile = writeStorageProfileConfig(userDataPath, syncFolder)

      expect(profile).toEqual({
        profileRootPath: path.resolve(syncFolder),
        notesPath: getStorageProfileNotesPath(path.resolve(syncFolder)),
        isDefault: false,
      })
      expect(JSON.parse(readFileSync(getStorageProfileConfigPath(userDataPath), 'utf8'))).toEqual({
        profileRootPath: path.resolve(syncFolder),
      })
      expect(resolveStorageProfile(userDataPath)).toEqual(profile)
    }))

  it('removes the custom config when reset to the default profile', () =>
    withTempUserDataPath((userDataPath) => {
      writeStorageProfileConfig(userDataPath, path.join(userDataPath, '..', 'tabs-sync-folder'))
      const profile = writeStorageProfileConfig(userDataPath, userDataPath)

      expect(profile.isDefault).toBe(true)
      expect(existsSync(getStorageProfileConfigPath(userDataPath))).toBe(false)
    }))
})
