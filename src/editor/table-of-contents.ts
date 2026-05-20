import type { NoteAisle } from '../types/app'
import type { HeadingOutlineItem } from './heading-outline'

export const TABLE_OF_CONTENTS_EMPTY_MESSAGE =
  'add headers to your notes to navigate to them with table of contents'

export type TableOfContentsPanelsState = {
  noteBodyId: string
  headingsByAisle: Record<string, HeadingOutlineItem[]>
  openAisleIds: Set<string>
}

export function buildTableOfContentsPanels(
  noteBodyId: string,
  aisles: NoteAisle[],
  getHeadingOutlineForAisle: (aisle: NoteAisle) => HeadingOutlineItem[],
): TableOfContentsPanelsState | null {
  if (!noteBodyId) return null

  const headingsByAisle = aisles.reduce<Record<string, HeadingOutlineItem[]>>((result, aisle) => {
    const headings = getHeadingOutlineForAisle(aisle)
    if (headings.length > 0) {
      result[aisle.id] = headings
    }
    return result
  }, {})
  const openAisleIds = new Set(Object.keys(headingsByAisle))

  return openAisleIds.size > 0
    ? {
        noteBodyId,
        headingsByAisle,
        openAisleIds,
      }
    : null
}
