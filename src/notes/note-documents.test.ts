import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import { getAisleMarkdown } from './note-markdown'
import { getNoteDocument, readAisleMarkdown, updateAisleMarkdown, writeNoteDocumentAisles } from './note-documents'

function createState() {
  return parseSavedState(
    JSON.stringify({
      activeDomainId: 'domain-1',
      activeSpaceId: 'space-1',
      domains: [{
        id: 'domain-1',
        name: 'Domain',
        activeSpaceId: 'space-1',
        spaces: [
        {
          id: 'space-1',
          name: 'Space',
          data: {
            activeTabId: 'tab-1',
            tabs: [
              {
                id: 'tab-1',
                title: 'Tab',
                noteBodyId: 'body-1',
                activeSubTabId: null,
                subTabs: [],
              },
            ],
            deletedTabs: [],
            deletedSubTabs: [],
          },
        },
      ],
      }],
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
            { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
          ],
        },
      ],
      noteAisleBodies: [
        { id: 'aisle-body-1', markdown: 'first' },
        { id: 'aisle-body-2', markdown: 'second' },
      ],
    }),
  )
}

describe('note document helpers', () => {
  it('reads aisle markdown without exposing mutable state aisles', () => {
    const document = getNoteDocument(createState(), 'body-1')

    expect(document?.noteBodyId).toBe('body-1')
    expect(document ? readAisleMarkdown(document, 'aisle-2') : null).toBe('second')
  })

  it('writes aisle markdown through aisle bodies', () => {
    const state = createState()
    const document = getNoteDocument(state, 'body-1')
    if (!document) throw new Error('missing document')

    const nextDocument = updateAisleMarkdown(document, 'aisle-1', 'updated')
    const next = writeNoteDocumentAisles(state, nextDocument)

    const firstAisle = next.noteBodies.find((body) => body.id === 'body-1')?.aisles[0]
    expect(firstAisle ? getAisleMarkdown(firstAisle, next.noteAisleBodies) : '').toBe('updated')
  })
})
