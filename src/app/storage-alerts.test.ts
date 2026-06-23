import { describe, expect, it } from 'vitest'
import type { AppMessage, ViewMode } from '../types/app'
import { buildStorageAlerts, shouldShowStorageAlerts, shouldShowTipOverlays } from './storage-alerts'

const recoveryMessage: AppMessage = {
  id: 'message-1',
  type: 'storage-notebook-recovered',
  status: 'unread',
  createdAt: '2026-06-01T00:00:00.000Z',
  signature: 'recovery-signature',
  title: 'Recovered notebook',
  body: 'AisleNote could not load this notebook folder.',
  failedNotebookPath: '/tmp/Broken Notebook',
  activeNotebookPath: '/tmp/Default Notebook',
  activeNotebookName: 'Default Notebook',
  recoveryMode: 'created-local',
}

describe('storage alerts', () => {
  it('builds recovery alerts without detail copy', () => {
    expect(buildStorageAlerts([recoveryMessage])).toEqual([
      {
        signature: 'recovery-signature',
        label: 'notebook recovered',
        message: 'AisleNote reset the notebook because the folder could not be loaded.',
        actionLabel: 'open previous notebook folder',
      },
    ])
  })

  it('does not build alerts for acknowledged recovery messages', () => {
    expect(buildStorageAlerts([{ ...recoveryMessage, status: 'acknowledged' }])).toEqual([])
  })

  it('omits recovery alert actions when the failed folder is unavailable', () => {
    expect(buildStorageAlerts([{ ...recoveryMessage, failedNotebookAvailable: false }])).toEqual([
      {
        signature: 'recovery-signature',
        label: 'notebook recovered',
        message: 'AisleNote reset the notebook because the folder could not be loaded.',
        actionLabel: undefined,
      },
    ])
  })

  it('keeps duplicate alert detail copy', () => {
    expect(
      buildStorageAlerts([
        {
          id: 'message-2',
          type: 'duplicate-auto-decoupled',
          status: 'unread',
          createdAt: '2026-06-01T00:00:00.000Z',
          signature: 'duplicate-signature',
          title: 'duplicate files de-coupled',
          body: '1 changed duplicate file was de-coupled.',
        },
      ]),
    ).toEqual([
      {
        signature: 'duplicate-signature',
        label: 'duplicate files de-coupled',
        message: 'Duplicate files were edited differently. Some copies were de-coupled.',
        detail: '1 changed duplicate file was de-coupled.',
        actionLabel: 'open settings --> messages --> inbox',
      },
    ])
  })
})

describe('tip overlay visibility', () => {
  it('shows tip overlays in primary note workflows', () => {
    const hiddenModes: ViewMode[] = ['settings', 'messages', 'about']

    expect(shouldShowTipOverlays('main')).toBe(true)
    expect(shouldShowTipOverlays('trash')).toBe(true)
    hiddenModes.forEach((mode) => {
      expect(shouldShowTipOverlays(mode)).toBe(false)
    })
  })

  it('keeps storage alerts main-only', () => {
    const hiddenModes: ViewMode[] = ['settings', 'messages', 'trash', 'about']

    expect(shouldShowStorageAlerts('main')).toBe(true)
    hiddenModes.forEach((mode) => {
      expect(shouldShowStorageAlerts(mode)).toBe(false)
    })
  })
})
