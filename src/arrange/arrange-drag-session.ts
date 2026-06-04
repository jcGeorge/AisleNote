import type { ArrangeModeState } from '../types/app'

export type ArrangeLiveDragItemKind = 'parent' | 'subtab' | 'space' | 'domain'

export type ArrangeLiveDragFinishKind =
  | 'noop'
  | 'reorder'
  | 'trash'
  | 'hierarchy-drop'
  | 'cross-domain-move'
  | 'blocked'

export type ArrangeLiveDragResetScope = 'all' | 'tabs' | 'spaces' | 'domains'

export function shouldClearArrangeSelectionAfterLiveDragFinish({
  itemKind,
  finishKind,
}: {
  itemKind: ArrangeLiveDragItemKind
  finishKind: ArrangeLiveDragFinishKind
}): boolean {
  if (finishKind === 'noop') return false
  if (finishKind === 'trash' || finishKind === 'blocked') return true
  if (finishKind === 'hierarchy-drop' || finishKind === 'cross-domain-move') return true
  return itemKind === 'space' || itemKind === 'domain'
}

export function clearArrangeModeLiveDragState(
  mode: ArrangeModeState,
  scope: ArrangeLiveDragResetScope = 'all',
): ArrangeModeState {
  if (!mode.active) return mode

  const clearTabs = scope === 'all' || scope === 'tabs'
  const clearSpaces = scope === 'all' || scope === 'spaces'
  const clearDomains = scope === 'all' || scope === 'domains'

  return {
    ...mode,
    dragItem: null,
    overParentTabId: clearTabs ? null : mode.overParentTabId,
    overParentInsert: clearTabs ? null : mode.overParentInsert,
    overSubTabId: clearTabs ? null : mode.overSubTabId,
    overSubTabInsert: clearTabs ? null : mode.overSubTabInsert,
    overSpaceId: clearSpaces ? null : mode.overSpaceId,
    overSpaceInsert: clearSpaces ? null : mode.overSpaceInsert,
    overDomainId: clearDomains ? null : mode.overDomainId,
    overDomainInsert: clearDomains ? null : mode.overDomainInsert,
  }
}
