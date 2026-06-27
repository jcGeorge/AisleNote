import { describe, expect, it } from 'vitest'
import {
  getStorageProfileVaultName,
  validateVaultName,
} from './storage-profile.mjs'

describe('Electron storage profile config', () => {
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
