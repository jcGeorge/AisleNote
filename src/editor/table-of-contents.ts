import type { ResolvedNoteAisle, TableOfContentsScope } from '../types/app'
import type { HeadingOutlineItem } from './heading-outline'

export type TableOfContentsLinkItem = {
  aisleId: string
  key: string
  label: string
  href?: string
}

export const TABLE_OF_CONTENTS_EMPTY_MESSAGE =
  'Add headers or links to your notes to navigate via table of contents.'

export type TableOfContentsPanelsState = {
  noteBodyId: string
  headingsByAisle: Record<string, HeadingOutlineItem[]>
  linksByAisle: Record<string, TableOfContentsLinkItem[]>
  openAisleIds: Set<string>
}

type TableOfContentsPanelOptions = {
  scope?: TableOfContentsScope
  focusedAisleId?: string
  getLinksForAisle?: (aisle: ResolvedNoteAisle) => TableOfContentsLinkItem[]
}

export function getTableOfContentsAislesForScope(
  aisles: ResolvedNoteAisle[],
  scope: TableOfContentsScope = 'all-aisles',
  focusedAisleId = '',
): ResolvedNoteAisle[] {
  if (scope !== 'focused-aisle') return aisles
  return focusedAisleId ? aisles.filter((aisle) => aisle.id === focusedAisleId) : []
}

export function buildTableOfContentsPanels(
  noteBodyId: string,
  aisles: ResolvedNoteAisle[],
  getHeadingOutlineForAisle: (aisle: ResolvedNoteAisle) => HeadingOutlineItem[],
  options: TableOfContentsPanelOptions = {},
): TableOfContentsPanelsState | null {
  if (!noteBodyId) return null

  const scopedAisles = getTableOfContentsAislesForScope(aisles, options.scope, options.focusedAisleId)
  const headingsByAisle = scopedAisles.reduce<Record<string, HeadingOutlineItem[]>>((result, aisle) => {
    const headings = getHeadingOutlineForAisle(aisle)
    if (headings.length > 0) {
      result[aisle.id] = headings
    }
    return result
  }, {})
  const linksByAisle = scopedAisles.reduce<Record<string, TableOfContentsLinkItem[]>>((result, aisle) => {
    const links = options.getLinksForAisle?.(aisle) ?? []
    if (links.length > 0) {
      result[aisle.id] = links
    }
    return result
  }, {})
  const openAisleIds = new Set([...Object.keys(headingsByAisle), ...Object.keys(linksByAisle)])

  return openAisleIds.size > 0
    ? {
        noteBodyId,
        headingsByAisle,
        linksByAisle,
        openAisleIds,
      }
    : null
}
