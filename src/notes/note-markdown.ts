import { createId, createTimestamp } from '../state/workspace'
import type { FrontmatterMeta, NoteAisle, NoteAisleBody, NoteBody, ResolvedNoteAisle, ResolvedNoteBody } from '../types/app'

export type IndependentNoteBodyCopy = {
  body: NoteBody
  aisleBodies: NoteAisleBody[]
}

export function getPrimaryAisle(body: NoteBody | null | undefined): NoteAisle | null {
  return body?.aisles[0] ?? null
}

export function getAisleBodyId(aisle: NoteAisle): string {
  return aisle.aisleBodyId
}

export function buildNoteAisleBodyMap(noteAisleBodies: NoteAisleBody[] | null | undefined): Map<string, NoteAisleBody> {
  return new Map((noteAisleBodies ?? []).map((body) => [body.id, body]))
}

export function getAisleMarkdown(
  aisle: NoteAisle,
  noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined,
): string {
  const bodyMap = noteAisleBodies instanceof Map ? noteAisleBodies : buildNoteAisleBodyMap(noteAisleBodies)
  return bodyMap.get(getAisleBodyId(aisle))?.markdown ?? ''
}

function cloneFrontmatterMeta(meta: FrontmatterMeta | undefined): FrontmatterMeta | undefined {
  if (!meta) return undefined
  return {
    ...meta,
    templateFieldOrigins: meta.templateFieldOrigins
      ? Object.fromEntries(Object.entries(meta.templateFieldOrigins).map(([key, origin]) => [key, { ...origin }]))
      : undefined,
    templateRemovedFieldIds: meta.templateRemovedFieldIds ? [...meta.templateRemovedFieldIds] : undefined,
    computedFields: meta.computedFields ? { ...meta.computedFields } : undefined,
  }
}

function cloneAisleBodyFrontmatter(source: NoteAisleBody | undefined): Pick<
  NoteAisleBody,
  'frontmatter' | 'frontmatterStatus' | 'frontmatterParseError' | 'frontmatterRaw' | 'frontmatterMeta'
> {
  return {
    frontmatter: source?.frontmatter && typeof source.frontmatter === 'object' ? { ...source.frontmatter } : source?.frontmatter ?? null,
    frontmatterStatus: source?.frontmatterStatus ?? (source?.frontmatter ? 'valid' : 'none'),
    frontmatterParseError: source?.frontmatterParseError,
    frontmatterRaw: source?.frontmatterRaw,
    frontmatterMeta: cloneFrontmatterMeta(source?.frontmatterMeta),
  }
}

export function resolveNoteAisles(
  aisles: NoteAisle[],
  noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined,
): ResolvedNoteAisle[] {
  const bodyMap = noteAisleBodies instanceof Map ? noteAisleBodies : buildNoteAisleBodyMap(noteAisleBodies)
  return aisles.map((aisle) => ({
    ...aisle,
    aisleBodyId: getAisleBodyId(aisle),
    markdown: getAisleMarkdown(aisle, bodyMap),
  }))
}

export function resolveNoteBody(
  body: NoteBody,
  noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined,
): ResolvedNoteBody {
  return {
    ...body,
    aisles: resolveNoteAisles(body.aisles, noteAisleBodies),
  }
}

export function getNoteBodyMarkdown(
  body: NoteBody | null | undefined,
  aisleId: string | null | undefined,
  noteAisleBodies?: NoteAisleBody[] | Map<string, NoteAisleBody> | null,
): string {
  if (!body) return ''
  const aisle = body.aisles.find((candidate) => candidate.id === aisleId) ?? getPrimaryAisle(body)
  return aisle ? getAisleMarkdown(aisle, noteAisleBodies) : ''
}

export function cloneNoteBodyAsIndependentCopy(
  body: NoteBody,
  noteAisleBodies?: NoteAisleBody[] | Map<string, NoteAisleBody> | null,
): IndependentNoteBodyCopy {
  const timestamp = createTimestamp()
  const fallbackAisleBodyId = createId()
  const aisles = body.aisles.length > 0 ? body.aisles : [{ id: createId(), aisleBodyId: fallbackAisleBodyId }]
  const bodyMap = noteAisleBodies instanceof Map ? noteAisleBodies : buildNoteAisleBodyMap(noteAisleBodies)
  const aisleBodies = aisles.map((aisle) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: getAisleMarkdown(aisle, noteAisleBodies),
    ...cloneAisleBodyFrontmatter(bodyMap.get(getAisleBodyId(aisle))),
  }))
  return {
    body: {
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles: aisleBodies.map((aisleBody) => ({
        id: createId(),
        aisleBodyId: aisleBody.id,
      })),
    },
    aisleBodies,
  }
}

export function cloneNoteBodyMetadataWithAisles(_baseBody: NoteBody, aisles: NoteAisle[]): NoteBody {
  const timestamp = createTimestamp()
  return {
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    aisles,
  }
}
