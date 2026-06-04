import type { ArrangeSelectionKind, ArrangeSelectionState, SelectionClickModifiers } from '../types/app'
import { getArrangeSelectionActiveReplacementId, updateArrangeSelectionForClick } from './arrange-selection'

type ResolveArrangeSelectionClickOptions = {
  selection: ArrangeSelectionState
  kind: ArrangeSelectionKind
  parentTabId?: string | null
  domainId?: string | null
  itemId: string
  orderedIds: string[]
  currentId: string | null
  modifiers: SelectionClickModifiers
}

export type ArrangeSelectionClickResolution = {
  nextSelection: ArrangeSelectionState
  activeReplacementId: string | null
}

export function resolveArrangeSelectionClick({
  selection,
  kind,
  parentTabId = null,
  domainId = null,
  itemId,
  orderedIds,
  currentId,
  modifiers,
}: ResolveArrangeSelectionClickOptions): ArrangeSelectionClickResolution {
  const nextSelection = updateArrangeSelectionForClick({
    selection,
    kind,
    parentTabId,
    domainId,
    itemId,
    orderedIds,
    currentId,
    modifiers,
  })
  const activeReplacementId = getArrangeSelectionActiveReplacementId({
    previousSelection: selection,
    nextSelection,
    kind,
    parentTabId,
    domainId,
    itemId,
    currentId,
    modifiers,
  })

  return { nextSelection, activeReplacementId }
}
