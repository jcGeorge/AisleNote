import { EDITOR_BLANK_LINE_PLACEHOLDER, normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { MAX_NOTE_AISLES } from '../state/workspace'
import type { NoteAisle, ResolvedNoteAisle } from '../types/app'

export const EMPTY_AISLE_PREVIEW_TEXT = 'empty aisle'
export const MAX_AISLE_WARNING_MESSAGE = 'only eight aisles are allowed for each note'

export function createAisleEditDraft(aisles: ResolvedNoteAisle[]): ResolvedNoteAisle[] {
  return aisles.map((aisle) => ({
    id: aisle.id,
    aisleBodyId: aisle.aisleBodyId,
    markdown: normalizeMarkdownForPersistence(aisle.markdown),
  }))
}

export function canAddAisleToDraft(draft: ResolvedNoteAisle[], maxAisles = MAX_NOTE_AISLES) {
  return draft.length < maxAisles
}

export function canDeleteAisleFromDraft(draft: ResolvedNoteAisle[]) {
  return draft.length > 1
}

export function isEmptyAisleMarkdown(markdown: string): boolean {
  const normalized = normalizeMarkdownForPersistence(markdown)
  return !normalized.split('\n').some((line) => {
    const withoutBlankPlaceholders = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
    return withoutBlankPlaceholders.trim().length > 0
  })
}

export function findRightmostEmptyAisleIndex(aisles: ResolvedNoteAisle[]): number {
  for (let index = aisles.length - 1; index >= 0; index -= 1) {
    if (isEmptyAisleMarkdown(aisles[index]?.markdown ?? '')) return index
  }
  return -1
}

export function getAislesForNewAisle(
  aisles: ResolvedNoteAisle[],
  maxAisles = MAX_NOTE_AISLES,
  reclaimEmptyAisleAtLimit = false,
): ResolvedNoteAisle[] | null {
  if (aisles.length < maxAisles) return aisles
  if (!reclaimEmptyAisleAtLimit) return null
  const emptyAisleIndex = findRightmostEmptyAisleIndex(aisles)
  if (emptyAisleIndex < 0) return null
  const reclaimedAisles = aisles.filter((_aisle, index) => index !== emptyAisleIndex)
  return reclaimedAisles.length < maxAisles ? reclaimedAisles : null
}

export function addAisleToDraft(
  draft: ResolvedNoteAisle[],
  aisle: NoteAisle,
  maxAisles = MAX_NOTE_AISLES,
  options: { reclaimEmptyAisleAtLimit?: boolean } = {},
): ResolvedNoteAisle[] {
  const addBaseAisles = getAislesForNewAisle(draft, maxAisles, Boolean(options.reclaimEmptyAisleAtLimit))
  if (!addBaseAisles) return draft
  return [
    ...addBaseAisles,
    {
      id: aisle.id,
      aisleBodyId: aisle.aisleBodyId,
      markdown: '',
    },
  ]
}

export function addAisleToDraftOrWarn(
  draft: ResolvedNoteAisle[],
  aisle: NoteAisle,
  onWarn: (message: string) => void,
  maxAisles = MAX_NOTE_AISLES,
  warningMessage = MAX_AISLE_WARNING_MESSAGE,
  options: { reclaimEmptyAisleAtLimit?: boolean } = {},
): ResolvedNoteAisle[] {
  const nextDraft = addAisleToDraft(draft, aisle, maxAisles, options)
  if (nextDraft === draft) {
    onWarn(warningMessage)
    return draft
  }
  return nextDraft
}

export function deleteAisleFromDraft(draft: ResolvedNoteAisle[], aisleId: string): ResolvedNoteAisle[] {
  if (!canDeleteAisleFromDraft(draft)) return draft
  const next = draft.filter((aisle) => aisle.id !== aisleId)
  return next.length === draft.length ? draft : next
}

export function deleteFocusedAisleFromDraft(
  draft: ResolvedNoteAisle[],
  activeAisleId: string | null | undefined,
): { aisles: ResolvedNoteAisle[]; activeAisleId: string } | null {
  if (!canDeleteAisleFromDraft(draft) || !activeAisleId) return null
  const activeIndex = draft.findIndex((aisle) => aisle.id === activeAisleId)
  if (activeIndex < 0) return null
  const nextAisles = draft.filter((aisle) => aisle.id !== activeAisleId)
  const nextActiveAisleId = nextAisles[Math.min(activeIndex, nextAisles.length - 1)]?.id ?? nextAisles[0]?.id ?? ''
  if (!nextActiveAisleId) return null
  return { aisles: nextAisles, activeAisleId: nextActiveAisleId }
}

export function reorderAisleDraft(draft: ResolvedNoteAisle[], fromIndex: number, toIndex: number): ResolvedNoteAisle[] {
  if (fromIndex === toIndex) return draft
  if (fromIndex < 0 || fromIndex >= draft.length) return draft
  if (toIndex < 0 || toIndex >= draft.length) return draft

  const next = [...draft]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function reorderAisleDraftByInsertion(
  draft: ResolvedNoteAisle[],
  fromIndex: number,
  targetIndex: number,
  position: 'before' | 'after',
): ResolvedNoteAisle[] {
  if (fromIndex < 0 || fromIndex >= draft.length) return draft
  if (targetIndex < 0 || targetIndex >= draft.length) return draft
  if (fromIndex === targetIndex) return draft

  const next = [...draft]
  const [moved] = next.splice(fromIndex, 1)
  const rawInsertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const insertIndex = fromIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
  next.splice(insertIndex, 0, moved)
  return next
}

export function moveAisleInDraft(draft: ResolvedNoteAisle[], aisleId: string, direction: 'up' | 'down'): ResolvedNoteAisle[] {
  const index = draft.findIndex((aisle) => aisle.id === aisleId)
  if (index < 0) return draft
  return reorderAisleDraft(draft, index, direction === 'up' ? index - 1 : index + 1)
}

export function getAislePreviewText(markdown: string, maxLength = 140) {
  const text = normalizeMarkdownForPersistence(markdown)
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' image ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return EMPTY_AISLE_PREVIEW_TEXT
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function getAislePreviewMarkdown(markdown: string) {
  return normalizeMarkdownForPersistence(markdown)
    .replace(/<br\s*\/?>/gi, '\n')
}
