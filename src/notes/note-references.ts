import type { AppState, NoteHeadingAnchor, NoteLocation, NoteNavigationTarget } from '../types/app'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'
import { getAisleMarkdown } from './note-markdown'
import { syncNoteBodyAislesInState } from './note-state'

export type NoteContextReferencePayload = {
  id: string
  target: NoteLocation
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
}

export type ParsedNoteContextReference = {
  token: string
  payload: NoteContextReferencePayload
}

export type InternalNoteLinkHit = {
  label: string
  href: string
  target: NoteLocation
  heading?: NoteHeadingAnchor
  from: number
  to: number
  occurrence: number
}

export const NOTE_CONTEXT_REFERENCE_RE = /\{\{tabs-context:([A-Za-z0-9_-]+)\}\}/g
export const INTERNAL_NOTE_LINK_MARKDOWN_RE = /!?\[([^\]\n]+)\]\(([^)\n]+)\)/g
export const INTERNAL_NOTE_LINK_HASH_PREFIX = '#tabs-note'

const INTERNAL_NOTE_LINK_SCHEME = 'tabs://note'
const MAX_CONTEXT_RENDER_DEPTH = 3

export function encodeContextPayload(payload: NoteContextReferencePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeContextPayload(encoded: string): NoteContextReferencePayload | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<NoteContextReferencePayload>
    if (!parsed || typeof parsed.id !== 'string' || !parsed.target) return null
    const target = parsed.target as Partial<NoteLocation>
    if (
      typeof target.domainId !== 'string' ||
      typeof target.spaceId !== 'string' ||
      typeof target.tabId !== 'string' ||
      (typeof target.subTabId !== 'string' && target.subTabId !== null)
    ) {
      return null
    }
    const heading = parsed.heading as Partial<NoteHeadingAnchor> | undefined
    const normalizedHeading =
      heading && typeof heading.aisleId === 'string' && typeof heading.headingKey === 'string'
        ? { aisleId: heading.aisleId, headingKey: heading.headingKey }
        : undefined
    return {
      id: parsed.id,
      target: {
        domainId: target.domainId,
        spaceId: target.spaceId,
        tabId: target.tabId,
        subTabId: target.subTabId,
      },
      aisleIds: Array.isArray(parsed.aisleIds) ? parsed.aisleIds.filter((aisleId): aisleId is string => typeof aisleId === 'string') : undefined,
      ...(normalizedHeading ? { heading: normalizedHeading } : {}),
    }
  } catch {
    return null
  }
}

export function parseContextReferences(markdown: string): ParsedNoteContextReference[] {
  const references: ParsedNoteContextReference[] = []
  for (const match of markdown.matchAll(NOTE_CONTEXT_REFERENCE_RE)) {
    const payload = decodeContextPayload(match[1])
    if (!payload) continue
    references.push({ token: match[0], payload })
  }
  return references
}

export function buildContextToken(payload: NoteContextReferencePayload): string {
  return `{{tabs-context:${encodeContextPayload(payload)}}}`
}

export function replaceContextTokenById(markdown: string, tokenId: string, nextToken: string): string {
  return markdown.replace(NOTE_CONTEXT_REFERENCE_RE, (token, encoded) => {
    const payload = decodeContextPayload(encoded)
    return payload?.id === tokenId ? nextToken : token
  })
}

export function removeContextTokenById(markdown: string, tokenId: string): string {
  return markdown.replace(NOTE_CONTEXT_REFERENCE_RE, (token, encoded) => {
    const payload = decodeContextPayload(encoded)
    return payload?.id === tokenId ? '' : token
  })
}

export function removeContextReferencesForNoteLocationsFromMarkdown(
  markdown: string,
  deletedLocations: readonly NoteLocation[],
): string {
  if (deletedLocations.length === 0) return markdown
  const deletedLocationKeys = new Set(deletedLocations.map((location) => buildNoteLocationKey(location)))
  return markdown.replace(NOTE_CONTEXT_REFERENCE_RE, (token, encoded) => {
    const payload = decodeContextPayload(encoded)
    return payload && deletedLocationKeys.has(buildNoteLocationKey(payload.target)) ? '' : token
  })
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
      const markdown = removeContextReferencesForNoteLocationsFromMarkdown(currentMarkdown, deletedLocations)
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

export function buildInternalNoteUrl(noteBodyId: string, target: NoteNavigationTarget): string {
  const params = new URLSearchParams({
    domainId: target.domainId,
    spaceId: target.spaceId,
    tabId: target.tabId,
  })
  if (target.subTabId) params.set('subTabId', target.subTabId)
  if (target.heading?.aisleId && target.heading.headingKey) {
    params.set('aisleId', target.heading.aisleId)
    params.set('headingKey', target.heading.headingKey)
  }
  return `${INTERNAL_NOTE_LINK_HASH_PREFIX}/${encodeURIComponent(noteBodyId)}?${params.toString()}`
}

function parseNoteReferenceParams(params: URLSearchParams): NoteNavigationTarget | null {
  const domainId = params.get('domainId')
  const spaceId = params.get('spaceId')
  const tabId = params.get('tabId')
  if (!domainId || !spaceId || !tabId) return null
  const aisleId = params.get('aisleId')
  const headingKey = params.get('headingKey')
  const target: NoteNavigationTarget = {
    domainId,
    spaceId,
    tabId,
    subTabId: params.get('subTabId'),
  }
  if (aisleId && headingKey) target.heading = { aisleId, headingKey }
  return target
}

export function parseInternalNoteReferenceUrl(rawUrl: string): NoteNavigationTarget | null {
  const cleanedUrl = rawUrl.trim().replace(/&amp;/g, '&')
  if (!cleanedUrl) return null
  const hashIndex = cleanedUrl.indexOf(INTERNAL_NOTE_LINK_HASH_PREFIX)
  if (hashIndex >= 0) {
    const hash = cleanedUrl.slice(hashIndex)
    const queryIndex = hash.indexOf('?')
    if (queryIndex < 0) return null
    return parseNoteReferenceParams(new URLSearchParams(hash.slice(queryIndex + 1)))
  }

  try {
    const url = new URL(cleanedUrl)
    if (url.hash.startsWith(INTERNAL_NOTE_LINK_HASH_PREFIX)) {
      const queryIndex = url.hash.indexOf('?')
      if (queryIndex < 0) return null
      return parseNoteReferenceParams(new URLSearchParams(url.hash.slice(queryIndex + 1)))
    }
    if (`${url.protocol}//${url.hostname}` !== INTERNAL_NOTE_LINK_SCHEME) return null
    return parseNoteReferenceParams(url.searchParams)
  } catch {
    return null
  }
}

export function parseInternalNoteUrl(rawUrl: string): NoteLocation | null {
  const reference = parseInternalNoteReferenceUrl(rawUrl)
  return reference
    ? {
        domainId: reference.domainId,
        spaceId: reference.spaceId,
        tabId: reference.tabId,
        subTabId: reference.subTabId,
      }
    : null
}

export function getMarkdownLinkLabel(label: string): string {
  return label.replace(/\\([\\[\]])/g, '$1').trim() || 'linked note'
}

export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

export function replaceInternalNoteLinkByOccurrence(markdown: string, hit: InternalNoteLinkHit, nextSyntax: string): string {
  let occurrence = 0
  return markdown.replace(INTERNAL_NOTE_LINK_MARKDOWN_RE, (source, _label, href) => {
    if (source.startsWith('!') || !parseInternalNoteUrl(href)) return source
    const shouldReplace = occurrence === hit.occurrence && href === hit.href
    occurrence += 1
    return shouldReplace ? nextSyntax : source
  })
}

export function normalizeAisleSelection(aisleIds: string[] | undefined): string {
  return aisleIds && aisleIds.length > 0 ? [...aisleIds].sort().join(',') : '__all__'
}

export function normalizeHeadingAnchor(heading: NoteHeadingAnchor | undefined): string {
  return heading?.aisleId && heading.headingKey ? `${heading.aisleId}::${heading.headingKey}` : '__top__'
}

export function getContextReferenceSignature(sourceState: AppState, payload: NoteContextReferencePayload): string {
  const targetBodyId = getLocationInfo(sourceState, payload.target).noteBodyId
  return `${targetBodyId || buildNoteLocationKey(payload.target)}::${normalizeAisleSelection(payload.aisleIds)}::${normalizeHeadingAnchor(payload.heading)}`
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
    for (const reference of parseContextReferences(getAisleMarkdown(aisle, sourceState.noteAisleBodies))) {
      const childBodyId = getLocationInfo(sourceState, reference.payload.target).noteBodyId
      if (wouldCreateContextCycle(sourceState, childBodyId, blockedNoteBodyId, visited)) return true
    }
  }
  return false
}
