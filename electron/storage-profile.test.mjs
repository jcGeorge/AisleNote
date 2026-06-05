import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
  getStorageProfileConfigPath,
  resolveStorageProfile,
  validateNotebookName,
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
      const notebookPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
      expect(resolveStorageProfile(userDataPath)).toEqual({
        profileRootPath: notebookPath,
        notebookPath,
        notebookName: STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
        isDefault: true,
      })
    }))

  it('persists a custom sync folder outside notes', () =>
    withTempUserDataPath((userDataPath) => {
      const syncFolder = path.join(userDataPath, '..', 'tabs-sync-folder')

      const profile = writeStorageProfileConfig(userDataPath, syncFolder)

      expect(profile).toEqual({
        profileRootPath: path.resolve(syncFolder),
        notebookPath: path.resolve(syncFolder),
        notebookName: 'tabs-sync-folder',
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
      const profile = writeStorageProfileConfig(userDataPath, path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME))

      expect(profile.isDefault).toBe(true)
      expect(existsSync(getStorageProfileConfigPath(userDataPath))).toBe(false)
    }))

  it('validates notebook folder names', () => {
    expect(validateNotebookName('Project Notes')).toEqual({ ok: true, name: 'Project Notes' })
    expect(validateNotebookName('')).toMatchObject({ ok: false })
    expect(validateNotebookName('../bad')).toMatchObject({ ok: false })
    expect(validateNotebookName('CON')).toMatchObject({ ok: false })
    expect(validateNotebookName('bad:name')).toMatchObject({ ok: false })
    expect(validateNotebookName('bad ')).toMatchObject({ ok: false })
  })
})
