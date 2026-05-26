import type { AppState, NoteHeadingAnchor, NoteLocation, NoteNavigationTarget, NotePreviewStart } from '../types/app'
import {
  NOTE_CONTEXT_REFERENCE_RE,
  WIKI_NOTE_REFERENCE_RE,
  buildInternalNoteLinkToken as buildInternalNoteLinkTokenCore,
  buildContextToken as buildContextTokenCore,
  getContextReferenceTokenLengthAt as getContextReferenceTokenLengthAtCore,
  getWikiReferenceDisplayText as getWikiReferenceDisplayTextCore,
  normalizeContextReferenceTokensForMarkdown as normalizeContextReferenceTokensForMarkdownCore,
  parseContextToken as parseContextTokenCore,
  parseContextReferences as parseContextReferencesCore,
  parseWikiReferenceToken as parseWikiReferenceTokenCore,
  resolveWikiReferenceToken as resolveWikiReferenceTokenCore,
  replaceContextReferences,
} from '../markdown/note-context-tokens.js'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import { syncNoteBodyAislesInState } from './note-state'

export { NOTE_CONTEXT_REFERENCE_RE, WIKI_NOTE_REFERENCE_RE }

export type NoteContextReferencePayload = {
  id: string
  target: NoteLocation
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  previewStart?: NotePreviewStart
}

export type ParsedNoteContextReference = {
  token: string
  payload: NoteContextReferencePayload
}

export type ParsedWikiNoteReferenceToken = {
  token: string
  embed: boolean
  target: string
  noteHandle: string
  suffixHandle: string
  alias: string
}

export type ResolvedWikiNoteReference = {
  token: string
  parsed: ParsedWikiNoteReferenceToken
  payload: NoteContextReferencePayload
  target: NoteNavigationTarget
  label: string
  canonicalTarget: string
  canonicalToken: string
}

export type InternalNoteLinkHit = {
  label: string
  href: string
  target: NoteLocation
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  from: number
  to: number
  occurrence: number
}

export const INTERNAL_NOTE_LINK_MARKDOWN_RE = WIKI_NOTE_REFERENCE_RE

const MAX_CONTEXT_RENDER_DEPTH = 3

export function parseContextReferences(markdown: string, appState: AppState): ParsedNoteContextReference[] {
  return parseContextReferencesCore(markdown, appState) as ParsedNoteContextReference[]
}

export function parseContextToken(token: string, appState: AppState): NoteContextReferencePayload | null {
  return parseContextTokenCore(token, appState) as NoteContextReferencePayload | null
}

export function buildContextToken(appState: AppState, payload: NoteContextReferencePayload): string {
  return buildContextTokenCore(appState, payload)
}

export function getContextReferenceTokenLengthAt(text: string, offset: number): number {
  return getContextReferenceTokenLengthAtCore(text, offset)
}

export function normalizeContextReferenceTokensForMarkdown(markdown: string, appState: AppState): string {
  return normalizeContextReferenceTokensForMarkdownCore(markdown, appState)
}

export function parseWikiReferenceToken(token: string): ParsedWikiNoteReferenceToken | null {
  return parseWikiReferenceTokenCore(token) as ParsedWikiNoteReferenceToken | null
}

export function getWikiReferenceDisplayText(token: string): string {
  return getWikiReferenceDisplayTextCore(token)
}

export function resolveWikiReferenceToken(appState: AppState, token: string): ResolvedWikiNoteReference | null {
  return resolveWikiReferenceTokenCore(appState, token) as ResolvedWikiNoteReference | null
}

export function buildInternalNoteLinkToken(appState: AppState, target: NoteNavigationTarget, alias = ''): string {
  return buildInternalNoteLinkTokenCore(appState, target, alias)
}

export function replaceContextTokenById(markdown: string, appState: AppState, tokenId: string, nextToken: string): string {
  return replaceContextReferences(markdown, appState, (token: string, payload: NoteContextReferencePayload) =>
    payload.id === tokenId ? nextToken : token,
  )
}

export function removeContextTokenById(markdown: string, appState: AppState, tokenId: string): string {
  return replaceContextReferences(markdown, appState, (token: string, payload: NoteContextReferencePayload) =>
    payload.id === tokenId ? '' : token,
  )
}

export function removeContextReferencesForNoteLocationsFromMarkdown(
  markdown: string,
  appState: AppState,
  deletedLocations: readonly NoteLocation[],
): string {
  if (deletedLocations.length === 0) return markdown
  const deletedLocationKeys = new Set(deletedLocations.map((location) => buildNoteLocationKey(location)))
  return replaceContextReferences(markdown, appState, (token: string, payload: NoteContextReferencePayload) =>
    deletedLocationKeys.has(buildNoteLocationKey(payload.target)) ? '' : token,
  )
}

export function removeContextReferencesForNoteLocationsFromAppState(
  sourceState: AppState,
  deletedLocations: readonly NoteLocation[],
): AppState {
  if (deletedLocations.length === 0) return sourceState

  let nextState = sourceState
  for (const body of sourceState.noteBodies) {
    let bodyChanged = false
    const aisles = body.aisles.map((aisle) => {
      const currentMarkdown = getAisleMarkdown(aisle, nextState.noteAisleBodies)
      const markdown = removeContextReferencesForNoteLocationsFromMarkdown(currentMarkdown, nextState, deletedLocations)
      if (markdown === currentMarkdown) return aisle
      bodyChanged = true
      return { ...aisle, markdown }
    })

    if (bodyChanged) {
      nextState = syncNoteBodyAislesInState(nextState, body.id, aisles)
    }
  }

  return nextState
}

export function getMarkdownLinkLabel(label: string): string {
  return label.replace(/\\([\\[\]])/g, '$1').trim() || 'linked note'
}

export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

export function replaceInternalNoteLinkByOccurrence(markdown: string, hit: InternalNoteLinkHit, nextSyntax: string): string {
  let occurrence = 0
  return markdown.replace(WIKI_NOTE_REFERENCE_RE, (source) => {
    if (source.startsWith('!')) return source
    const shouldReplace = occurrence === hit.occurrence && source === hit.href
    occurrence += 1
    return shouldReplace ? nextSyntax : source
  })
}

export function normalizeAisleSelection(aisleIds: string[] | undefined): string {
  return aisleIds && aisleIds.length > 0 ? [...aisleIds].sort().join(',') : '__all__'
}

export function normalizePreviewStartAnchor(payload: Pick<NoteContextReferencePayload, 'heading' | 'previewStart'>): string {
  if (payload.heading?.aisleId && payload.heading.headingKey) return `${payload.heading.aisleId}::${payload.heading.headingKey}`
  if (payload.previewStart === 'last-position') return '__last_position__'
  return '__top__'
}

export function getContextReferenceSignature(sourceState: AppState, payload: NoteContextReferencePayload): string {
  const targetBodyId = getLocationInfo(sourceState, payload.target).noteBodyId
  const aisleSelection = payload.previewStart === 'last-position' ? '__last_position__' : normalizeAisleSelection(payload.aisleIds)
  return `${targetBodyId || buildNoteLocationKey(payload.target)}::${aisleSelection}::${normalizePreviewStartAnchor(payload)}`
}

export function wouldCreateContextCycle(
  sourceState: AppState,
  targetNoteBodyId: string,
  blockedNoteBodyId: string,
  visited = new Set<string>(),
): boolean {
  if (!targetNoteBodyId || !blockedNoteBodyId) return false
  if (targetNoteBodyId === blockedNoteBodyId) return true
  if (visited.has(targetNoteBodyId)) return false
  if (visited.size >= MAX_CONTEXT_RENDER_DEPTH * 8) return true

  visited.add(targetNoteBodyId)
  const targetBody = sourceState.noteBodies.find((body) => body.id === targetNoteBodyId)
  if (!targetBody) return false

  for (const aisle of targetBody.aisles) {
    for (const reference of parseContextReferences(getAisleMarkdown(aisle, sourceState.noteAisleBodies), sourceState)) {
      const childBodyId = getLocationInfo(sourceState, reference.payload.target).noteBodyId
      if (wouldCreateContextCycle(sourceState, childBodyId, blockedNoteBodyId, visited)) return true
    }
  }
  return false
}
