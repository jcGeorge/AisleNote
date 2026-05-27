import type { NoteSearchEntry } from '../../notes/note-locations'
import type { NoteMentionAction } from '../../notes/note-mention-picker'

type NoteMentionPointerEvent = {
  preventDefault: () => void
  stopPropagation: () => void
}

export function handleNoteMentionSearchResultClick(
  event: NoteMentionPointerEvent,
  index: number,
  onSelectSearchResult: (index: number) => void,
) {
  event.preventDefault()
  event.stopPropagation()
  onSelectSearchResult(index)
}

export function handleNoteMentionSearchResultHover(index: number, onHighlightSearch: (index: number) => void) {
  onHighlightSearch(index)
}

export function handleNoteMentionSearchResultDoubleClick(
  event: NoteMentionPointerEvent,
  entry: NoteSearchEntry,
  onChooseSearchEntry: (entry: NoteSearchEntry, action: NoteMentionAction) => void,
) {
  event.preventDefault()
  event.stopPropagation()
  onChooseSearchEntry(entry, 'link')
}

export function handleNoteMentionSearchAisleClick(
  event: NoteMentionPointerEvent,
  aisleId: string,
  onSelectSearchAisle: (aisleId: string) => void,
) {
  event.preventDefault()
  event.stopPropagation()
  onSelectSearchAisle(aisleId)
}
