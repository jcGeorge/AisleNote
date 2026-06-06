import { describe, expect, it } from 'vitest'
import { getStorageProfileStatusToast } from './useStorageProfileController'
import type { StorageProfileStatus } from '../types/app'

function storageStatus(event: string, overrides: Partial<StorageProfileStatus> = {}): StorageProfileStatus {
  return {
    status: 'ready',
    event,
    profileRootPath: '/tmp/tabs',
    notebookPath: '/tmp/tabs',
    notebookName: 'tabs',
    isDefault: true,
    hasProfile: true,
    canWrite: true,
    ...overrides,
  }
}

describe('notebook folder status toasts', () => {
  it('shows a toast for true external folder loads', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-loaded'))).toEqual({
      message: 'External notebook folder changes loaded.',
      tone: 'success',
    })
  })

  it('does not show a toast for ignored external echoes', () => {
    expect(getStorageProfileStatusToast(storageStatus('external-echo-ignored'))).toBeNull()
  })

  it('does not show the old paused-save toast after notebook auto recovery', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('notebook-auto-recovered', {
          recovery: {
            event: 'notebook-auto-recovered',
            mode: 'created-local',
            failedNotebookPath: '/tmp/Broken',
            failedNotebookName: 'Broken',
            activeNotebookPath: '/tmp/Default Notebook',
            activeNotebookName: 'Default Notebook',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
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
