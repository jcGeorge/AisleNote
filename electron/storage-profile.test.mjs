import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STORAGE_PROFILE_CONFIG_FILE,
  STORAGE_PROFILE_DEFAULT_VAULT_NAME,
  getStorageProfileConfigPath,
  getDefaultStorageProfileRoot,
  getStorageProfileVaultName,
  validateVaultName,
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
      const vaultPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_VAULT_NAME)
      expect(getDefaultStorageProfileRoot(userDataPath)).toBe(vaultPath)
      expect(getStorageProfileConfigPath(userDataPath)).toBe(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))
    }))

  it('derives display names from vault folder basenames', () => {
    expect(getStorageProfileVaultName('/tmp/Christianity')).toBe('Christianity')
    expect(getStorageProfileVaultName('/tmp/Research Notes')).toBe('Research Notes')
  })

  it('validates vault folder names', () => {
    expect(validateVaultName('Project Notes')).toEqual({ ok: true, name: 'Project Notes' })
    expect(validateVaultName('')).toMatchObject({ ok: false })
    expect(validateVaultName('../bad')).toMatchObject({ ok: false })
    expect(validateVaultName('CON')).toMatchObject({ ok: false })
    expect(validateVaultName('bad:name')).toMatchObject({ ok: false })
    expect(validateVaultName('bad ')).toMatchObject({ ok: false })
  })
})
