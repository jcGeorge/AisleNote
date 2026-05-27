import type { AppState, NoteCursorSelection, NoteLocation, ResolvedNoteAisle } from '../types/app'
import { buildNoteCursorLocationKey } from './note-cursors'
import { getAisleMarkdown } from './note-markdown'
import { getLocationInfo, listNoteLocationsForBody, type NoteLocationInfo } from './note-locations'
import { type NotePreviewReferencePayload, wouldCreatePreviewCycle } from './note-references'

export type NotePreviewTitleButtonKind = 'domain' | 'space' | 'parent' | 'subtab'

export type NotePreviewTitleButton = {
  kind: NotePreviewTitleButtonKind
  label: string
}

export type NotePreviewData = {
  targetInfo: NoteLocationInfo
  targetBody: AppState['noteBodies'][number] | null
  selectedAisle: ResolvedNoteAisle | null
  recursiveBlocked: boolean
  previewText: string
  previewCursorSelection: NoteCursorSelection | null
  locationLabel: string
  titleButtons: NotePreviewTitleButton[]
  status: 'ready' | 'blocked' | 'missing' | 'empty'
}

function getSourceLocation(appState: AppState, sourceNoteBodyId: string): NoteLocation | null {
  const locations = listNoteLocationsForBody(appState, sourceNoteBodyId)
  return locations.find((location) => location.domainId === appState.activeDomainId && location.spaceId === appState.activeSpaceId) ?? locations[0] ?? null
}

function getNotePreviewTitleButtons(
  targetInfo: NoteLocationInfo,
  target: NoteLocation,
  sourceLocation: NoteLocation | null,
): NotePreviewTitleButton[] {
  if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab) return []

  const titleButtons: NotePreviewTitleButton[] = []
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

function getSelectedPreviewAisle(
  targetBody: AppState['noteBodies'][number] | null,
  payload: NotePreviewReferencePayload,
  appState: AppState,
) {
  if (!targetBody || targetBody.aisles.length === 0) return null
  if (payload.previewStart === 'last-position') {
    const savedLocation = appState.ui?.noteCursorLocations?.[buildNoteCursorLocationKey(payload.target)] ?? null
    const savedAisle = savedLocation?.activeAisleId
      ? targetBody.aisles.find((candidate) => candidate.id === savedLocation.activeAisleId)
      : null
    if (savedAisle) return savedAisle
  }
  const preferredAisleIds = [
    payload.heading?.aisleId,
    ...(payload.aisleIds ?? []),
  ].filter((aisleId): aisleId is string => typeof aisleId === 'string' && aisleId.length > 0)
  for (const aisleId of preferredAisleIds) {
    const aisle = targetBody.aisles.find((candidate) => candidate.id === aisleId)
    if (aisle) return aisle
  }
  return targetBody.aisles[0] ?? null
}

export function getNotePreviewDataFromState(
  appState: AppState,
  payload: NotePreviewReferencePayload,
  sourceNoteBodyId: string,
): NotePreviewData {
  const targetInfo = getLocationInfo(appState, payload.target)
  const sourceLocation = getSourceLocation(appState, sourceNoteBodyId)
  const targetBody = appState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
  const selectedPreviewAisle = getSelectedPreviewAisle(targetBody, payload, appState)
  const previewCursorLocation =
    payload.previewStart === 'last-position'
      ? appState.ui?.noteCursorLocations?.[buildNoteCursorLocationKey(payload.target)] ?? null
      : null
  const selectedAisle = selectedPreviewAisle
    ? {
        ...selectedPreviewAisle,
        markdown: getAisleMarkdown(selectedPreviewAisle, appState.noteAisleBodies),
      }
    : null
  const recursiveBlocked =
    !targetBody ||
    !targetInfo.noteBodyId ||
    targetInfo.noteBodyId === sourceNoteBodyId ||
    wouldCreatePreviewCycle(appState, targetInfo.noteBodyId, sourceNoteBodyId)
  const previewText = selectedAisle?.markdown.trim() ?? ''
  const locationLabel = targetInfo.domain && targetInfo.space && targetInfo.tab
    ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / home'}`
    : 'missing note'
  const titleButtons = getNotePreviewTitleButtons(targetInfo, payload.target, sourceLocation)
  const status = recursiveBlocked
    ? targetBody ? 'blocked' : 'missing'
    : previewText.trim().length > 0 ? 'ready' : 'empty'

  return {
    targetInfo,
    targetBody,
    selectedAisle,
    recursiveBlocked,
    previewText,
    previewCursorSelection:
      previewCursorLocation && selectedPreviewAisle ? previewCursorLocation.aisles[selectedPreviewAisle.id] ?? null : null,
    locationLabel,
    titleButtons,
    status,
  }
}
