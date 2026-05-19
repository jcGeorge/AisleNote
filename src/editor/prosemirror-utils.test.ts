import { describe, expect, it } from 'vitest'
import { Schema } from 'prosemirror-model'
import { getExternalLinkRangeAtDocPosition, getNoteMentionQueryAtSelection } from './prosemirror-utils'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
    },
  },
})

describe('note mention query detection', () => {
  function viewForText(text: string) {
    return {
      state: {
        selection: {
          empty: true,
          from: text.length + 1,
          $from: {
            parentOffset: text.length,
            parent: {
              isTextblock: true,
              textBetween: () => text,
            },
          },
        },
      },
    }
  }

  it('detects an @ query before the cursor', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @parent'))).toEqual({
      from: 5,
      to: 12,
      query: 'parent',
    })
  })

  it('ignores completed mentions with whitespace after the query', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @parent '))).toBeNull()
  })
})

describe('external link range detection', () => {
  it('finds the full link text range at a document position', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('visit '),
        schema.text('example', [link]),
        schema.text(' now'),
      ]),
    ])

    expect(getExternalLinkRangeAtDocPosition(doc, 9, 'https://example.com')).toEqual({
      from: 7,
      to: 14,
      href: 'https://example.com',
    })
  })

  it('rejects positions outside matching links', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('visit '),
        schema.text('example', [link]),
      ]),
    ])

    expect(getExternalLinkRangeAtDocPosition(doc, 2, 'https://example.com')).toBeNull()
    expect(getExternalLinkRangeAtDocPosition(doc, 9, 'https://other.example')).toBeNull()
  })
})
