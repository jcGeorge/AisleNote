import { describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  findImageNodeHitForElement,
  placeCaretAfterImageElement,
} from './image-node-selection'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        imageUrl: { default: '' },
        altText: { default: null },
      },
      toDOM: (node) => ['img', { src: node.attrs.imageUrl, alt: node.attrs.altText ?? '' }],
    },
  },
})

function createImageView() {
  const imageNode = schema.nodes.image.create({
    imageUrl: 'tabs-asset:///assets/pixel.png',
    altText: 'pixel',
  })
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [imageNode]),
  ])
  const image = {
    getAttribute: (name: string) =>
      name === 'src' ? 'tabs-asset:///assets/pixel.png' : name === 'alt' ? 'pixel' : null,
  } as unknown as HTMLImageElement
  const view = {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    }),
    dom: {
      contains: (target: unknown) => target === image,
    },
    posAtDOM: vi.fn(() => 1),
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction)
    }),
    focus: vi.fn(),
  }
  return { view, image }
}

describe('image node selection helpers', () => {
  it('finds the image node represented by a rendered image element', () => {
    const { view, image } = createImageView()

    expect(findImageNodeHitForElement(view, image)).toMatchObject({
      pos: 1,
      node: expect.objectContaining({ type: expect.objectContaining({ name: 'image' }) }),
    })
  })

  it('places a text cursor after the image node instead of selecting before it', () => {
    const { view, image } = createImageView()

    const hit = placeCaretAfterImageElement(view, image)

    expect(hit?.pos).toBe(1)
    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.from).toBe(2)
    expect(view.state.selection.to).toBe(2)
    expect(view.focus).toHaveBeenCalled()
  })

})
