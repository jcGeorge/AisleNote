import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'

const createMediaPlayerElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'media-player' })))

vi.mock('../media/media-player-dom', () => ({
  createMediaPlayerElement,
}))

import {
  collectMediaLinkRanges,
  createMediaLinkPlugin,
  deleteAdjacentMediaLinkRange,
  getAdjacentMediaLinkRange,
  updateMediaLinkRangeUrl,
} from './media-link-plugin'

const pmSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

function linkMark(href: string) {
  return {
    type: { name: 'link' },
    attrs: { linkUrl: href },
  }
}

function createDoc(segments: Array<{ text: string; href?: string }>) {
  return {
    descendants(callback: (node: unknown, pos: number) => void) {
      let position = 1
      for (const segment of segments) {
        callback(
          {
            isText: true,
            text: segment.text,
            marks: segment.href ? [linkMark(segment.href)] : [],
          },
          position,
        )
        position += segment.text.length
      }
    },
  }
}

function createPluginContext() {
  class Plugin {
    props: any

    constructor(config: any) {
      this.props = config.props
    }
  }

  return {
    pmState: { Plugin },
    pmView: {
      Decoration: {
        widget: vi.fn((from: number, factory: () => unknown, options: Record<string, unknown>) => ({
          type: 'widget',
          from,
          factory,
          options,
        })),
        inline: vi.fn((from: number, to: number, attrs: Record<string, unknown>) => ({
          type: 'inline',
          from,
          to,
          attrs,
        })),
      },
      DecorationSet: {
        create: vi.fn((_doc: unknown, decorations: unknown[]) => decorations),
      },
    },
  }
}

function createViewWithMediaSelection(selectionPosition: number) {
  const mediaMark = pmSchema.marks.link.create({ linkUrl: 'tabs-asset:///assets/song.mp3' })
  const doc = pmSchema.nodes.doc.create(null, [
    pmSchema.nodes.paragraph.create(null, [
      pmSchema.text('before '),
      pmSchema.text('Song', [mediaMark]),
      pmSchema.text(' after'),
    ]),
  ])
  const view = {
    state: EditorState.create({
      schema: pmSchema,
      doc,
      selection: TextSelection.create(doc, selectionPosition),
    }),
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction)
    }),
    focus: vi.fn(),
  }
  return view
}

describe('media link plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects media link ranges and groups split marked text', () => {
    const ranges = collectMediaLinkRanges(createDoc([
      { text: 'Song ', href: 'tabs-asset:///assets/song.mp3' },
      { text: 'One', href: 'tabs-asset:///assets/song.mp3' },
      { text: ' and report ', href: 'tabs-asset:///assets/report.pdf' },
      { text: ' clip', href: 'clip.webm#tabs-media=width=320,ratio=shorts' },
    ]))

    expect(ranges).toEqual([
      {
        from: 1,
        to: 9,
        href: 'tabs-asset:///assets/song.mp3',
        label: 'Song One',
        kind: 'audio',
      },
      {
        from: 21,
        to: 26,
        href: 'clip.webm#tabs-media=width=320,ratio=shorts',
        label: ' clip',
        kind: 'video',
      },
    ])
  })

  it('creates media widgets while leaving source ranges represented as decorations', () => {
    const context = createPluginContext()
    const plugin = createMediaLinkPlugin(context).wysiwygPlugins[0]()

    const decorations = plugin.props.decorations({
      doc: createDoc([{ text: 'Clip', href: 'tabs-asset:///assets/clip.mp4#tabs-media=width=320,rotate=90' }]),
    })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const inline = decorations.find((decoration: any) => decoration.type === 'inline')

    widget.factory()

    expect(createMediaPlayerElement).toHaveBeenCalledWith({
      kind: 'video',
      src: 'tabs-asset:///assets/clip.mp4#tabs-media=width=320,rotate=90',
      label: 'Clip',
      sourceFrom: 1,
      sourceTo: 5,
      onSourceChange: expect.any(Function),
    })
    expect(widget.from).toBe(1)
    expect(widget.options.key).toBe('media-link-video:tabs-asset:///assets/clip.mp4:Clip-0')
    expect(inline).toMatchObject({
      from: 1,
      to: 5,
      attrs: { class: 'tabs-media-link-source-hidden' },
    })
  })

  it('keeps media widget keys stable when text is inserted before them', () => {
    const context = createPluginContext()
    const plugin = createMediaLinkPlugin(context).wysiwygPlugins[0]()
    const source = 'tabs-asset:///assets/song.mp3#tabs-media=speed=1.25'

    const originalDecorations = plugin.props.decorations({
      doc: createDoc([{ text: 'Song', href: source }]),
    })
    const shiftedDecorations = plugin.props.decorations({
      doc: createDoc([{ text: 'before ' }, { text: 'Song', href: source }]),
    })

    const originalWidget = originalDecorations.find((decoration: any) => decoration.type === 'widget')
    const shiftedWidget = shiftedDecorations.find((decoration: any) => decoration.type === 'widget')

    expect(originalWidget.from).toBe(1)
    expect(shiftedWidget.from).toBe(8)
    expect(shiftedWidget.options.key).toBe(originalWidget.options.key)
  })

  it('keeps duplicate media widget keys distinct by occurrence', () => {
    const context = createPluginContext()
    const plugin = createMediaLinkPlugin(context).wysiwygPlugins[0]()

    const decorations = plugin.props.decorations({
      doc: createDoc([
        { text: 'Song', href: 'tabs-asset:///assets/song.mp3' },
        { text: ' and ' },
        { text: 'Song', href: 'tabs-asset:///assets/song.mp3' },
      ]),
    })
    const keys = decorations
      .filter((decoration: any) => decoration.type === 'widget')
      .map((decoration: any) => decoration.options.key)

    expect(keys).toEqual([
      'media-link-audio:tabs-asset:///assets/song.mp3:Song-0',
      'media-link-audio:tabs-asset:///assets/song.mp3:Song-1',
    ])
  })

  it('persists source changes to the media range at the widget current position', () => {
    const context = createPluginContext()
    const plugin = createMediaLinkPlugin(context).wysiwygPlugins[0]()
    const source = 'tabs-asset:///assets/song.mp3'
    const initialDecorations = plugin.props.decorations({
      doc: createDoc([{ text: 'Song', href: source }]),
    })
    const widget = initialDecorations.find((decoration: any) => decoration.type === 'widget')

    const linkMarkType = {
      attrs: { linkUrl: {}, title: {} },
      create: vi.fn((attrs: Record<string, unknown>) => ({ type: linkMarkType, attrs })),
    }
    const shiftedDoc = {
      descendants(callback: (node: unknown, pos: number) => void) {
        callback({ isText: true, text: 'before ', marks: [] }, 1)
        callback({ isText: true, text: 'Song', marks: [linkMark(source)] }, 8)
      },
      nodesBetween: vi.fn((_from: number, _to: number, visitor: (node: unknown) => boolean) => {
        visitor({
          isText: true,
          marks: [{ type: linkMarkType, attrs: { linkUrl: source, title: 'Song title' } }],
        })
      }),
    }
    const tr = {
      removeMark: vi.fn(() => tr),
      addMark: vi.fn(() => tr),
    }
    const view = {
      state: {
        tr,
        schema: { marks: { link: linkMarkType } },
        doc: shiftedDoc,
      },
      dispatch: vi.fn(),
    }

    widget.factory(view, () => 8)
    const mediaPlayerCalls = createMediaPlayerElement.mock.calls as unknown as Array<[
      { onSourceChange?: (nextSrc: string) => void },
    ]>
    const onSourceChange = mediaPlayerCalls.at(-1)?.[0].onSourceChange
    onSourceChange?.('tabs-asset:///assets/song.mp3#tabs-media=speed=1.25')

    expect(tr.removeMark).toHaveBeenCalledWith(8, 12, linkMarkType)
    expect(tr.addMark).toHaveBeenCalledWith(8, 12, {
      type: linkMarkType,
      attrs: {
        linkUrl: 'tabs-asset:///assets/song.mp3#tabs-media=speed=1.25',
        title: 'Song title',
      },
    })
  })

  it('updates media link urls while preserving existing link attributes', () => {
    const linkMarkType = {
      attrs: { linkUrl: {}, title: {} },
      create: vi.fn((attrs: Record<string, unknown>) => ({ type: linkMarkType, attrs })),
    }
    const tr = {
      removeMark: vi.fn(() => tr),
      addMark: vi.fn(() => tr),
    }
    const view = {
      state: {
        tr,
        schema: { marks: { link: linkMarkType } },
        doc: {
          nodesBetween: vi.fn((_from: number, _to: number, visitor: (node: unknown) => boolean) => {
            visitor({
              isText: true,
              marks: [{ type: linkMarkType, attrs: { linkUrl: 'clip.mp4', title: 'Clip title' } }],
            })
          }),
        },
      },
      dispatch: vi.fn(),
    }

    expect(updateMediaLinkRangeUrl(view, {
      from: 1,
      to: 5,
      href: 'clip.mp4',
      label: 'Clip',
      kind: 'video',
    }, 'clip.mp4#tabs-media=speed=1.25')).toBe(true)

    expect(tr.removeMark).toHaveBeenCalledWith(1, 5, linkMarkType)
    expect(tr.addMark).toHaveBeenCalledWith(1, 5, {
      type: linkMarkType,
      attrs: {
        linkUrl: 'clip.mp4#tabs-media=speed=1.25',
        title: 'Clip title',
      },
    })
    expect(view.dispatch).toHaveBeenCalledWith(tr)
  })

  it('finds media links adjacent to forward and backward delete positions', () => {
    const mediaMark = pmSchema.marks.link.create({ linkUrl: 'tabs-asset:///assets/song.mp3' })
    const doc = pmSchema.nodes.doc.create(null, [
      pmSchema.nodes.paragraph.create(null, [
        pmSchema.text('before '),
        pmSchema.text('Song', [mediaMark]),
        pmSchema.text(' after'),
      ]),
    ])

    expect(getAdjacentMediaLinkRange(doc, 8, 'forward')).toMatchObject({ from: 8, to: 12, kind: 'audio' })
    expect(getAdjacentMediaLinkRange(doc, 12, 'backward')).toMatchObject({ from: 8, to: 12, kind: 'audio' })
    expect(getAdjacentMediaLinkRange(doc, 8, 'backward')).toBeNull()
    expect(getAdjacentMediaLinkRange(doc, 12, 'forward')).toBeNull()
  })

  it('deletes a full media link range when delete is pressed before the widget', () => {
    const view = createViewWithMediaSelection(8)

    expect(deleteAdjacentMediaLinkRange(view, 'forward')).toBe(true)
    expect(view.state.doc.textContent).toBe('before  after')
    expect(collectMediaLinkRanges(view.state.doc)).toEqual([])
    expect(view.focus).toHaveBeenCalled()
  })

  it('deletes a full media link range when backspace is pressed after the widget', () => {
    const view = createViewWithMediaSelection(12)

    expect(deleteAdjacentMediaLinkRange(view, 'backward')).toBe(true)
    expect(view.state.doc.textContent).toBe('before  after')
    expect(collectMediaLinkRanges(view.state.doc)).toEqual([])
  })

  it('ignores non-media links and unmarked text', () => {
    const ranges = collectMediaLinkRanges(createDoc([
      { text: 'Plain' },
      { text: 'Report', href: 'report.pdf' },
      { text: 'Site', href: 'https://example.com' },
    ]))

    expect(ranges).toEqual([])
  })
})
