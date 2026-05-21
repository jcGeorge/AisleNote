import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { MAX_NOTE_AISLES } from '../state/workspace'
import type { NoteAisle } from '../types/app'

export const EMPTY_AISLE_PREVIEW_TEXT = 'empty aisle'
export const MAX_AISLE_WARNING_MESSAGE = 'only eight aisles are allowed for each note'

export function createAisleEditDraft(aisles: NoteAisle[]): NoteAisle[] {
  return aisles.map((aisle) => ({
    id: aisle.id,
    aisleBodyId: aisle.aisleBodyId,
    markdown: normalizeMarkdownForPersistence(aisle.markdown),
  }))
}

export function canAddAisleToDraft(draft: NoteAisle[], maxAisles = MAX_NOTE_AISLES) {
  return draft.length < maxAisles
}

export function canDeleteAisleFromDraft(draft: NoteAisle[]) {
  return draft.length > 1
}

export function addAisleToDraft(draft: NoteAisle[], aisle: NoteAisle, maxAisles = MAX_NOTE_AISLES): NoteAisle[] {
  if (!canAddAisleToDraft(draft, maxAisles)) return draft
  return [
    ...draft,
    {
      id: aisle.id,
      aisleBodyId: aisle.aisleBodyId,
      markdown: normalizeMarkdownForPersistence(aisle.markdown),
    },
  ]
}

export function addAisleToDraftOrWarn(
  draft: NoteAisle[],
  aisle: NoteAisle,
  onWarn: (message: string) => void,
  maxAisles = MAX_NOTE_AISLES,
): NoteAisle[] {
  if (!canAddAisleToDraft(draft, maxAisles)) {
    onWarn(MAX_AISLE_WARNING_MESSAGE)
    return draft
  }
  return addAisleToDraft(draft, aisle, maxAisles)
}

export function deleteAisleFromDraft(draft: NoteAisle[], aisleId: string): NoteAisle[] {
  if (!canDeleteAisleFromDraft(draft)) return draft
  const next = draft.filter((aisle) => aisle.id !== aisleId)
  return next.length === draft.length ? draft : next
}

export function reorderAisleDraft(draft: NoteAisle[], fromIndex: number, toIndex: number): NoteAisle[] {
  if (fromIndex === toIndex) return draft
  if (fromIndex < 0 || fromIndex >= draft.length) return draft
  if (toIndex < 0 || toIndex >= draft.length) return draft

  const next = [...draft]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function moveAisleInDraft(draft: NoteAisle[], aisleId: string, direction: 'up' | 'down'): NoteAisle[] {
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
