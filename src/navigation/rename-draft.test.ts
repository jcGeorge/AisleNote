import { describe, expect, it } from 'vitest'
import {
  clearRenameDraftIfMatching,
  createRenameDraft,
  getActiveRenameDraft,
  getRenameDraftCommitRequest,
  getRenameInputKeyAction,
  shouldCreateAnotherTabAfterRenameEnter,
} from './rename-draft'

describe('rename draft helper', () => {
  it('returns the matching active draft with the latest typed value', () => {
    const draft = createRenameDraft('tab', 'tab-1', 'Typed name')

    expect(getActiveRenameDraft(draft, { type: 'tab', id: 'tab-1' })).toEqual(draft)
  })

  it('ignores non-matching drafts', () => {
    const draft = createRenameDraft('tab', 'tab-1', 'Typed name')

    expect(getActiveRenameDraft(draft, { type: 'tab', id: 'tab-2' })).toBeNull()
    expect(getActiveRenameDraft(draft, { type: 'subtab', id: 'tab-1' })).toBeNull()
    expect(getActiveRenameDraft(draft, null)).toBeNull()
  })

  it('preserves whitespace draft values for the existing commit path to normalize', () => {
    const draft = createRenameDraft('tab', 'tab-1', '   ')

    expect(getActiveRenameDraft(draft, { type: 'tab', id: 'tab-1' })?.value).toBe('   ')
  })

  it('requests blur skip and editor-focus suppression for pre-action commits', () => {
    const request = getRenameDraftCommitRequest(createRenameDraft('subtab', 'sub-1', 'Child'), {
      type: 'subtab',
      id: 'sub-1',
    })

    expect(request).toEqual({
      type: 'subtab',
      id: 'sub-1',
      value: 'Child',
      focusEditor: false,
      skipBlur: true,
    })
  })

  it('clears only the matching draft', () => {
    const draft = createRenameDraft('space', 'space-1', 'Space')

    expect(clearRenameDraftIfMatching(draft, 'space', 'space-1')).toBeNull()
    expect(clearRenameDraftIfMatching(draft, 'domain', 'space-1')).toBe(draft)
  })

  it('maps rename input keys for commit, cancel, and tab-create behavior', () => {
    expect(getRenameInputKeyAction({ key: 'Enter' })).toBe('commit')
    expect(getRenameInputKeyAction({ key: 'Escape' })).toBe('cancel')
    expect(getRenameInputKeyAction({ key: 'Tab' })).toBe('commit-and-create')
    expect(getRenameInputKeyAction({ key: 'Tab', shiftKey: true })).toBeNull()
    expect(getRenameInputKeyAction({ key: 'Tab', metaKey: true })).toBeNull()
  })

  it('only creates another tab on Enter for pending created tab renames with the opt-in setting', () => {
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'tab',
      isPendingCreated: true,
      tabRenameEnterBehavior: 'creates-another-tab',
    })).toBe(true)
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'subtab',
      isPendingCreated: true,
      tabRenameEnterBehavior: 'creates-another-tab',
    })).toBe(true)
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'tab',
      isPendingCreated: false,
      tabRenameEnterBehavior: 'creates-another-tab',
    })).toBe(false)
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'tab',
      isPendingCreated: true,
      tabRenameEnterBehavior: 'goes-to-note',
    })).toBe(false)
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'space',
      isPendingCreated: true,
      tabRenameEnterBehavior: 'creates-another-tab',
    })).toBe(false)
    expect(shouldCreateAnotherTabAfterRenameEnter({
      type: 'tab',
      isPendingCreated: true,
      tabRenameEnterBehavior: 'creates-another-tab',
      tagFilterActive: true,
    })).toBe(false)
  })
})
