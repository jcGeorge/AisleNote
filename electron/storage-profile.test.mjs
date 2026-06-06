import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
  forgetStorageProfileNotebook,
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
        knownNotebookPaths: [notebookPath],
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
        knownNotebookPaths: [
          path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME),
          path.resolve(syncFolder),
        ],
      })
      expect(JSON.parse(readFileSync(getStorageProfileConfigPath(userDataPath), 'utf8'))).toEqual({
        profileRootPath: path.resolve(syncFolder),
        knownNotebooks: [
          path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME),
          path.resolve(syncFolder),
        ],
      })
      expect(resolveStorageProfile(userDataPath)).toEqual(profile)
    }))

  it('remembers custom notebooks when reset to the default profile', () =>
    withTempUserDataPath((userDataPath) => {
      const syncFolder = path.join(userDataPath, '..', 'tabs-sync-folder')
      writeStorageProfileConfig(userDataPath, syncFolder)
      const profile = writeStorageProfileConfig(userDataPath, path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME))

      expect(profile.isDefault).toBe(true)
      expect(profile.knownNotebookPaths).toEqual([
        path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME),
        path.resolve(syncFolder),
      ])
      expect(existsSync(getStorageProfileConfigPath(userDataPath))).toBe(true)
    }))

  it('removes the custom config when only the default notebook is known', () =>
    withTempUserDataPath((userDataPath) => {
      const profile = writeStorageProfileConfig(userDataPath, path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME))

      expect(profile.isDefault).toBe(true)
      expect(profile.knownNotebookPaths).toEqual([path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)])
      expect(existsSync(getStorageProfileConfigPath(userDataPath))).toBe(false)
    }))

  it('replaces and forgets remembered notebooks without removing the active notebook', () =>
    withTempUserDataPath((userDataPath) => {
      const original = path.resolve(userDataPath, '..', 'Original')
      const renamed = path.resolve(userDataPath, '..', 'Renamed')
      const other = path.resolve(userDataPath, '..', 'Other')

      let profile = writeStorageProfileConfig(userDataPath, original, { rememberPaths: [other] })
      expect(profile.knownNotebookPaths).toContain(original)
      expect(profile.knownNotebookPaths).toContain(other)

      profile = writeStorageProfileConfig(userDataPath, renamed, { replacePaths: [[original, renamed]] })
      expect(profile.knownNotebookPaths).toContain(renamed)
      expect(profile.knownNotebookPaths).not.toContain(original)
      expect(profile.knownNotebookPaths).toContain(other)

      const forgotten = forgetStorageProfileNotebook(userDataPath, other)
      expect(forgotten.ok).toBe(true)
      expect(forgotten.profile.knownNotebookPaths).not.toContain(other)

      const activeForget = forgetStorageProfileNotebook(userDataPath, renamed)
      expect(activeForget.ok).toBe(false)
      expect(activeForget.profile.knownNotebookPaths).toContain(renamed)
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
