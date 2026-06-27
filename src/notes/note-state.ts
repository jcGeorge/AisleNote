import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { splitMarkdownFrontmatter } from '../frontmatter/frontmatter'
import {
  extractMarkdownTags,
  materializeComputedFrontmatterTags,
  normalizeAisleTagsWithFrontmatter,
} from '../tags/tags.js'
import type { AppState, NoteAisle, NoteAisleBody, NoteCursorLocation, NoteCursorSelection, NoteLocation, ResolvedNoteAisle } from '../types/app'
import { getAisleBodyId } from './note-markdown'
import { noteCursorSelectionsEqual, pruneNoteCursorLocations } from './note-cursors'
import { createId, createTimestamp } from './note-content'

type NoteAisleInput = NoteAisle & { markdown?: string }

function buildAisleBodyMap(noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined) {
  return noteAisleBodies instanceof Map
    ? noteAisleBodies
    : new Map((noteAisleBodies ?? []).map((body) => [body.id, body]))
}

export const cloneAisles = (
  aisles: NoteAisleInput[],
  noteAisleBodies?: NoteAisleBody[] | Map<string, NoteAisleBody> | null,
): ResolvedNoteAisle[] => {
  const aisleBodyMap = buildAisleBodyMap(noteAisleBodies)
  return aisles.map((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    return {
    id: aisle.id,
      aisleBodyId,
      markdown: normalizeMarkdownForPersistence(aisle.markdown ?? aisleBodyMap.get(aisleBodyId)?.markdown ?? ''),
    }
  })
}

export const getAisleSignature = (
  aisles: NoteAisleInput[],
  noteAisleBodies?: NoteAisleBody[] | Map<string, NoteAisleBody> | null,
) => {
  const aisleBodyMap = buildAisleBodyMap(noteAisleBodies)
  return JSON.stringify(aisles.map((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    return [
      aisle.id,
      aisleBodyId,
      normalizeMarkdownForPersistence(aisle.markdown ?? aisleBodyMap.get(aisleBodyId)?.markdown ?? ''),
    ]
  }))
}

export const getAisleStructureSignature = (aisles: NoteAisleInput[]) =>
  JSON.stringify(aisles.map((aisle) => [aisle.id, getAisleBodyId(aisle)]))

const cloneFrontmatter = (frontmatter: NoteAisleBody['frontmatter']): NoteAisleBody['frontmatter'] =>
  frontmatter && typeof frontmatter === 'object' ? { ...frontmatter } : frontmatter ?? null

const buildSyncedAisleBody = (
  existing: NoteAisleBody | undefined,
  aisleBodyId: string,
  markdown: string,
  now: string,
): NoteAisleBody => {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const split = splitMarkdownFrontmatter(normalizedMarkdown)
  const base = {
    ...(existing ?? { id: aisleBodyId, createdAt: now }),
    id: aisleBodyId,
    updatedAt: now,
  }
  if (split.status === 'valid') {
    const tagState = normalizeAisleTagsWithFrontmatter({
      markdown: normalizeMarkdownForPersistence(split.markdown),
      frontmatter: split.frontmatter,
      frontmatterMeta: existing?.frontmatterMeta,
    })
    return {
      ...base,
      markdown: normalizeMarkdownForPersistence(tagState.markdown),
      tags: tagState.tags,
      frontmatter: tagState.frontmatter,
      frontmatterStatus: 'valid',
      frontmatterParseError: undefined,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
      frontmatterMeta: tagState.frontmatterMeta,
    }
  }
  if (split.status === 'invalid') {
    return {
      ...base,
      markdown: normalizedMarkdown,
      tags: extractMarkdownTags(normalizedMarkdown),
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: split.error,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  const tagState = normalizeAisleTagsWithFrontmatter({
    markdown: normalizedMarkdown,
    frontmatter: cloneFrontmatter(existing?.frontmatter),
    frontmatterMeta: existing?.frontmatterMeta,
  })
  return {
    ...base,
    markdown: normalizeMarkdownForPersistence(tagState.markdown),
    tags: tagState.tags,
    frontmatter: materializeComputedFrontmatterTags(tagState.frontmatter, tagState.frontmatterMeta, tagState.tags),
    frontmatterStatus: tagState.frontmatter ? 'valid' : existing?.frontmatterStatus ?? (existing?.frontmatter ? 'valid' : 'none'),
    frontmatterParseError: existing?.frontmatterParseError,
    frontmatterRaw: existing?.frontmatterRaw,
    frontmatterMeta: tagState.frontmatterMeta,
  }
}

const aisleBodyContentEqual = (left: NoteAisleBody | undefined, right: NoteAisleBody): boolean =>
  Boolean(left) &&
  left?.markdown === right.markdown &&
  left?.frontmatterStatus === right.frontmatterStatus &&
  left?.frontmatterParseError === right.frontmatterParseError &&
  left?.frontmatterRaw === right.frontmatterRaw &&
  JSON.stringify(left?.frontmatter ?? null) === JSON.stringify(right.frontmatter ?? null) &&
  JSON.stringify(left?.frontmatterMeta ?? null) === JSON.stringify(right.frontmatterMeta ?? null) &&
  JSON.stringify(left?.tags ?? []) === JSON.stringify(right.tags ?? [])

export const syncNoteBodyAislesInState = (previous: AppState, noteBodyId: string, aisles: NoteAisleInput[]): AppState => {
  const now = createTimestamp()
  const aisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const normalizedAisles = cloneAisles(
    aisles.length > 0 ? aisles : [{ id: createId(), aisleBodyId: createId(), markdown: '' }],
    aisleBodiesById,
  )
  const currentBody = previous.noteBodies.find((body) => body.id === noteBodyId)
  const aislesChanged = currentBody
    ? getAisleSignature(currentBody.aisles, aisleBodiesById) !== getAisleSignature(normalizedAisles)
    : true
  const updatedAisleBodyIds = new Set<string>()
  const nextAisleBodiesById = new Map<string, NoteAisleBody>(aisleBodiesById)
  const processedAisleBodyIds = new Set<string>()

  normalizedAisles.forEach((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    if (processedAisleBodyIds.has(aisleBodyId)) return
    processedAisleBodyIds.add(aisleBodyId)
    const existing = nextAisleBodiesById.get(aisleBodyId)
    const nextAisleBody = buildSyncedAisleBody(existing, aisleBodyId, aisle.markdown, now)
    if (aisleBodyContentEqual(existing, nextAisleBody)) return
    nextAisleBodiesById.set(aisleBodyId, nextAisleBody)
    updatedAisleBodyIds.add(aisleBodyId)
  })

  const normalizeAisleForBody = (aisle: NoteAisleInput): NoteAisle => {
    const aisleBodyId = getAisleBodyId(aisle)
    return { id: aisle.id, aisleBodyId }
  }

  const noteBodies = previous.noteBodies.map((body) => {
    const nextAisles = body.id === noteBodyId ? normalizedAisles : body.aisles
    const structuralAisles = nextAisles.map(normalizeAisleForBody)
    const containsUpdatedAisleBody = structuralAisles.some((aisle) => updatedAisleBodyIds.has(getAisleBodyId(aisle)))
    const bodyAislesChanged = getAisleStructureSignature(body.aisles) !== getAisleStructureSignature(structuralAisles)
    if (!bodyAislesChanged && !containsUpdatedAisleBody) return body
    return {
      ...body,
      updatedAt: containsUpdatedAisleBody || body.id === noteBodyId || aislesChanged ? now : body.updatedAt,
      aisles: structuralAisles,
    }
  })

  return {
    ...previous,
    noteBodies,
    noteAisleBodies: Array.from(nextAisleBodiesById.values()),
  }
}

export const syncNoteBodyAisleStructureInState = (previous: AppState, noteBodyId: string, aisles: NoteAisleInput[]): AppState => {
  const currentAisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const previousBody = previous.noteBodies.find((body) => body.id === noteBodyId)
  const previousAislesById = new Map((previousBody?.aisles ?? []).map((aisle) => [aisle.id, aisle]))
  const syntheticAisleBodies: NoteAisleBody[] = []
  const structuralAisles = aisles.map((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    if (!currentAisleBodiesById.has(aisleBodyId)) {
      const previousAisle = previousAislesById.get(aisle.id)
      const previousAisleBody = previousAisle ? currentAisleBodiesById.get(getAisleBodyId(previousAisle)) : undefined
      if (previousAisleBody) {
        const syntheticAisleBody = {
          ...previousAisleBody,
          id: aisleBodyId,
          markdown: normalizeMarkdownForPersistence(aisle.markdown ?? previousAisleBody.markdown),
          tags: extractMarkdownTags(normalizeMarkdownForPersistence(aisle.markdown ?? previousAisleBody.markdown)),
          frontmatter: cloneFrontmatter(previousAisleBody.frontmatter),
        }
        currentAisleBodiesById.set(aisleBodyId, syntheticAisleBody)
        syntheticAisleBodies.push(syntheticAisleBody)
      }
    }
    return {
      ...aisle,
      aisleBodyId,
      markdown: currentAisleBodiesById.get(aisleBodyId)?.markdown ?? normalizeMarkdownForPersistence(aisle.markdown ?? ''),
    }
  })
  return syncNoteBodyAislesInState(
    syntheticAisleBodies.length > 0
      ? { ...previous, noteAisleBodies: [...(previous.noteAisleBodies ?? []), ...syntheticAisleBodies] }
      : previous,
    noteBodyId,
    structuralAisles,
  )
}

export const clearAisleFrontmatterInState = (previous: AppState, aisleBodyIds: Iterable<string>): AppState => {
  const targetAisleBodyIds = new Set(Array.from(aisleBodyIds).filter((id) => id.trim().length > 0))
  if (targetAisleBodyIds.size <= 0) return previous

  let changed = false
  const noteAisleBodies = (previous.noteAisleBodies ?? []).map((body) => {
    if (!targetAisleBodyIds.has(body.id)) return body
    if (
      body.frontmatter === null &&
      body.frontmatterStatus === 'none' &&
      body.frontmatterParseError === undefined &&
      body.frontmatterRaw === undefined &&
      body.frontmatterMeta === undefined
    ) {
      return body
    }

    changed = true
    const {
      frontmatterMeta: _frontmatterMeta,
      frontmatterParseError: _frontmatterParseError,
      frontmatterRaw: _frontmatterRaw,
      ...bodyWithoutFrontmatterParseFields
    } = body
    return {
      ...bodyWithoutFrontmatterParseFields,
      frontmatter: null,
      frontmatterStatus: 'none' as const,
    }
  })

  return changed ? { ...previous, noteAisleBodies } : previous
}

export const syncNoteAisleBodyMarkdownInState = (
  previous: AppState,
  aisleBodyId: string,
  markdown: string,
): AppState => {
  if (!aisleBodyId) return previous
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const now = createTimestamp()
  const nextAisleBodiesById = new Map((previous.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const existing = nextAisleBodiesById.get(aisleBodyId)
  const nextAisleBody = buildSyncedAisleBody(existing, aisleBodyId, normalizedMarkdown, now)
  nextAisleBodiesById.set(aisleBodyId, nextAisleBody)

  let changed = !aisleBodyContentEqual(existing, nextAisleBody)
  const noteBodies = previous.noteBodies.map((body) => {
    let bodyChanged = false
    let containsTargetAisleBody = false
    const aisles = body.aisles.map((aisle) => {
      if (getAisleBodyId(aisle) !== aisleBodyId) return aisle
      containsTargetAisleBody = true
      if (aisle.aisleBodyId === aisleBodyId) return aisle
      bodyChanged = true
      return { ...aisle, aisleBodyId }
    })
    if (!bodyChanged && !(containsTargetAisleBody && changed)) return body
    changed = true
    return {
      ...body,
      updatedAt: now,
      aisles,
    }
  })

  return changed
    ? {
        ...previous,
        noteBodies,
        noteAisleBodies: Array.from(nextAisleBodiesById.values()),
      }
    : previous
}

export const applyNoteLocationToState = (previous: AppState, location: NoteLocation): AppState => {
  if (!location.noteId || previous.vault.activeNoteId === location.noteId) return previous
  return {
    ...previous,
    vault: {
      ...previous.vault,
      activeNoteId: location.noteId,
    },
  }
}

export const updateCursorLocationInState = (
  previous: AppState,
  noteLocationKey: string,
  aisleId: string,
  selection: NoteCursorSelection | null,
  now = Date.now(),
): AppState => {
  if (!noteLocationKey || !aisleId) return previous
  const current = previous.ui.noteCursorLocations[noteLocationKey]
  const currentSelection = current?.aisles[aisleId] ?? null
  const nextSelection = selection ? { ...selection, updatedAt: now } : currentSelection
  const nextAisles = nextSelection ? { ...(current?.aisles ?? {}), [aisleId]: nextSelection } : current?.aisles ?? {}
  const nextLocation: NoteCursorLocation = {
    activeAisleId: aisleId,
    aisles: nextAisles,
    updatedAt: now,
  }

  if (
    current &&
    current.activeAisleId === nextLocation.activeAisleId &&
    noteCursorSelectionsEqual(currentSelection, nextSelection)
  ) {
    return previous
  }

  return {
    ...previous,
    ui: {
      ...previous.ui,
      noteCursorLocations: pruneNoteCursorLocations({
        ...previous.ui.noteCursorLocations,
        [noteLocationKey]: nextLocation,
      }),
    },
  }
}

export const applyCursorLocationSnapshot = (
  previous: AppState,
  locationKey: string,
  cursorLocation: NoteCursorLocation | null,
): AppState => {
  if (!cursorLocation) return previous
  return {
    ...previous,
    ui: {
      ...previous.ui,
      noteCursorLocations: pruneNoteCursorLocations({
        ...previous.ui.noteCursorLocations,
        [locationKey]: cursorLocation,
      }),
    },
  }
}
