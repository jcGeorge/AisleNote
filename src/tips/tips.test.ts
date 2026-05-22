import { describe, expect, it } from 'vitest'
import {
  getNextTabCreateTipSequence,
  getTipDefinition,
  normalizeTipIds,
} from './tips'

describe('tips', () => {
  it('normalizes persisted tip ids', () => {
    expect(normalizeTipIds(['task-undo', 'bad', 'task-undo', 'tab-create-after-rename', 'aisle-shortcut'])).toEqual([
      'task-undo',
      'tab-create-after-rename',
    ])
    expect(normalizeTipIds('task-undo')).toEqual([])
  })

  it('resolves known tip definitions', () => {
    expect(getTipDefinition('task-undo').message).toContain('Cmd+Z')
    expect(getTipDefinition('tab-create-after-rename').message).toContain('press Tab')
  })

  it('triggers the tab creation tip after two named created tabs of the same type', () => {
    const first = getNextTabCreateTipSequence(null, {
      type: 'tab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })
    const second = getNextTabCreateTipSequence(first.sequence, {
      type: 'tab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })

    expect(first.shouldShowTip).toBe(false)
    expect(second.shouldShowTip).toBe(true)
  })

  it('does not trigger the tab creation tip for unchanged created tab names', () => {
    const first = getNextTabCreateTipSequence(null, {
      type: 'tab',
      wasPendingCreated: true,
      wasRenamedFromDefault: false,
    })
    const second = getNextTabCreateTipSequence(first.sequence, {
      type: 'tab',
      wasPendingCreated: true,
      wasRenamedFromDefault: false,
    })

    expect(first.sequence).toBeNull()
    expect(second.sequence).toBeNull()
    expect(second.shouldShowTip).toBe(false)
  })

  it('does not combine prime and sub-tab creation sequences', () => {
    const first = getNextTabCreateTipSequence(null, {
      type: 'tab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })
    const second = getNextTabCreateTipSequence(first.sequence, {
      type: 'subtab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })

    expect(second.sequence).toEqual({ type: 'subtab', count: 1 })
    expect(second.shouldShowTip).toBe(false)
  })

  it('resets the tab creation sequence after an existing tab rename', () => {
    const first = getNextTabCreateTipSequence(null, {
      type: 'subtab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })
    const reset = getNextTabCreateTipSequence(first.sequence, {
      type: 'subtab',
      wasPendingCreated: false,
      wasRenamedFromDefault: true,
    })
    const second = getNextTabCreateTipSequence(reset.sequence, {
      type: 'subtab',
      wasPendingCreated: true,
      wasRenamedFromDefault: true,
    })

    expect(reset.sequence).toBeNull()
    expect(second.shouldShowTip).toBe(false)
  })

})
