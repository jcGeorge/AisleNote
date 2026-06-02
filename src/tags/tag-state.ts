import { getAisleBodyId } from '../notes/note-markdown'
import type { AppState, NoteBody } from '../types/app'
import { getAisleBodyTags, normalizeTagLabel } from './tags.js'

export function getNoteBodyTags(state: AppState, noteBody: NoteBody | null | undefined): string[] {
  if (!noteBody) return []
  const aisleBodiesById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const tags: string[] = []
  const seen = new Set<string>()
  noteBody.aisles.forEach((aisle) => {
    getAisleBodyTags(aisleBodiesById.get(getAisleBodyId(aisle))).forEach((tag: string) => {
      const normalized = normalizeTagLabel(tag)
      const key = normalized.toLocaleLowerCase()
      if (!normalized || seen.has(key)) return
      seen.add(key)
      tags.push(normalized)
    })
  })
  return tags
}
