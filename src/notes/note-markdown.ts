import { createId, createTimestamp } from '../state/workspace'
import type { NoteAisle, NoteAisleBody, NoteBody } from '../types/app'

export type IndependentNoteBodyCopy = {
  body: NoteBody
  aisleBodies: NoteAisleBody[]
}

export function getPrimaryAisle(body: NoteBody | null | undefined): NoteAisle | null {
  return body?.aisles[0] ?? null
}

export function getAisleBodyId(aisle: NoteAisle): string {
  return aisle.aisleBodyId || aisle.id
}

export function buildNoteAisleBodyMap(noteAisleBodies: NoteAisleBody[] | null | undefined): Map<string, NoteAisleBody> {
  return new Map((noteAisleBodies ?? []).map((body) => [body.id, body]))
}

export function getAisleMarkdown(
  aisle: NoteAisle,
  noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined,
): string {
  const bodyMap = noteAisleBodies instanceof Map ? noteAisleBodies : buildNoteAisleBodyMap(noteAisleBodies)
  return bodyMap.get(getAisleBodyId(aisle))?.markdown ?? aisle.markdown
}

export function resolveNoteAisles(
  aisles: NoteAisle[],
  noteAisleBodies: NoteAisleBody[] | Map<string, NoteAisleBody> | null | undefined,
): NoteAisle[] {
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
): NoteBody {
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
  const aisles = body.aisles.length > 0 ? body.aisles : [{ id: createId(), markdown: '' }]
  const aisleBodies = aisles.map((aisle) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: getAisleMarkdown(aisle, noteAisleBodies),
  }))
  return {
    body: {
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      frontmatter: body.frontmatter ? { ...body.frontmatter } : null,
      frontmatterTemplateId: body.frontmatterTemplateId,
      frontmatterTemplateDerived: body.frontmatterTemplateDerived,
      frontmatterTemplateFieldOrigins: body.frontmatterTemplateFieldOrigins
        ? Object.fromEntries(Object.entries(body.frontmatterTemplateFieldOrigins).map(([key, origin]) => [key, { ...origin }]))
        : undefined,
      frontmatterTemplateRemovedFieldIds: body.frontmatterTemplateRemovedFieldIds
        ? [...body.frontmatterTemplateRemovedFieldIds]
        : undefined,
      frontmatterComputedFields: body.frontmatterComputedFields
        ? { ...body.frontmatterComputedFields }
        : undefined,
      frontmatterTemplateDetachedKeys: body.frontmatterTemplateDetachedKeys
        ? [...body.frontmatterTemplateDetachedKeys]
        : undefined,
      aisles: aisleBodies.map((aisleBody) => ({
        id: createId(),
        aisleBodyId: aisleBody.id,
        markdown: aisleBody.markdown,
      })),
    },
    aisleBodies,
  }
}

export function cloneNoteBodyMetadataWithAisles(baseBody: NoteBody, aisles: NoteAisle[]): NoteBody {
  const timestamp = createTimestamp()
  return {
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    frontmatter: baseBody.frontmatter ? { ...baseBody.frontmatter } : null,
    frontmatterTemplateId: baseBody.frontmatterTemplateId,
    frontmatterTemplateDerived: baseBody.frontmatterTemplateDerived,
    frontmatterTemplateFieldOrigins: baseBody.frontmatterTemplateFieldOrigins
      ? Object.fromEntries(Object.entries(baseBody.frontmatterTemplateFieldOrigins).map(([key, origin]) => [key, { ...origin }]))
      : undefined,
    frontmatterTemplateRemovedFieldIds: baseBody.frontmatterTemplateRemovedFieldIds
      ? [...baseBody.frontmatterTemplateRemovedFieldIds]
      : undefined,
    frontmatterComputedFields: baseBody.frontmatterComputedFields
      ? { ...baseBody.frontmatterComputedFields }
      : undefined,
    frontmatterTemplateDetachedKeys: baseBody.frontmatterTemplateDetachedKeys
      ? [...baseBody.frontmatterTemplateDetachedKeys]
      : undefined,
    aisles,
  }
}

// Note markdown source of truth lives in noteAisleBodies[*].markdown.
// Legacy tab.homeContent/subTab.content mirrors are maintained for older state and export paths.
