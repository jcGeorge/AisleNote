import { describe, expect, it } from 'vitest'
import {
  getAisleShortcutTipHotkeyLabel,
  getAisleShortcutTipMessage,
  getNextAisleShortcutTipCount,
  getNextTabCreateTipSequence,
  getTipDefinition,
  normalizeTipIds,
} from './tips'

describe('tips', () => {
  it('normalizes persisted tip ids', () => {
    expect(normalizeTipIds(['task-undo', 'bad', 'task-undo', 'tab-create-after-rename', 'aisle-shortcut'])).toEqual([
      'task-undo',
      'tab-create-after-rename',
      'aisle-shortcut',
    ])
    expect(normalizeTipIds('task-undo')).toEqual([])
  })

  it('resolves known tip definitions', () => {
    expect(getTipDefinition('task-undo').message).toContain('Cmd+Z')
    expect(getTipDefinition('tab-create-after-rename').message).toContain('press Tab')
    expect(getTipDefinition('aisle-shortcut').message).toContain('settings > shortcuts')
  })

  it('triggers the tab creation tip after two named created tabs of the same type', () => {
    const first = getNextTabCreateTipSequence(null, { type: 'tab', wasPendingCreated: true })
    const second = getNextTabCreateTipSequence(first.sequence, { type: 'tab', wasPendingCreated: true })

    expect(first.shouldShowTip).toBe(false)
    expect(second.shouldShowTip).toBe(true)
  })

  it('does not combine prime and sub-tab creation sequences', () => {
    const first = getNextTabCreateTipSequence(null, { type: 'tab', wasPendingCreated: true })
    const second = getNextTabCreateTipSequence(first.sequence, { type: 'subtab', wasPendingCreated: true })

    expect(second.sequence).toEqual({ type: 'subtab', count: 1 })
    expect(second.shouldShowTip).toBe(false)
  })

  it('resets the tab creation sequence after an existing tab rename', () => {
    const first = getNextTabCreateTipSequence(null, { type: 'subtab', wasPendingCreated: true })
    const reset = getNextTabCreateTipSequence(first.sequence, { type: 'subtab', wasPendingCreated: false })
    const second = getNextTabCreateTipSequence(reset.sequence, { type: 'subtab', wasPendingCreated: true })

    expect(reset.sequence).toBeNull()
    expect(second.shouldShowTip).toBe(false)
  })

  it('triggers the aisle shortcut tip after two UI aisle adds', () => {
    const first = getNextAisleShortcutTipCount(0, { source: 'ui' })
    const second = getNextAisleShortcutTipCount(first.count, { source: 'ui' })

    expect(first.shouldShowTip).toBe(false)
    expect(second.shouldShowTip).toBe(true)
  })

  it('resets the aisle shortcut tip count when the aisle is added by shortcut', () => {
    const first = getNextAisleShortcutTipCount(0, { source: 'ui' })
    const reset = getNextAisleShortcutTipCount(first.count, { source: 'shortcut' })

    expect(reset.count).toBe(0)
    expect(reset.shouldShowTip).toBe(false)
  })

  it('uses a direct aisle hotkey when one is assigned', () => {
    expect(getAisleShortcutTipHotkeyLabel(
      {
        shortcuts: {
          controlEnter: 'aisle',
          shiftEnter: 'task',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['task', 'aisle'],
      },
      (shortcutId) => shortcutId,
    )).toBe('controlEnter')
  })

  it('falls back to the shortcut menu hotkey when aisle has no direct shortcut', () => {
    expect(getAisleShortcutTipHotkeyLabel(
      {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'task',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['task', 'dashList', 'aisle'],
      },
      (shortcutId) => shortcutId,
    )).toBe('commandEnter, then 3')
  })

  it('omits the hotkey when no aisle shortcut route is configured', () => {
    expect(getAisleShortcutTipHotkeyLabel(
      {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'task',
          commandEnter: 'operationsMenu',
        },
        menuOperations: ['task', 'dashList'],
      },
      (shortcutId) => shortcutId,
    )).toBeNull()
    expect(getAisleShortcutTipMessage(null)).toContain('You can set an aisle shortcut')
  })
})
