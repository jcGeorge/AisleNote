import { describe, expect, it } from 'vitest'
import {
  getStorageProfileStatusToast,
  hasActiveNotebookForStorageAction,
  notebookSelectorTargetsActiveNotebook,
} from './useStorageProfileController'
import type { StorageProfileStatus } from '../types/app'

function storageStatus(event: string, overrides: Partial<StorageProfileStatus> = {}): StorageProfileStatus {
  return {
    status: 'ready',
    event,
    profileRootPath: '/tmp/aislenote',
    notebookPath: '/tmp/aislenote',
    notebookName: 'aislenote',
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

  it('does not show a toast while notebook setup is required', () => {
    expect(
      getStorageProfileStatusToast(
        storageStatus('notebook-setup-required', {
          status: 'setup-required',
          profileRootPath: '',
          notebookPath: '',
          notebookName: '',
          activeNotebookId: null,
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

describe('notebook storage action commit guards', () => {
  it('does not require a pre-storage commit before setup creates the first notebook', () => {
    expect(
      hasActiveNotebookForStorageAction(
        storageStatus('notebook-setup-required', {
          status: 'setup-required',
          profileRootPath: '',
          notebookPath: '',
          notebookName: '',
          activeNotebookId: null,
          hasProfile: false,
          canWrite: false,
        }),
      ),
    ).toBe(false)
    expect(
      hasActiveNotebookForStorageAction(
        storageStatus('profile-error', {
          status: 'error',
          activeNotebookId: 'broken-notebook',
          notebookPath: '/tmp/Broken',
          error: 'Notebook folder could not be loaded.',
        }),
      ),
    ).toBe(false)
    expect(
      hasActiveNotebookForStorageAction(
        storageStatus('paused', {
          activeNotebookId: 'readonly-notebook',
          canWrite: false,
        }),
      ),
    ).toBe(false)
  })

  it('requires a pre-storage commit only when an action targets the active notebook', () => {
    const status = storageStatus('ready', {
      activeNotebookId: 'active-notebook',
      notebookPath: '/tmp/Active',
    })

    expect(hasActiveNotebookForStorageAction(status)).toBe(true)
    expect(notebookSelectorTargetsActiveNotebook(status)).toBe(true)
    expect(notebookSelectorTargetsActiveNotebook(status, { notebookId: 'active-notebook' })).toBe(true)
    expect(notebookSelectorTargetsActiveNotebook(status, { notebookPath: '/tmp/Active' })).toBe(true)
    expect(notebookSelectorTargetsActiveNotebook(status, { notebookId: 'inactive-notebook' })).toBe(false)
    expect(notebookSelectorTargetsActiveNotebook(status, { notebookPath: '/tmp/Inactive' })).toBe(false)
  })
})
