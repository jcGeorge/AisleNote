import { describe, expect, it } from 'vitest'
import { getStorageProfileStatusToast } from './useStorageProfileController'
import type { StorageProfileStatus } from '../types/app'

function storageStatus(event: string, overrides: Partial<StorageProfileStatus> = {}): StorageProfileStatus {
  return {
    status: 'ready',
    event,
    profileRootPath: '/tmp/tabs',
    notesPath: '/tmp/tabs/notes',
    isDefault: true,
    hasProfile: true,
    canWrite: true,
    ...overrides,
  }
}

describe('storage profile status toasts', () => {
  it('shows a toast for true external profile loads', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-loaded'))).toEqual({
      message: 'external storage changes loaded.',
      tone: 'success',
    })
  })

  it('does not show a toast for ignored external echoes', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-echo-ignored'))).toBeNull()
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
