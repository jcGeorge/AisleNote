import type { AppState, NoteAisle } from '../types/app'
import { getAisleMarkdown } from './note-markdown'
import { getLocationInfo, type NoteLocationInfo } from './note-locations'
import { type NoteContextReferencePayload, wouldCreateContextCycle } from './note-references'

export type ContextPreviewData = {
  targetInfo: NoteLocationInfo
  targetBody: AppState['noteBodies'][number] | null
  selectedAisles: NoteAisle[]
  recursiveBlocked: boolean
  previewText: string
  locationLabel: string
  displayTitle: string
  status: 'ready' | 'blocked' | 'missing' | 'empty'
}

export function getContextPreviewDataFromState(
  appState: AppState,
  payload: NoteContextReferencePayload,
  sourceNoteBodyId: string,
): ContextPreviewData {
  const targetInfo = getLocationInfo(appState, payload.target)
  const targetBody = appState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
  const payloadAisleIds = payload.heading?.aisleId ? [payload.heading.aisleId] : payload.aisleIds
  const selectedAisleCandidates =
    targetBody && payloadAisleIds && payloadAisleIds.length > 0
      ? targetBody.aisles.filter((aisle) => payloadAisleIds.includes(aisle.id))
      : targetBody?.aisles ?? []
  const selectedAisles = selectedAisleCandidates.length > 0 || !payload.heading ? selectedAisleCandidates : targetBody?.aisles ?? []
  const selectedAislesWithMarkdown = selectedAisles.map((aisle) => ({
    ...aisle,
    markdown: getAisleMarkdown(aisle, appState.noteAisleBodies),
  }))
  const recursiveBlocked =
    !targetBody ||
    !targetInfo.noteBodyId ||
    targetInfo.noteBodyId === sourceNoteBodyId ||
    wouldCreateContextCycle(appState, targetInfo.noteBodyId, sourceNoteBodyId)
  const previewText = selectedAislesWithMarkdown
    .map((aisle) => aisle.markdown.trim())
    .filter(Boolean)
    .join('\n\n')
  const locationLabel = targetInfo.domain && targetInfo.space && targetInfo.tab
    ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / index'}`
    : 'missing note'
  const displayTitle = targetInfo.tab
    ? `${targetInfo.tab.title} > ${targetInfo.subTab ? targetInfo.subTab.title : 'index'}`
    : targetInfo.title
  const status = recursiveBlocked
    ? targetBody ? 'blocked' : 'missing'
    : previewText.trim().length > 0 ? 'ready' : 'empty'

  return {
    targetInfo,
    targetBody,
    selectedAisles: selectedAislesWithMarkdown,
    recursiveBlocked,
    previewText,
    locationLabel,
    displayTitle,
    status,
  }
}
