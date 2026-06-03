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
  findRightmostEmptyAisleIndex,
  getAislesForNewAisle,
  getAislePreviewText,
  isEmptyAisleMarkdown,
  moveAisleInDraft,
  reorderAisleDraft,
  reorderAisleDraftByInsertion,
} from './aisle-edit-draft'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'
import { MAX_NOTE_AISLES } from '../state/workspace'
import type { ResolvedNoteAisle } from '../types/app'

const aisle = (id: string, markdown = id): ResolvedNoteAisle => ({ id, aisleBodyId: id, markdown })

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

  it('treats only whitespace and editor blank placeholders as empty aisles', () => {
    expect(isEmptyAisleMarkdown('')).toBe(true)
    expect(isEmptyAisleMarkdown(' \n\t\n')).toBe(true)
    expect(isEmptyAisleMarkdown(`${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`)).toBe(true)

    expect(isEmptyAisleMarkdown('text')).toBe(false)
    expect(isEmptyAisleMarkdown('---\ntitle: note\n---')).toBe(false)
    expect(isEmptyAisleMarkdown('#tag')).toBe(false)
    expect(isEmptyAisleMarkdown('[link](https://example.com)')).toBe(false)
    expect(isEmptyAisleMarkdown('![image](tabs-asset:image)')).toBe(false)
    expect(isEmptyAisleMarkdown('-')).toBe(false)
  })

  it('finds and reclaims the rightmost empty aisle before adding at the limit', () => {
    const fullDraft = [
      aisle('a', 'one'),
      aisle('b', ' '),
      aisle('c', `${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`),
      aisle('d', 'two'),
    ]
    const onWarn = vi.fn()

    expect(findRightmostEmptyAisleIndex(fullDraft)).toBe(2)
    expect(getAislesForNewAisle(fullDraft, 4, true)?.map((item) => item.id)).toEqual(['a', 'b', 'd'])

    const next = addAisleToDraftOrWarn(fullDraft, aisle('new'), onWarn, 4, MAX_AISLE_WARNING_MESSAGE, {
      reclaimEmptyAisleAtLimit: true,
    })

    expect(next.map((item) => item.id)).toEqual(['a', 'b', 'd', 'new'])
    expect(onWarn).not.toHaveBeenCalled()
  })

  it('warns at the limit when empty aisle reclaim is enabled but no empty aisle exists', () => {
    const fullDraft = Array.from({ length: MAX_NOTE_AISLES }, (_, index) => aisle(`a${index}`, `content ${index}`))
    const onWarn = vi.fn()

    expect(addAisleToDraftOrWarn(fullDraft, aisle('blocked'), onWarn, MAX_NOTE_AISLES, MAX_AISLE_WARNING_MESSAGE, {
      reclaimEmptyAisleAtLimit: true,
    })).toBe(fullDraft)
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

  it('reorders aisles before and after insertion targets', () => {
    const draft = [aisle('a'), aisle('b'), aisle('c'), aisle('d')]

    expect(reorderAisleDraftByInsertion(draft, 0, 2, 'before').map((item) => item.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(reorderAisleDraftByInsertion(draft, 0, 2, 'after').map((item) => item.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderAisleDraftByInsertion(draft, 3, 1, 'before').map((item) => item.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(reorderAisleDraftByInsertion(draft, 3, 1, 'after').map((item) => item.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('keeps invalid insertion moves unchanged', () => {
    const draft = [aisle('a'), aisle('b'), aisle('c')]

    expect(reorderAisleDraftByInsertion(draft, 1, 1, 'before')).toBe(draft)
    expect(reorderAisleDraftByInsertion(draft, 1, 1, 'after')).toBe(draft)
    expect(reorderAisleDraftByInsertion(draft, -1, 1, 'before')).toBe(draft)
    expect(reorderAisleDraftByInsertion(draft, 1, 9, 'after')).toBe(draft)
  })

  it('builds compact previews for empty and long markdown', () => {
    expect(getAislePreviewText('')).toBe(EMPTY_AISLE_PREVIEW_TEXT)
    expect(getAislePreviewText('# Title\n\n[Link](https://example.com)\n\n- item')).toBe('Title Link item')
    expect(getAislePreviewText('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefg...')
  })
})
