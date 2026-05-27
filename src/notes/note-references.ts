import type { AppState, NoteHeadingAnchor, NoteLocation, NoteNavigationTarget, NotePreviewStart } from '../types/app'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  WIKI_NOTE_REFERENCE_RE,
  buildInternalNoteLinkToken as buildInternalNoteLinkTokenCore,
  buildPreviewToken as buildPreviewTokenCore,
  getPreviewReferenceTokenLengthAt as getPreviewReferenceTokenLengthAtCore,
  getWikiReferenceDisplayText as getWikiReferenceDisplayTextCore,
  normalizePreviewReferenceTokensForMarkdown as normalizePreviewReferenceTokensForMarkdownCore,
  parsePreviewToken as parsePreviewTokenCore,
  parsePreviewReferences as parsePreviewReferencesCore,
  parseWikiReferenceToken as parseWikiReferenceTokenCore,
  resolveWikiReferenceToken as resolveWikiReferenceTokenCore,
  replacePreviewReferences,
} from '../markdown/note-context-tokens.js'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import { syncNoteBodyAislesInState } from './note-state'

export { NOTE_PREVIEW_REFERENCE_RE, WIKI_NOTE_REFERENCE_RE }

export type NotePreviewReferencePayload = {
  id: string
  target: NoteLocation
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  previewStart?: NotePreviewStart
}

export type NoteContextReferencePayload = NotePreviewReferencePayload

export type ParsedNotePreviewReference = {
  token: string
  payload: NotePreviewReferencePayload
}

export type ParsedNoteContextReference = ParsedNotePreviewReference

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
  payload: NotePreviewReferencePayload
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
  startAt?: NoteNavigationTarget['startAt']
  from: number
  to: number
  occurrence: number
}

export const INTERNAL_NOTE_LINK_MARKDOWN_RE = WIKI_NOTE_REFERENCE_RE

const MAX_PREVIEW_RENDER_DEPTH = 3

export function parsePreviewReferences(markdown: string, appState: AppState): ParsedNotePreviewReference[] {
  return parsePreviewReferencesCore(markdown, appState) as ParsedNotePreviewReference[]
}

export function parsePreviewToken(token: string, appState: AppState): NotePreviewReferencePayload | null {
  return parsePreviewTokenCore(token, appState) as NotePreviewReferencePayload | null
}

export function buildPreviewToken(appState: AppState, payload: NotePreviewReferencePayload): string {
  return buildPreviewTokenCore(appState, payload)
}

export function getPreviewReferenceTokenLengthAt(text: string, offset: number): number {
  return getPreviewReferenceTokenLengthAtCore(text, offset)
}

export function normalizePreviewReferenceTokensForMarkdown(markdown: string, appState: AppState): string {
  return normalizePreviewReferenceTokensForMarkdownCore(markdown, appState)
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

export function replacePreviewTokenById(markdown: string, appState: AppState, tokenId: string, nextToken: string): string {
  return replacePreviewReferences(markdown, appState, (token: string, payload: NotePreviewReferencePayload) =>
    payload.id === tokenId ? nextToken : token,
  )
}

export function removePreviewTokenById(markdown: string, appState: AppState, tokenId: string): string {
  return replacePreviewReferences(markdown, appState, (token: string, payload: NotePreviewReferencePayload) =>
    payload.id === tokenId ? '' : token,
  )
}

export function removePreviewReferencesForNoteLocationsFromMarkdown(
  markdown: string,
  appState: AppState,
  deletedLocations: readonly NoteLocation[],
): string {
  if (deletedLocations.length === 0) return markdown
  const deletedLocationKeys = new Set(deletedLocations.map((location) => buildNoteLocationKey(location)))
  return replacePreviewReferences(markdown, appState, (token: string, payload: NotePreviewReferencePayload) =>
    deletedLocationKeys.has(buildNoteLocationKey(payload.target)) ? '' : token,
  )
}

export function removeNoteReferencesForNoteLocationsFromMarkdown(
  markdown: string,
  sourceState: AppState,
  deletedLocations: readonly NoteLocation[],
  resolverState: AppState = sourceState,
): string {
  if (deletedLocations.length === 0) return markdown
  const deletedLocationKeys = new Set(deletedLocations.map((location) => buildNoteLocationKey(location)))
  return String(markdown ?? '').replace(WIKI_NOTE_REFERENCE_RE, (token) => {
    const reference = resolveWikiReferenceToken(resolverState, token)
    return reference && deletedLocationKeys.has(buildNoteLocationKey(reference.payload.target)) ? '' : token
  })
}

export function removePreviewReferencesForNoteLocationsFromAppState(
  sourceState: AppState,
  deletedLocations: readonly NoteLocation[],
): AppState {
  if (deletedLocations.length === 0) return sourceState

  let nextState = sourceState
  for (const body of sourceState.noteBodies) {
    let bodyChanged = false
    const aisles = body.aisles.map((aisle) => {
      const currentMarkdown = getAisleMarkdown(aisle, nextState.noteAisleBodies)
      const markdown = removePreviewReferencesForNoteLocationsFromMarkdown(currentMarkdown, nextState, deletedLocations)
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

export function removeNoteReferencesForNoteLocationsFromAppState(
  sourceState: AppState,
  deletedLocations: readonly NoteLocation[],
  resolverState: AppState = sourceState,
): AppState {
  if (deletedLocations.length === 0) return sourceState

  let nextState = sourceState
  for (const body of sourceState.noteBodies) {
    let bodyChanged = false
    const aisles = body.aisles.map((aisle) => {
      const currentMarkdown = getAisleMarkdown(aisle, nextState.noteAisleBodies)
      const markdown = removeNoteReferencesForNoteLocationsFromMarkdown(
        currentMarkdown,
        nextState,
        deletedLocations,
        resolverState,
      )
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

export function normalizePreviewStartAnchor(payload: Pick<NotePreviewReferencePayload, 'heading' | 'previewStart'>): string {
  if (payload.heading?.aisleId && payload.heading.headingKey) return `${payload.heading.aisleId}::${payload.heading.headingKey}`
  if (payload.previewStart === 'last-position') return '__last_position__'
  return '__top__'
}

export function getPreviewReferenceSignature(sourceState: AppState, payload: NotePreviewReferencePayload): string {
  const targetBodyId = getLocationInfo(sourceState, payload.target).noteBodyId
  const aisleSelection = payload.previewStart === 'last-position' ? '__last_position__' : normalizeAisleSelection(payload.aisleIds)
  return `${targetBodyId || buildNoteLocationKey(payload.target)}::${aisleSelection}::${normalizePreviewStartAnchor(payload)}`
}

export function wouldCreatePreviewCycle(
  sourceState: AppState,
  targetNoteBodyId: string,
  blockedNoteBodyId: string,
  visited = new Set<string>(),
): boolean {
  if (!targetNoteBodyId || !blockedNoteBodyId) return false
  if (targetNoteBodyId === blockedNoteBodyId) return true
  if (visited.has(targetNoteBodyId)) return false
  if (visited.size >= MAX_PREVIEW_RENDER_DEPTH * 8) return true

  visited.add(targetNoteBodyId)
  const targetBody = sourceState.noteBodies.find((body) => body.id === targetNoteBodyId)
  if (!targetBody) return false

  for (const aisle of targetBody.aisles) {
    for (const reference of parsePreviewReferences(getAisleMarkdown(aisle, sourceState.noteAisleBodies), sourceState)) {
      const childBodyId = getLocationInfo(sourceState, reference.payload.target).noteBodyId
      if (wouldCreatePreviewCycle(sourceState, childBodyId, blockedNoteBodyId, visited)) return true
    }
  }
  return false
}

export const NOTE_CONTEXT_REFERENCE_RE = NOTE_PREVIEW_REFERENCE_RE
export const parseContextReferences = parsePreviewReferences
export const parseContextToken = parsePreviewToken
export const buildContextToken = buildPreviewToken
export const getContextReferenceTokenLengthAt = getPreviewReferenceTokenLengthAt
export const normalizeContextReferenceTokensForMarkdown = normalizePreviewReferenceTokensForMarkdown
export const replaceContextTokenById = replacePreviewTokenById
export const removeContextTokenById = removePreviewTokenById
export const removeContextReferencesForNoteLocationsFromMarkdown = removePreviewReferencesForNoteLocationsFromMarkdown
export const removeContextReferencesForNoteLocationsFromAppState = removePreviewReferencesForNoteLocationsFromAppState
export const getContextReferenceSignature = getPreviewReferenceSignature
export const wouldCreateContextCycle = wouldCreatePreviewCycle
