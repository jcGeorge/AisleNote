import type { AppState, NoteAisle, NoteAisleBody, NoteBody, ResolvedNoteAisle, ResolvedNoteBody } from '../types/app'
import { splitMarkdownFrontmatter } from '../frontmatter/frontmatter'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  extractMarkdownTags,
  materializeComputedFrontmatterTags,
  normalizeAisleTagsWithFrontmatter,
} from '../tags/tags.js'

export function buildNoteAisleBodyMap(noteAisleBodies: NoteAisleBody[] | undefined): Map<string, NoteAisleBody> {
  return new Map((noteAisleBodies ?? []).map((body) => [body.id, body]))
}

export function getAisleBodyId(noteBody: NoteBody | undefined | null, aisleId: string | undefined | null): string | null {
  if (!noteBody || !aisleId) return null
  return noteBody.aisles.find((aisle) => aisle.id === aisleId)?.aisleBodyId ?? null
}

export function getAisleMarkdown(noteAisleBodies: NoteAisleBody[] | undefined, aisleBodyId: string): string {
  return noteAisleBodies?.find((body) => body.id === aisleBodyId)?.markdown ?? ''
}

export function resolveNoteAisles(noteBody: NoteBody, noteAisleBodies: NoteAisleBody[] | undefined): ResolvedNoteAisle[] {
  const bodies = buildNoteAisleBodyMap(noteAisleBodies)
  return noteBody.aisles.map((aisle) => ({
    ...aisle,
    markdown: bodies.get(aisle.aisleBodyId)?.markdown ?? '',
  }))
}

export function resolveNoteBody(noteBody: NoteBody | undefined | null, noteAisleBodies: NoteAisleBody[] | undefined): ResolvedNoteBody | null {
  if (!noteBody) return null
  return {
    ...noteBody,
    aisles: resolveNoteAisles(noteBody, noteAisleBodies),
  }
}

export function getNoteBodyMarkdown(noteBody: NoteBody | undefined | null, noteAisleBodies: NoteAisleBody[] | undefined): string {
  if (!noteBody) return ''
  return resolveNoteAisles(noteBody, noteAisleBodies)
    .map((aisle) => aisle.markdown)
    .join('\n\n')
}

export function cloneAisles(aisles: NoteAisle[]): NoteAisle[] {
  return aisles.map((aisle) => ({ ...aisle }))
}

export function cloneNoteBodyMetadataWithAisles(noteBody: NoteBody, aisles: NoteAisle[] = noteBody.aisles): NoteBody {
  return {
    ...noteBody,
    aisles: cloneAisles(aisles),
  }
}

export function cloneNoteBodyAsIndependentCopy(
  noteBody: NoteBody,
  noteAisleBodies: NoteAisleBody[] | undefined,
  createId: () => string,
): { noteBody: NoteBody; aisleBodies: NoteAisleBody[] } {
  const bodies = buildNoteAisleBodyMap(noteAisleBodies)
  const timestamp = new Date().toISOString()
  const clonedAisleBodies: NoteAisleBody[] = []
  const aisles = noteBody.aisles.map((aisle) => {
    const nextAisleBodyId = createId()
    const sourceBody = bodies.get(aisle.aisleBodyId)
    clonedAisleBodies.push({
      ...(sourceBody ?? { markdown: '' }),
      id: nextAisleBodyId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return {
      id: createId(),
      aisleBodyId: nextAisleBodyId,
    }
  })
  return {
    noteBody: {
      ...noteBody,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles,
    },
    aisleBodies: clonedAisleBodies,
  }
}

function cloneFrontmatter(frontmatter: NoteAisleBody['frontmatter']): NoteAisleBody['frontmatter'] {
  return frontmatter && typeof frontmatter === 'object' ? { ...frontmatter } : frontmatter ?? null
}

function buildSyncedAisleBody(
  existing: NoteAisleBody | undefined,
  aisleBodyId: string,
  markdown: string,
  now: string,
): NoteAisleBody {
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

function aisleBodyContentEqual(left: NoteAisleBody | undefined, right: NoteAisleBody): boolean {
  return Boolean(left) &&
    left?.markdown === right.markdown &&
    left?.frontmatterStatus === right.frontmatterStatus &&
    left?.frontmatterParseError === right.frontmatterParseError &&
    left?.frontmatterRaw === right.frontmatterRaw &&
    JSON.stringify(left?.frontmatter ?? null) === JSON.stringify(right.frontmatter ?? null) &&
    JSON.stringify(left?.frontmatterMeta ?? null) === JSON.stringify(right.frontmatterMeta ?? null) &&
    JSON.stringify(left?.tags ?? []) === JSON.stringify(right.tags ?? [])
}

export function syncNoteAisleBodyMarkdownInState(state: AppState, aisleBodyId: string, markdown: string): AppState {
  if (!aisleBodyId) return state
  const timestamp = new Date().toISOString()
  const existingBodies = state.noteAisleBodies ?? []
  const existing = existingBodies.find((body) => body.id === aisleBodyId)
  const nextAisleBody = buildSyncedAisleBody(existing, aisleBodyId, markdown, timestamp)
  const changed = !aisleBodyContentEqual(existing, nextAisleBody)
  if (!changed) return state

  const exists = Boolean(existing)
  const noteAisleBodies = exists
    ? existingBodies.map((body) => (body.id === aisleBodyId ? nextAisleBody : body))
    : [...existingBodies, nextAisleBody]
  const noteBodies = state.noteBodies.map((body) =>
    body.aisles.some((aisle) => aisle.aisleBodyId === aisleBodyId)
      ? { ...body, updatedAt: timestamp }
      : body,
  )
  return {
    ...state,
    noteBodies,
    noteAisleBodies,
  }
}

export function syncNoteBodyAisleStructureInState(state: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState {
  const timestamp = new Date().toISOString()
  return {
    ...state,
    noteBodies: state.noteBodies.map((body) =>
      body.id === noteBodyId
        ? {
            ...body,
            updatedAt: timestamp,
            aisles: cloneAisles(aisles),
          }
        : body,
    ),
  }
}

export function syncNoteBodyAislesInState(state: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState {
  return syncNoteBodyAisleStructureInState(state, noteBodyId, aisles)
}

export function clearAisleFrontmatterInState(state: AppState, aisleBodyId: string): AppState {
  return {
    ...state,
    noteAisleBodies: (state.noteAisleBodies ?? []).map((body) =>
      body.id === aisleBodyId
        ? {
            ...body,
            frontmatter: null,
            frontmatterStatus: 'none' as const,
            frontmatterParseError: undefined,
            frontmatterRaw: undefined,
            frontmatterMeta: undefined,
          }
        : body,
    ),
  }
}

export function getAisleSignature(aisle: NoteAisle): string {
  return `${aisle.id}:${aisle.aisleBodyId}`
}

export function getAisleStructureSignature(aisles: NoteAisle[]): string {
  return aisles.map(getAisleSignature).join('|')
}
