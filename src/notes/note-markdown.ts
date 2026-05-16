import { createId, createTimestamp } from '../state/workspace'
import type { NoteAisle, NoteBody } from '../types/app'

export function getPrimaryAisle(body: NoteBody | null | undefined): NoteAisle | null {
  return body?.aisles[0] ?? null
}

export function getNoteBodyMarkdown(body: NoteBody | null | undefined, aisleId: string | null | undefined): string {
  if (!body) return ''
  return body.aisles.find((aisle) => aisle.id === aisleId)?.markdown ?? getPrimaryAisle(body)?.markdown ?? ''
}

export function cloneNoteBodyAsIndependentCopy(body: NoteBody): NoteBody {
  const timestamp = createTimestamp()
  return {
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
    aisles:
      body.aisles.length > 0
        ? body.aisles.map((aisle) => ({
            id: createId(),
            markdown: aisle.markdown,
          }))
        : [{ id: createId(), markdown: '' }],
  }
}

// Note markdown source of truth lives in noteBodies[*].aisles[*].markdown.
// Legacy tab.homeContent/subTab.content mirrors are maintained for older state and export paths.
