import { describe, expect, it } from 'vitest'
import {
  applyTriggeredTipState,
  getTipDefinition,
  normalizeTipIds,
} from './tips'

describe('tips', () => {
  it('normalizes persisted tip ids', () => {
    expect(
      normalizeTipIds([
        'task-undo',
        'bad',
        'task-undo',
        'tab-create-after-rename',
        'delete-active-aisle-shortcut',
        'trash-delete-confirmation-setting',
        'aisle-shortcut',
      ]),
    ).toEqual(['task-undo', 'delete-active-aisle-shortcut', 'trash-delete-confirmation-setting'])
    expect(normalizeTipIds('task-undo')).toEqual([])
  })

  it('resolves known tip definitions', () => {
    expect(getTipDefinition('task-undo').message).toContain('Click & hold')
    expect(getTipDefinition('task-undo').autoDisableAfterShow).toBeUndefined()
    expect(getTipDefinition('trash-delete-confirmation-setting').autoDisableAfterShow).toBe(true)
  })

  it('formats the active aisle shortcut tip for the current platform', () => {
    expect(getTipDefinition('delete-active-aisle-shortcut', { isMacPlatform: true }).message).toBe(
      'You can enable command+w to delete the active aisle in the misc tab of the settings.',
    )
    expect(getTipDefinition('delete-active-aisle-shortcut', { isMacPlatform: false }).message).toBe(
      'You can enable control+w to delete the active aisle in the misc tab of the settings.',
    )
  })

  it('adds triggered one-time tips to seen and disabled settings', () => {
    expect(applyTriggeredTipState({ seenTipIds: [], disabledTipIds: [] }, 'trash-delete-confirmation-setting')).toEqual({
      seenTipIds: ['trash-delete-confirmation-setting'],
      disabledTipIds: ['trash-delete-confirmation-setting'],
    })
    expect(
      applyTriggeredTipState(
        {
          seenTipIds: ['trash-delete-confirmation-setting'],
          disabledTipIds: [],
        },
        'trash-delete-confirmation-setting',
      ),
    ).toEqual({
      seenTipIds: ['trash-delete-confirmation-setting'],
      disabledTipIds: ['trash-delete-confirmation-setting'],
    })
    expect(applyTriggeredTipState({ seenTipIds: [], disabledTipIds: [] }, 'task-undo')).toEqual({
      seenTipIds: ['task-undo'],
      disabledTipIds: [],
    })
  })
})
