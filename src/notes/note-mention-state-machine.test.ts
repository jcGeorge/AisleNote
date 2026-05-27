import { describe, expect, it } from 'vitest'
import {
  createNoteMentionSearchMachineState,
  getNoteMentionSearchActionIntent,
  getNoteMentionSearchEffectiveIndex,
  getNoteMentionSearchResolvedTarget,
  reduceNoteMentionSearchMachine,
} from './note-mention-state-machine'

const context = {
  resultCount: 4,
  aisleIds: ['aisle-1', 'aisle-2', 'aisle-3'],
  selectedAisleIndex: 0,
  selectedAisleId: 'aisle-1',
}

describe('note mention search state machine', () => {
  it('updates hover before lock and preserves aisle selection while hovering after lock', () => {
    const initial = createNoteMentionSearchMachineState()
    const hovered = reduceNoteMentionSearchMachine(initial, { type: 'hover-result', index: 1 }, context).state

    expect(hovered).toMatchObject({
      activeIndex: 1,
      selectedIndex: null,
      searchAisleId: null,
    })

    const clicked = reduceNoteMentionSearchMachine(
      { ...hovered, searchAisleId: 'aisle-2' },
      { type: 'click-result', index: 2 },
      context,
    ).state
    const afterLockedHover = reduceNoteMentionSearchMachine(
      { ...clicked, searchAisleId: 'aisle-2' },
      { type: 'hover-result', index: 3 },
      context,
    ).state

    expect(clicked).toMatchObject({
      stage: 'aisles',
      activeIndex: 2,
      selectedIndex: 2,
      searchAisleId: null,
      focusedActionIndex: 0,
      pendingCopyAction: null,
    })
    expect(afterLockedHover).toMatchObject({
      activeIndex: 2,
      selectedIndex: 2,
      searchAisleId: 'aisle-2',
    })
  })

  it('clicking another row changes the lock and resets aisle/action/copy confirmation state', () => {
    const state = createNoteMentionSearchMachineState({
      stage: 'copy-confirm',
      activeIndex: 1,
      selectedIndex: 1,
      searchAisleId: 'aisle-3',
      focusedAisleIndex: 2,
      focusedActionIndex: 3,
      focusedConfirmIndex: 1,
      pendingCopyAction: 'synced-copy',
    })

    const next = reduceNoteMentionSearchMachine(state, { type: 'click-result', index: 3 }, context).state

    expect(next).toMatchObject({
      stage: 'aisles',
      activeIndex: 3,
      selectedIndex: 3,
      searchAisleId: null,
      focusedAisleIndex: 0,
      focusedActionIndex: 0,
      focusedConfirmIndex: 0,
      pendingCopyAction: null,
    })
  })

  it('keyboard result movement clears the click lock and returns to results', () => {
    const state = createNoteMentionSearchMachineState({
      stage: 'actions',
      activeIndex: 2,
      selectedIndex: 2,
      searchAisleId: 'aisle-2',
      pendingCopyAction: 'independent-copy',
    })

    const next = reduceNoteMentionSearchMachine(state, { type: 'keyboard-result-move', index: 3 }, context).state

    expect(next).toMatchObject({
      stage: 'results',
      activeIndex: 3,
      selectedIndex: null,
      searchAisleId: null,
      pendingCopyAction: null,
    })
  })

  it('Enter advances results to aisles to actions, then runs the focused action', () => {
    const fromResults = reduceNoteMentionSearchMachine(
      createNoteMentionSearchMachineState({ activeIndex: 1 }),
      { type: 'enter' },
      context,
    )

    expect(fromResults.state).toMatchObject({
      stage: 'aisles',
      activeIndex: 1,
      selectedIndex: 1,
    })
    expect(fromResults.intent.type).toBe('none')

    const fromAisles = reduceNoteMentionSearchMachine(
      { ...fromResults.state, focusedAisleIndex: 1 },
      { type: 'enter' },
      context,
    )

    expect(fromAisles.state).toMatchObject({
      stage: 'actions',
      searchAisleId: 'aisle-2',
      focusedAisleIndex: 1,
    })
    expect(fromAisles.intent.type).toBe('none')

    const fromActions = reduceNoteMentionSearchMachine(
      { ...fromAisles.state, focusedActionIndex: 1 },
      { type: 'enter' },
      { ...context, copyRequiresConfirmation: true },
    )

    expect(fromActions.intent).toEqual({ type: 'execute-action', action: 'preview' })
  })

  it('Tab and Shift+Tab move across results, aisles, actions, and copy confirmation boundaries', () => {
    const selected = reduceNoteMentionSearchMachine(
      createNoteMentionSearchMachineState({ activeIndex: 0 }),
      { type: 'tab' },
      context,
    ).state
    expect(selected.stage).toBe('aisles')

    const nextAisle = reduceNoteMentionSearchMachine(selected, { type: 'tab' }, context).state
    expect(nextAisle).toMatchObject({ stage: 'aisles', focusedAisleIndex: 1, searchAisleId: 'aisle-2' })

    const actions = reduceNoteMentionSearchMachine(
      { ...nextAisle, focusedAisleIndex: 2 },
      { type: 'tab' },
      context,
    ).state
    expect(actions.stage).toBe('actions')

    const backToAisles = reduceNoteMentionSearchMachine(
      { ...actions, focusedActionIndex: 0 },
      { type: 'tab', shiftKey: true },
      context,
    ).state
    expect(backToAisles.stage).toBe('aisles')

    const copyConfirm = reduceNoteMentionSearchMachine(
      { ...actions, stage: 'copy-confirm', focusedConfirmIndex: 0, pendingCopyAction: 'synced-copy' },
      { type: 'tab' },
      context,
    ).state
    expect(copyConfirm).toMatchObject({ stage: 'copy-confirm', focusedConfirmIndex: 1 })

    const canceled = reduceNoteMentionSearchMachine(
      { ...copyConfirm, focusedConfirmIndex: 0 },
      { type: 'tab', shiftKey: true },
      context,
    )
    expect(canceled.state).toMatchObject({ stage: 'actions', pendingCopyAction: null })
    expect(canceled.intent.type).toBe('cancel-copy')
  })

  it('Escape returns staged navigation to typing, then requests dismissal from typing', () => {
    const staged = createNoteMentionSearchMachineState({
      stage: 'actions',
      activeIndex: 1,
      selectedIndex: 1,
      searchAisleId: 'aisle-2',
      focusedActionIndex: 2,
      pendingCopyAction: 'independent-copy',
    })

    const returned = reduceNoteMentionSearchMachine(staged, { type: 'escape' }, context)

    expect(returned.intent.type).toBe('return-to-typing')
    expect(returned.state).toMatchObject({
      stage: 'typing',
      activeIndex: 1,
      selectedIndex: null,
      searchAisleId: null,
      focusedActionIndex: 0,
      pendingCopyAction: null,
    })

    const dismissed = reduceNoteMentionSearchMachine(returned.state, { type: 'escape' }, context)
    expect(dismissed.intent.type).toBe('dismiss-menu')
  })

  it('copy actions request confirmation or execute directly based on settings', () => {
    const state = createNoteMentionSearchMachineState({ stage: 'actions', focusedActionIndex: 2 })

    expect(getNoteMentionSearchActionIntent(state, 'independent-copy', { copyRequiresConfirmation: true })).toEqual({
      type: 'request-copy-confirm',
      action: 'independent-copy',
    })
    expect(getNoteMentionSearchActionIntent(state, 'independent-copy', { copyRequiresConfirmation: false })).toEqual({
      type: 'execute-action',
      action: 'independent-copy',
    })

    const confirmed = reduceNoteMentionSearchMachine(
      state,
      { type: 'choose-action', action: 'synced-copy' },
      { ...context, copyRequiresConfirmation: true },
    )
    expect(confirmed.state).toMatchObject({ stage: 'copy-confirm', pendingCopyAction: 'synced-copy' })
    expect(confirmed.intent).toEqual({ type: 'request-copy-confirm', action: 'synced-copy' })

    const proceed = reduceNoteMentionSearchMachine(confirmed.state, { type: 'confirm-copy' }, context)
    expect(proceed.intent).toEqual({ type: 'confirm-copy', action: 'synced-copy' })
  })

  it('resolves effective target from locked or active result and selected aisle', () => {
    const entries = ['first', 'second', 'third']
    const activeOnly = createNoteMentionSearchMachineState({ activeIndex: 2, searchAisleId: 'aisle-3' })
    const locked = createNoteMentionSearchMachineState({
      activeIndex: 0,
      selectedIndex: 1,
      searchAisleId: null,
    })

    expect(getNoteMentionSearchEffectiveIndex(activeOnly, entries.length)).toBe(2)
    expect(getNoteMentionSearchResolvedTarget(activeOnly, entries)).toEqual({
      index: 2,
      entry: 'third',
      aisleId: 'aisle-3',
    })
    expect(getNoteMentionSearchResolvedTarget(locked, entries, { defaultAisleId: 'aisle-1' })).toEqual({
      index: 1,
      entry: 'second',
      aisleId: 'aisle-1',
    })
  })
})
