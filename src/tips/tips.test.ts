import { describe, expect, it } from 'vitest'
import {
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
        'delete-subtab-shortcut',
        'aisle-shortcut',
      ]),
    ).toEqual(['task-undo', 'delete-subtab-shortcut'])
    expect(normalizeTipIds('task-undo')).toEqual([])
  })

  it('resolves known tip definitions', () => {
    expect(getTipDefinition('task-undo').message).toContain('Click & hold')
  })

  it('formats the delete-subtab shortcut tip for the current platform', () => {
    expect(getTipDefinition('delete-subtab-shortcut', { isMacPlatform: true }).message).toBe(
      'You can enable command+w to delete subtabs in the misc tab of the settings.',
    )
    expect(getTipDefinition('delete-subtab-shortcut', { isMacPlatform: false }).message).toBe(
      'You can enable control+w to delete subtabs in the misc tab of the settings.',
    )
  })

})
