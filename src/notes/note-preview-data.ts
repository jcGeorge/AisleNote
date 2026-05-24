import type { AppState, NoteAisle, NoteLocation } from '../types/app'
import { getAisleMarkdown } from './note-markdown'
import { getLocationInfo, listNoteLocationsForBody, type NoteLocationInfo } from './note-locations'
import { type NoteContextReferencePayload, wouldCreateContextCycle } from './note-references'

export type ContextPreviewTitleButtonKind = 'domain' | 'space' | 'parent' | 'subtab'

export type ContextPreviewTitleButton = {
  kind: ContextPreviewTitleButtonKind
  label: string
}

export type ContextPreviewData = {
  targetInfo: NoteLocationInfo
  targetBody: AppState['noteBodies'][number] | null
  selectedAisles: NoteAisle[]
  recursiveBlocked: boolean
  previewText: string
  locationLabel: string
  titleButtons: ContextPreviewTitleButton[]
  status: 'ready' | 'blocked' | 'missing' | 'empty'
}

function getSourceLocation(appState: AppState, sourceNoteBodyId: string): NoteLocation | null {
  const locations = listNoteLocationsForBody(appState, sourceNoteBodyId)
  return locations.find((location) => location.domainId === appState.activeDomainId && location.spaceId === appState.activeSpaceId) ?? locations[0] ?? null
}

function getContextPreviewTitleButtons(
  targetInfo: NoteLocationInfo,
  target: NoteLocation,
  sourceLocation: NoteLocation | null,
): ContextPreviewTitleButton[] {
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab) return []

  const titleButtons: ContextPreviewTitleButton[] = []
  const sourceDomainId = sourceLocation?.domainId ?? ''
  const sourceSpaceId = sourceLocation?.spaceId ?? ''
  if (!sourceDomainId || target.domainId !== sourceDomainId) {
    titleButtons.push({ kind: 'domain', label: targetInfo.domain.name })
  }
  if (!sourceSpaceId || target.spaceId !== sourceSpaceId) {
    titleButtons.push({ kind: 'space', label: targetInfo.space.name })
  }
  titleButtons.push({ kind: 'parent', label: targetInfo.tab.title })
  titleButtons.push({ kind: 'subtab', label: targetInfo.subTab?.title ?? 'home' })
  return titleButtons
}

export function getContextPreviewDataFromState(
  appState: AppState,
  payload: NoteContextReferencePayload,
  sourceNoteBodyId: string,
): ContextPreviewData {
  const targetInfo = getLocationInfo(appState, payload.target)
  const sourceLocation = getSourceLocation(appState, sourceNoteBodyId)
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
    ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / home'}`
    : 'missing note'
  const titleButtons = getContextPreviewTitleButtons(targetInfo, payload.target, sourceLocation)
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
    titleButtons,
    status,
  }
}
