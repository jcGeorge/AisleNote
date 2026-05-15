import { createId } from '../state/workspace'
import type { NoteAisle, NoteBody } from '../types/app'

export function getPrimaryAisle(body: NoteBody | null | undefined): NoteAisle | null {
  return body?.aisles[0] ?? null
}

export function getNoteBodyMarkdown(body: NoteBody | null | undefined, aisleId: string | null | undefined): string {
  if (!body) return ''
  return body.aisles.find((aisle) => aisle.id === aisleId)?.markdown ?? getPrimaryAisle(body)?.markdown ?? ''
}

export function cloneNoteBodyAsIndependentCopy(body: NoteBody): NoteBody {
  return {
    id: createId(),
    frontmatter: body.frontmatter ? { ...body.frontmatter } : null,
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
