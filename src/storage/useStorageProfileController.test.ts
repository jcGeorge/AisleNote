import { describe, expect, it } from 'vitest'
import {
  getStorageProfileStatusToast,
  hasActiveVaultForStorageAction,
  vaultSelectorTargetsActiveVault,
} from './useStorageProfileController'
import type { StorageProfileStatus } from '../types/app'

function storageStatus(event: string, overrides: Partial<StorageProfileStatus> = {}): StorageProfileStatus {
  return {
    status: 'ready',
    event,
    profileRootPath: '/tmp/aislenote',
    vaultPath: '/tmp/aislenote',
    vaultName: 'aislenote',
    hasProfile: true,
    canWrite: true,
    ...overrides,
  }
}

describe('vault folder status toasts', () => {
  it('shows a toast for true external folder loads', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-loaded'))).toEqual({
      message: 'External vault folder changes loaded.',
      tone: 'success',
    })
  })

  it('does not show a toast for ignored external echoes', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-echo-ignored'))).toBeNull()
  })

  it('does not show the old paused-save toast after vault auto recovery', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('vault-auto-recovered', {
          recovery: {
            event: 'vault-auto-recovered',
            mode: 'created-local',
            failedVaultPath: '/tmp/Broken',
            failedVaultName: 'Broken',
            activeVaultPath: '/tmp/Default Vault',
            activeVaultName: 'Default Vault',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
        }),
      ),
    ).toBeNull()
  })

  it('does not show a toast while vault setup is required', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('vault-setup-required', {
          status: 'setup-required',
          profileRootPath: '',
          vaultPath: '',
          vaultName: '',
          activeVaultId: null,
          hasProfile: false,
          canWrite: false,
        }),
      ),
    ).toBeNull()
  })

  it('does not toast linked mirror conflict warnings', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('external-loaded', {
          event: 'ready',
          health: 'warning',
          issues: [
            {
              code: 'linked-aisle-mirror-auto-decoupled',
              severity: 'warning',
              message: 'Linked duplicate files were edited differently outside the app.',
            },
          ],
        }),
      ),
    ).toBeNull()
  })

  it('still shows storage errors', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('external-error', {
          status: 'error',
          error: 'Existing app state could not be loaded.',
        }),
      ),
    ).toEqual({
      message: 'Existing app state could not be loaded.',
      tone: 'error',
      durationMs: 6000,
    })
  })
})

describe('vault storage action commit guards', () => {
  it('does not require a pre-storage commit before setup creates the first vault', () => {
    expect(
      hasActiveVaultForStorageAction(
        storageStatus('vault-setup-required', {
          status: 'setup-required',
          profileRootPath: '',
          vaultPath: '',
          vaultName: '',
          activeVaultId: null,
          hasProfile: false,
          canWrite: false,
        }),
      ),
    ).toBe(false)
    expect(
      hasActiveVaultForStorageAction(
        storageStatus('profile-error', {
          status: 'error',
          activeVaultId: 'broken-vault',
          vaultPath: '/tmp/Broken',
          error: 'Vault folder could not be loaded.',
        }),
      ),
    ).toBe(false)
    expect(
      hasActiveVaultForStorageAction(
        storageStatus('paused', {
          activeVaultId: 'readonly-vault',
          canWrite: false,
        }),
      ),
    ).toBe(false)
  })

  it('requires a pre-storage commit only when an action targets the active vault', () => {
    const status = storageStatus('ready', {
      activeVaultId: 'active-vault',
      vaultPath: '/tmp/Active',
    })

    expect(hasActiveVaultForStorageAction(status)).toBe(true)
    expect(vaultSelectorTargetsActiveVault(status)).toBe(true)
    expect(vaultSelectorTargetsActiveVault(status, { vaultId: 'active-vault' })).toBe(true)
    expect(vaultSelectorTargetsActiveVault(status, { vaultPath: '/tmp/Active' })).toBe(true)
    expect(vaultSelectorTargetsActiveVault(status, { vaultId: 'inactive-vault' })).toBe(false)
    expect(vaultSelectorTargetsActiveVault(status, { vaultPath: '/tmp/Inactive' })).toBe(false)
  })
})
