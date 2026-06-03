export type RenameEntityType = 'tab' | 'subtab' | 'space' | 'domain'

export type RenameTarget = {
  type: RenameEntityType
  id: string
}

export type RenameDraft = RenameTarget & {
  value: string
}

export type RenameDraftCommitRequest = RenameDraft & {
  focusEditor: false
  skipBlur: true
}

export type RenameInputKeyAction = 'commit' | 'cancel' | 'commit-and-create'

export type RenameInputKeyEventLike = {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export type TabRenameEnterBehaviorLike = 'goes-to-note' | 'creates-another-tab'

export function createRenameDraft(type: RenameEntityType, id: string, value: string): RenameDraft {
  return { type, id, value }
}

export function renameDraftMatchesTarget(draft: RenameDraft | null, target: RenameTarget | null): draft is RenameDraft {
  return Boolean(draft && target && draft.type === target.type && draft.id === target.id)
}

export function clearRenameDraftIfMatching(
  draft: RenameDraft | null,
  type: RenameEntityType,
  id: string,
): RenameDraft | null {
  return draft?.type === type && draft.id === id ? null : draft
}

export function getActiveRenameDraft(draft: RenameDraft | null, editing: RenameTarget | null): RenameDraft | null {
  return renameDraftMatchesTarget(draft, editing) ? draft : null
}

export function getRenameDraftCommitRequest(
  draft: RenameDraft | null,
  editing: RenameTarget | null,
): RenameDraftCommitRequest | null {
  const activeDraft = getActiveRenameDraft(draft, editing)
  return activeDraft ? { ...activeDraft, focusEditor: false, skipBlur: true } : null
}

export function getRenameInputKeyAction(event: RenameInputKeyEventLike): RenameInputKeyAction | null {
  if (event.key === 'Enter') return 'commit'
  if (event.key === 'Escape') return 'cancel'
  if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return 'commit-and-create'
  }
  return null
}

export function shouldCreateAnotherTabAfterRenameEnter(input: {
  type: RenameEntityType
  isPendingCreated: boolean
  tabRenameEnterBehavior: TabRenameEnterBehaviorLike
  tagFilterActive?: boolean
}): boolean {
  return (
    (input.type === 'tab' || input.type === 'subtab') &&
    input.isPendingCreated &&
    input.tabRenameEnterBehavior === 'creates-another-tab' &&
    !input.tagFilterActive
  )
}
