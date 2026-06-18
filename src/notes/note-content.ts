import { extractMarkdownTags } from '../tags/tags.js'
import type { NoteAisle, NoteAisleBody, NoteBody } from '../types/app'
import { createRandomId, type IdGenerator } from '../state/navigation-ids'

export const MAX_NOTE_AISLES = 8

export function createId(): string {
  return createRandomId()
}

export function createTimestamp(now = new Date()): string {
  return now.toISOString()
}

export function createNoteAisle(generateId: IdGenerator = createId): NoteAisle {
  const aisleBodyId = generateId()
  return {
    id: generateId(),
    aisleBodyId,
  }
}

export function createNoteBodyContent(
  markdown = '',
  generateId: IdGenerator = createId,
): { noteBody: NoteBody; aisleBody: NoteAisleBody } {
  const timestamp = createTimestamp()
  const aisleBodyId = generateId()
  return {
    noteBody: {
      id: generateId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles: [{ id: generateId(), aisleBodyId }],
    },
    aisleBody: {
      id: aisleBodyId,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown,
      tags: extractMarkdownTags(markdown),
      frontmatter: null,
      frontmatterStatus: 'none',
    },
  }
}

export function createNoteBody(generateId: IdGenerator = createId): NoteBody {
  return createNoteBodyContent('', generateId).noteBody
}
