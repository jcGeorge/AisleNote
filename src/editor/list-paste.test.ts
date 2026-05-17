import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import { getBulletListMarkerFromAttrs } from './list-markers'
import { createPastedListNode, insertPastedListIntoView, parsePastedList } from './list-paste'

const listPasteSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        htmlAttrs: { default: null },
        classNames: { default: null },
      },
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        order: { default: 1 },
      },
      toDOM: () => ['ol', 0],
    },
    listItem: {
      content: 'paragraph block*',
      attrs: {
        task: { default: null },
        checked: { default: null },
      },
      toDOM: () => ['li', 0],
    },
  },
})

function itemTexts(listNode: any): string[] {
  const texts: string[] = []
  for (let index = 0; index < listNode.childCount; index += 1) {
    texts.push(listNode.child(index).child(0).textContent)
  }
  return texts
}

describe('pasted list parsing', () => {
  it('parses ordered, bullet, dash, and task list clipboard text', () => {
    expect(parsePastedList('3. alpha\n4. beta')).toMatchObject({
      kind: 'numberedList',
      order: 3,
      items: [{ text: 'alpha' }, { text: 'beta' }],
    })
    expect(parsePastedList('* alpha\n* beta')).toMatchObject({ kind: 'bulletList' })
    expect(parsePastedList('- alpha\n- beta')).toMatchObject({ kind: 'dashList' })
    expect(parsePastedList('- [ ] alpha\n- [x] beta')).toMatchObject({
      kind: 'task',
      items: [{ text: 'alpha', checked: false }, { text: 'beta', checked: true }],
    })
  })

  it('leaves URLs and mixed plain text alone', () => {
    expect(parsePastedList('https://example.com')).toBeNull()
    expect(parsePastedList('1. alpha\nplain beta')).toBeNull()
  })

  it('creates list nodes with the expected attrs', () => {
    const dashNode = createPastedListNode(listPasteSchema, parsePastedList('- alpha\n- beta')!)
    const taskNode = createPastedListNode(listPasteSchema, parsePastedList('- [x] alpha\n- [ ] beta')!)

    expect(dashNode?.type.name).toBe('bulletList')
    expect(getBulletListMarkerFromAttrs(dashNode?.attrs)).toBe('dash')
    expect(itemTexts(dashNode)).toEqual(['alpha', 'beta'])
    expect(taskNode?.child(0).attrs).toMatchObject({ task: true, checked: true })
    expect(taskNode?.child(1).attrs).toMatchObject({ task: true, checked: false })
  })

  it('inserts parsed lists into the active WYSIWYG selection', () => {
    const doc = listPasteSchema.nodes.doc.create(null, [listPasteSchema.nodes.paragraph.create()])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    })
    const view = {
      get state() {
        return state
      },
      dispatch: vi.fn((transaction) => {
        state = state.apply(transaction)
      }),
    }

    expect(insertPastedListIntoView(view, '1. alpha\n2. beta')).toBe(true)
    expect(state.doc.child(0).type.name).toBe('orderedList')
    expect(itemTexts(state.doc.child(0))).toEqual(['alpha', 'beta'])
  })
})
