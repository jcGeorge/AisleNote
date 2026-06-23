import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STORAGE_PROFILE_CONFIG_FILE,
  STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
  getStorageProfileConfigPath,
  getDefaultStorageProfileRoot,
  getStorageProfileNotebookName,
  validateNotebookName,
} from './storage-profile.mjs'

function withTempUserDataPath(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'aislenote-profile-user-data-'))
  try {
    return run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

describe('Electron storage profile config', () => {
  it('only exposes legacy storage-profile paths for cleanup helpers', () =>
    withTempUserDataPath((userDataPath) => {
      const notebookPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
      expect(getDefaultStorageProfileRoot(userDataPath)).toBe(notebookPath)
      expect(getStorageProfileConfigPath(userDataPath)).toBe(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))
    }))

  it('derives display names from notebook folder basenames', () => {
    expect(getStorageProfileNotebookName('/tmp/Christianity')).toBe('Christianity')
    expect(getStorageProfileNotebookName('/tmp/Research Notes')).toBe('Research Notes')
  })

  it('validates notebook folder names', () => {
    expect(validateNotebookName('Project Notes')).toEqual({ ok: true, name: 'Project Notes' })
    expect(validateNotebookName('')).toMatchObject({ ok: false })
    expect(validateNotebookName('../bad')).toMatchObject({ ok: false })
    expect(validateNotebookName('CON')).toMatchObject({ ok: false })
    expect(validateNotebookName('bad:name')).toMatchObject({ ok: false })
    expect(validateNotebookName('bad ')).toMatchObject({ ok: false })
  })
})
