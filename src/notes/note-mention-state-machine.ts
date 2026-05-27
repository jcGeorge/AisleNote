import {
  NOTE_MENTION_ACTIONS,
  isNoteMentionCopyAction,
  type NoteMentionAction,
  type NoteMentionSearchFocusStage,
} from './note-mention-picker'

export type NoteMentionSearchMachineState = {
  stage: NoteMentionSearchFocusStage
  activeIndex: number
  selectedIndex: number | null
  searchAisleId: string | null
  focusedAisleIndex: number
  focusedActionIndex: number
  focusedConfirmIndex: number
  pendingCopyAction: NoteMentionAction | null
}

export type NoteMentionSearchMachineContext = {
  resultCount: number
  aisleCount?: number
  aisleIds?: readonly string[]
  selectedAisleId?: string | null
  selectedAisleIndex?: number
  copyRequiresConfirmation?: boolean
}

export type NoteMentionSearchMachineEvent =
  | { type: 'query-reset' }
  | { type: 'clamp-results'; clearSelection?: boolean }
  | { type: 'hover-result'; index: number }
  | { type: 'click-result'; index: number }
  | { type: 'keyboard-result-move'; index: number }
  | { type: 'select-aisle'; aisleId: string | null; index?: number; advanceToActions?: boolean }
  | { type: 'focus-action'; index: number }
  | { type: 'choose-action'; action: NoteMentionAction }
  | { type: 'confirm-copy' }
  | { type: 'cancel-copy' }
  | { type: 'escape' }
  | { type: 'tab'; shiftKey?: boolean }
  | { type: 'enter' }
  | { type: 'horizontal'; delta: -1 | 1 }

export type NoteMentionSearchMachineIntent =
  | { type: 'none' }
  | { type: 'dismiss-menu' }
  | { type: 'return-to-typing' }
  | { type: 'execute-action'; action: NoteMentionAction }
  | { type: 'request-copy-confirm'; action: NoteMentionAction }
  | { type: 'confirm-copy'; action: NoteMentionAction }
  | { type: 'cancel-copy' }

export type NoteMentionSearchMachineResult = {
  state: NoteMentionSearchMachineState
  intent: NoteMentionSearchMachineIntent
}

export type NoteMentionSearchActionIntent =
  | { type: 'execute-action'; action: NoteMentionAction }
  | { type: 'request-copy-confirm'; action: NoteMentionAction }

export type NoteMentionSearchResolvedTarget<Entry> = {
  index: number
  entry: Entry
  aisleId: string | null
}

const NO_INTENT: NoteMentionSearchMachineIntent = { type: 'none' }

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

function clampResultIndex(index: number, resultCount: number): number {
  return clamp(index, 0, Math.max(0, resultCount - 1))
}

function getAisleCount(context: NoteMentionSearchMachineContext): number {
  return context.aisleIds?.length ?? context.aisleCount ?? 0
}

function getAisleIdAtIndex(context: NoteMentionSearchMachineContext, index: number): string | null {
  if (context.aisleIds) return context.aisleIds[index] ?? null
  if (context.selectedAisleIndex === index) return context.selectedAisleId ?? null
  return null
}

function getSelectedAisleIndex(state: NoteMentionSearchMachineState, context: NoteMentionSearchMachineContext): number {
  const aisleCount = getAisleCount(context)
  if (aisleCount <= 0) return 0
  if (context.aisleIds && state.searchAisleId) {
    const index = context.aisleIds.indexOf(state.searchAisleId)
    if (index >= 0) return index
  }
  return clamp(state.focusedAisleIndex, 0, aisleCount - 1)
}

function getInitialAisleIndex(context: NoteMentionSearchMachineContext): number {
  const aisleCount = getAisleCount(context)
  if (aisleCount <= 0) return 0
  if (typeof context.selectedAisleIndex === 'number') {
    return clamp(context.selectedAisleIndex, 0, aisleCount - 1)
  }
  return 0
}

function nextStageForAisles(context: NoteMentionSearchMachineContext): NoteMentionSearchFocusStage {
  return getAisleCount(context) > 0 ? 'aisles' : 'actions'
}

function makeResult(
  state: NoteMentionSearchMachineState,
  intent: NoteMentionSearchMachineIntent = NO_INTENT,
): NoteMentionSearchMachineResult {
  return { state, intent }
}

export function createNoteMentionSearchMachineState(
  overrides: Partial<NoteMentionSearchMachineState> = {},
): NoteMentionSearchMachineState {
  return {
    stage: 'typing',
    activeIndex: 0,
    selectedIndex: null,
    searchAisleId: null,
    focusedAisleIndex: 0,
    focusedActionIndex: 0,
    focusedConfirmIndex: 0,
    pendingCopyAction: null,
    ...overrides,
  }
}

export function getNoteMentionSearchEffectiveIndex(
  state: NoteMentionSearchMachineState,
  resultCount: number,
): number {
  return clampResultIndex(state.selectedIndex ?? state.activeIndex, resultCount)
}

export function getNoteMentionSearchActionIntent(
  _state: NoteMentionSearchMachineState,
  action: NoteMentionAction,
  context: Pick<NoteMentionSearchMachineContext, 'copyRequiresConfirmation'>,
): NoteMentionSearchActionIntent {
  if (isNoteMentionCopyAction(action) && context.copyRequiresConfirmation !== false) {
    return { type: 'request-copy-confirm', action }
  }
  return { type: 'execute-action', action }
}

export function getNoteMentionSearchResolvedTarget<Entry>(
  state: NoteMentionSearchMachineState,
  entries: readonly Entry[],
  options: { defaultAisleId?: string | null } = {},
): NoteMentionSearchResolvedTarget<Entry> | null {
  if (entries.length === 0) return null
  const index = getNoteMentionSearchEffectiveIndex(state, entries.length)
  const entry = entries[index]
  if (!entry) return null
  return {
    index,
    entry,
    aisleId: state.searchAisleId ?? options.defaultAisleId ?? null,
  }
}

export function reduceNoteMentionSearchMachine(
  state: NoteMentionSearchMachineState,
  event: NoteMentionSearchMachineEvent,
  context: NoteMentionSearchMachineContext,
): NoteMentionSearchMachineResult {
  if (event.type === 'query-reset') {
    return makeResult(createNoteMentionSearchMachineState())
  }

  if (event.type === 'clamp-results') {
    const activeIndex = clampResultIndex(state.activeIndex, context.resultCount)
    const selectedIndex =
      event.clearSelection || state.selectedIndex === null
        ? null
        : clampResultIndex(state.selectedIndex, context.resultCount)
    return makeResult({ ...state, activeIndex, selectedIndex })
  }

  if (event.type === 'hover-result') {
    if (state.selectedIndex !== null) return makeResult(state)
    const activeIndex = clampResultIndex(event.index, context.resultCount)
    return makeResult({
      ...state,
      activeIndex,
      selectedIndex: null,
      searchAisleId: activeIndex === state.activeIndex ? state.searchAisleId : null,
    })
  }

  if (event.type === 'click-result') {
    const activeIndex = clampResultIndex(event.index, context.resultCount)
    return makeResult({
      ...state,
      stage: nextStageForAisles(context),
      activeIndex,
      selectedIndex: activeIndex,
      searchAisleId: null,
      focusedAisleIndex: getInitialAisleIndex(context),
      focusedActionIndex: 0,
      focusedConfirmIndex: 0,
      pendingCopyAction: null,
    })
  }

  if (event.type === 'keyboard-result-move') {
    const activeIndex = clampResultIndex(event.index, context.resultCount)
    return makeResult({
      ...state,
      stage: 'results',
      activeIndex,
      selectedIndex: null,
      searchAisleId:
        state.selectedIndex === null && activeIndex === state.activeIndex ? state.searchAisleId : null,
      pendingCopyAction: null,
    })
  }

  if (event.type === 'select-aisle') {
    const aisleCount = getAisleCount(context)
    const focusedAisleIndex = clamp(event.index ?? state.focusedAisleIndex, 0, Math.max(0, aisleCount - 1))
    return makeResult({
      ...state,
      stage: event.advanceToActions ? 'actions' : state.stage,
      searchAisleId: event.aisleId,
      focusedAisleIndex,
      pendingCopyAction: null,
    })
  }

  if (event.type === 'focus-action') {
    return makeResult({
      ...state,
      focusedActionIndex: clamp(event.index, 0, NOTE_MENTION_ACTIONS.length - 1),
    })
  }

  if (event.type === 'choose-action') {
    const intent = getNoteMentionSearchActionIntent(state, event.action, context)
    if (intent.type === 'request-copy-confirm') {
      return makeResult({
        ...state,
        stage: 'copy-confirm',
        focusedConfirmIndex: 0,
        pendingCopyAction: event.action,
      }, intent)
    }
    return makeResult(state, intent)
  }

  if (event.type === 'confirm-copy') {
    const action = state.pendingCopyAction
    if (!action || !isNoteMentionCopyAction(action)) return makeResult(state)
    return makeResult(state, { type: 'confirm-copy', action })
  }

  if (event.type === 'cancel-copy') {
    return makeResult({
      ...state,
      stage: 'actions',
      pendingCopyAction: null,
    }, { type: 'cancel-copy' })
  }

  if (event.type === 'escape') {
    if (state.stage !== 'typing' || state.selectedIndex !== null || state.pendingCopyAction) {
      return makeResult({
        ...state,
        stage: 'typing',
        selectedIndex: null,
        searchAisleId: null,
        focusedAisleIndex: 0,
        focusedActionIndex: 0,
        focusedConfirmIndex: 0,
        pendingCopyAction: null,
      }, { type: 'return-to-typing' })
    }
    return makeResult(state, { type: 'dismiss-menu' })
  }

  if (event.type === 'enter') {
    if (state.stage === 'copy-confirm') {
      if (state.focusedConfirmIndex === 0) {
        return reduceNoteMentionSearchMachine(state, { type: 'confirm-copy' }, context)
      }
      return reduceNoteMentionSearchMachine(state, { type: 'cancel-copy' }, context)
    }
    if (state.stage === 'actions') {
      return reduceNoteMentionSearchMachine(
        state,
        { type: 'choose-action', action: NOTE_MENTION_ACTIONS[state.focusedActionIndex] ?? 'link' },
        context,
      )
    }
    if (state.stage === 'aisles') {
      const aisleIndex = getSelectedAisleIndex(state, context)
      return reduceNoteMentionSearchMachine(
        state,
        {
          type: 'select-aisle',
          aisleId: getAisleIdAtIndex(context, aisleIndex),
          index: aisleIndex,
          advanceToActions: true,
        },
        context,
      )
    }
    return reduceNoteMentionSearchMachine(
      state,
      { type: 'click-result', index: getNoteMentionSearchEffectiveIndex(state, context.resultCount) },
      context,
    )
  }

  if (event.type === 'tab') {
    const delta = event.shiftKey ? -1 : 1
    if (state.stage === 'copy-confirm') {
      if (delta < 0 && state.focusedConfirmIndex === 0) {
        return reduceNoteMentionSearchMachine(state, { type: 'cancel-copy' }, context)
      }
      return makeResult({
        ...state,
        focusedConfirmIndex: clamp(state.focusedConfirmIndex + delta, 0, 1),
      })
    }
    if (state.stage === 'actions') {
      const nextActionIndex = state.focusedActionIndex + delta
      if (nextActionIndex < 0) {
        return makeResult({
          ...state,
          stage: getAisleCount(context) > 0 ? 'aisles' : 'results',
        })
      }
      return makeResult({
        ...state,
        focusedActionIndex: clamp(nextActionIndex, 0, NOTE_MENTION_ACTIONS.length - 1),
      })
    }
    if (state.stage === 'aisles') {
      const aisleCount = getAisleCount(context)
      const nextAisleIndex = state.focusedAisleIndex + delta
      if (nextAisleIndex < 0) {
        return makeResult({ ...state, stage: 'results' })
      }
      if (nextAisleIndex >= aisleCount) {
        return makeResult({ ...state, stage: 'actions' })
      }
      return reduceNoteMentionSearchMachine(
        state,
        {
          type: 'select-aisle',
          aisleId: getAisleIdAtIndex(context, nextAisleIndex),
          index: nextAisleIndex,
        },
        context,
      )
    }
    return reduceNoteMentionSearchMachine(
      state,
      { type: 'click-result', index: getNoteMentionSearchEffectiveIndex(state, context.resultCount) },
      context,
    )
  }

  if (event.type === 'horizontal') {
    if (state.stage === 'copy-confirm') {
      return makeResult({
        ...state,
        focusedConfirmIndex: clamp(state.focusedConfirmIndex + event.delta, 0, 1),
      })
    }
    if (state.stage === 'actions') {
      return makeResult({
        ...state,
        focusedActionIndex: clamp(state.focusedActionIndex + event.delta, 0, NOTE_MENTION_ACTIONS.length - 1),
      })
    }
    const aisleCount = getAisleCount(context)
    if (aisleCount <= 0) return makeResult(state)
    const nextAisleIndex = clamp(state.focusedAisleIndex + event.delta, 0, aisleCount - 1)
    return reduceNoteMentionSearchMachine(
      { ...state, stage: 'aisles' },
      {
        type: 'select-aisle',
        aisleId: getAisleIdAtIndex(context, nextAisleIndex),
        index: nextAisleIndex,
      },
      context,
    )
  }

  return makeResult(state)
}
