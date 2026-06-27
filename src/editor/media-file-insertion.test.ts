import { describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import {
  buildMediaMarkdownLink,
  collectMediaImportItems,
  dataTransferHasMediaFiles,
  getMediaFilesFromDataTransfer,
  importMediaFilesAsMarkdown,
  insertAssetLinksIntoWysiwygView,
} from './media-file-insertion'

function file(name: string, type: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline', selectable: false, toDOM: () => ['br'] },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (node) => ({ linkUrl: (node as HTMLElement).getAttribute('href') }) }],
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

function createView(text = '') {
  const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, text ? schema.text(text) : null)])
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction)
    }),
    posAtCoords: vi.fn(() => ({ pos: 1 })),
  }
  return view
}

describe('media file insertion helpers', () => {
  it('detects audio and video files while ignoring non-media files', () => {
    expect(
      collectMediaImportItems([
        file('song.mp3', ''),
        file('voice.wav', ''),
        file('take.m4a', ''),
        file('sample.aac', ''),
        file('mix.flac', ''),
        file('loop.ogg', ''),
        file('alt.oga', ''),
        file('spoken.opus', ''),
        file('clip.mp4', ''),
        file('export.m4v', ''),
        file('movie.webm', ''),
        file('phone.mov', ''),
        file('report.pdf', 'application/pdf'),
      ]).map((item) => [item.kind, item.fileName]),
    ).toEqual([
      ['audio', 'song.mp3'],
      ['audio', 'voice.wav'],
      ['audio', 'take.m4a'],
      ['audio', 'sample.aac'],
      ['audio', 'mix.flac'],
      ['audio', 'loop.ogg'],
      ['audio', 'alt.oga'],
      ['audio', 'spoken.opus'],
      ['video', 'clip.mp4'],
      ['video', 'export.m4v'],
      ['video', 'movie.webm'],
      ['video', 'phone.mov'],
    ])
  })

  it('uses mime types for unnamed clipboard blobs', () => {
    expect(
      collectMediaImportItems([
        new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
        new Blob([new Uint8Array([2])], { type: 'video/webm' }),
        new Blob([new Uint8Array([3])], { type: 'audio/opus' }),
        new Blob([new Uint8Array([4])], { type: 'audio/flac' }),
      ]).map((item) => [item.kind, item.fileName]),
    ).toEqual([
      ['audio', 'clipboard-audio.mp3'],
      ['video', 'clipboard-video-2.webm'],
      ['audio', 'clipboard-audio-3.opus'],
      ['audio', 'clipboard-audio-4.flac'],
    ])
  })

  it('imports media files as markdown links', async () => {
    const importBlobAsAssetUrl = vi.fn(async (_blob: Blob, fileName?: string) => `aislenote-asset:///assets/${fileName}`)

    await expect(importMediaFilesAsMarkdown([file('song.mp3', 'audio/mpeg')], importBlobAsAssetUrl)).resolves.toBe(
      '[song.mp3](aislenote-asset:///assets/song.mp3)',
    )
    expect(importBlobAsAssetUrl).toHaveBeenCalledWith(expect.any(Blob), 'song.mp3')
  })

  it('detects media files from data transfer files and items', () => {
    const audio = file('song.mp3', '')
    const pdf = file('report.pdf', 'application/pdf')

    expect(getMediaFilesFromDataTransfer({ files: [pdf, audio] })).toEqual([audio])
    expect(dataTransferHasMediaFiles({ files: [pdf] })).toBe(false)
    expect(dataTransferHasMediaFiles({ items: [{ kind: 'file', type: 'audio/mpeg' }] })).toBe(true)
    expect(dataTransferHasMediaFiles({ items: [{ kind: 'file', type: 'application/pdf' }] })).toBe(false)
  })

  it('escapes markdown link labels', () => {
    expect(buildMediaMarkdownLink('song [demo].mp3', 'aislenote-asset:///assets/song.mp3')).toBe(
      '[song [demo\\].mp3](aislenote-asset:///assets/song.mp3)',
    )
  })

  it('inserts media as a real ProseMirror link mark instead of literal markdown text', () => {
    const view = createView()
    const inserted = insertAssetLinksIntoWysiwygView(view, [
      { label: 'Miki Matsubara - 真夜中のドア [demo].mp3', url: 'aislenote-asset:///assets/song.mp3' },
    ])

    expect(inserted).toBe(true)
    expect(view.state.doc.textContent).toBe('Miki Matsubara - 真夜中のドア [demo].mp3')
    expect(view.state.doc.textContent).not.toContain('](')

    const paragraph = view.state.doc.firstChild
    const textNode = paragraph?.firstChild
    expect(textNode?.marks[0]?.attrs).toEqual({ linkUrl: 'aislenote-asset:///assets/song.mp3' })
  })

  it('uses drop coordinates when inserting media links', () => {
    const view = createView('start ')

    insertAssetLinksIntoWysiwygView(
      view,
      [{ label: 'song.mp3', url: 'aislenote-asset:///assets/song.mp3' }],
      { left: 10, top: 20 },
    )

    expect(view.posAtCoords).toHaveBeenCalledWith({ left: 10, top: 20 })
    expect(view.state.doc.textContent).toBe('song.mp3start ')
  })
})
