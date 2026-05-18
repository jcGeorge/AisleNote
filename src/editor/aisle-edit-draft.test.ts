import { describe, expect, it, vi } from 'vitest'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
  MAX_AISLE_WARNING_MESSAGE,
  addAisleToDraft,
  addAisleToDraftOrWarn,
  canAddAisleToDraft,
  canDeleteAisleFromDraft,
  createAisleEditDraft,
  deleteAisleFromDraft,
  getAislePreviewText,
  moveAisleInDraft,
  reorderAisleDraft,
} from './aisle-edit-draft'
import { MAX_NOTE_AISLES } from '../state/workspace'
import type { NoteAisle } from '../types/app'

const aisle = (id: string, markdown = id): NoteAisle => ({ id, markdown })

describe('aisle edit draft helpers', () => {
  it('creates draft copies', () => {
    const source = [aisle('a', 'first   \n')]
    const draft = createAisleEditDraft(source)

    expect(draft).toEqual(source)
    expect(draft[0]).not.toBe(source[0])
  })

  it('adds aisles below the max and blocks at the max', () => {
    const draft = Array.from({ length: MAX_NOTE_AISLES - 1 }, (_, index) => aisle(`a${index}`))

    expect(canAddAisleToDraft(draft)).toBe(true)
    expect(addAisleToDraft(draft, aisle('new', 'new   \n'))).toHaveLength(MAX_NOTE_AISLES)

    const fullDraft = Array.from({ length: MAX_NOTE_AISLES }, (_, index) => aisle(`a${index}`))
    expect(canAddAisleToDraft(fullDraft)).toBe(false)
    expect(addAisleToDraft(fullDraft, aisle('blocked'))).toBe(fullDraft)
  })

  it('warns with the product copy when adding past the max', () => {
    const fullDraft = Array.from({ length: MAX_NOTE_AISLES }, (_, index) => aisle(`a${index}`))
    const onWarn = vi.fn()

    expect(addAisleToDraftOrWarn(fullDraft, aisle('blocked'), onWarn)).toBe(fullDraft)
    expect(onWarn).toHaveBeenCalledWith(MAX_AISLE_WARNING_MESSAGE)
  })

  it('deletes aisles while keeping at least one', () => {
    const draft = [aisle('a'), aisle('b')]

    expect(canDeleteAisleFromDraft(draft)).toBe(true)
    expect(deleteAisleFromDraft(draft, 'a').map((item) => item.id)).toEqual(['b'])

    const single = [aisle('a')]
    expect(canDeleteAisleFromDraft(single)).toBe(false)
    expect(deleteAisleFromDraft(single, 'a')).toBe(single)
  })

  it('moves aisles with buttons and drag reorder indexes', () => {
    const draft = [aisle('a'), aisle('b'), aisle('c')]

    expect(moveAisleInDraft(draft, 'b', 'up').map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(moveAisleInDraft(draft, 'b', 'down').map((item) => item.id)).toEqual(['a', 'c', 'b'])
    expect(reorderAisleDraft(draft, 0, 2).map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps invalid moves unchanged', () => {
    const draft = [aisle('a'), aisle('b')]

    expect(moveAisleInDraft(draft, 'a', 'up')).toBe(draft)
    expect(moveAisleInDraft(draft, 'b', 'down')).toBe(draft)
    expect(reorderAisleDraft(draft, -1, 1)).toBe(draft)
    expect(reorderAisleDraft(draft, 0, 9)).toBe(draft)
  })

  it('builds compact previews for empty and long markdown', () => {
    expect(getAislePreviewText('')).toBe(EMPTY_AISLE_PREVIEW_TEXT)
    expect(getAislePreviewText('# Title\n\n[Link](https://example.com)\n\n- item')).toBe('Title Link item')
    expect(getAislePreviewText('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefg...')
  })
})
