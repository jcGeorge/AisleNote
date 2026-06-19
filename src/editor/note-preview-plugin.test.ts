import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import type { AppState } from '../types/app'
import { buildPreviewToken } from '../notes/note-references'

const renderRoot = vi.hoisted(() => vi.fn())
const unmountRoot = vi.hoisted(() => vi.fn())

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: renderRoot,
    unmount: unmountRoot,
  })),
}))

import { collectNotePreviewRanges, createNotePreviewPlugin, renameNotePreviewRangeLabelFromView } from './note-preview-plugin'

const pmSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
})

function createState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-a',
      items: [
        { type: 'note', id: 'note-a', title: 'Alpha', noteBodyId: 'body-a' },
        { type: 'note', id: 'note-b', title: 'Beta', noteBodyId: 'body-b' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] },
      { id: 'body-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'aisle-body-b' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-a', markdown: 'Alpha' },
      { id: 'aisle-body-b', markdown: 'Beta body' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function createDoc(text: string) {
  return {
    descendants(callback: (node: unknown, pos: number) => void) {
      callback({ isText: true, text }, 1)
    },
  }
}

function createParagraphDoc(paragraphs: string[]) {
  return pmSchema.nodes.doc.create(
    null,
    paragraphs.map((text) => pmSchema.nodes.paragraph.create(null, text ? pmSchema.text(text) : null)),
  )
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
        widget: vi.fn((from: number, factory: (view?: unknown) => unknown, options: Record<string, unknown>) => ({
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
        node: vi.fn((from: number, to: number, attrs: Record<string, unknown>) => ({
          type: 'node',
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

describe('note preview plugin', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => ({ className: '', contentEditable: '', setAttribute: vi.fn() }),
    })
    renderRoot.mockClear()
    unmountRoot.mockClear()
  })

  it('collects embedded note preview token ranges from mounted docs', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })
    const ranges = collectNotePreviewRanges(createDoc(`before ${token} after`), state)

    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      from: 8,
      to: 8 + token.length,
      token,
      payload: { target: { noteId: 'note-b' } },
      label: 'Beta',
    })
  })

  it('collects custom preview token labels', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } }).replace('![Beta]', '![Pinned Beta]')
    const ranges = collectNotePreviewRanges(createDoc(token), state)

    expect(ranges[0]).toMatchObject({
      token,
      payload: { target: { noteId: 'note-b' } },
      label: 'Pinned Beta',
    })
  })

  it('preserves parsed aisle ids in preview token ranges', () => {
    const state = createState()
    const token = buildPreviewToken(state, {
      id: 'preview:beta:aisle-b',
      target: { noteId: 'note-b' },
      aisleIds: ['aisle-b'],
    })
    const ranges = collectNotePreviewRanges(createDoc(token), state)

    expect(ranges[0]).toMatchObject({
      token,
      payload: { target: { noteId: 'note-b' }, aisleIds: ['aisle-b'] },
    })
  })

  it('renders preview widgets and hides source tokens with decorations', () => {
    const state = createState()
    const token = buildPreviewToken(state, {
      id: 'preview:beta:aisle-b',
      target: { noteId: 'note-b' },
      aisleIds: ['aisle-b'],
    })
    const context = createPluginContext()
    const plugin = createNotePreviewPlugin({
      getAppState: () => state,
      getCurrentNoteBodyId: () => 'body-a',
      onOpenNote: vi.fn(),
    })(context).wysiwygPlugins[0]()
    const decorations = plugin.props.decorations({ doc: createDoc(token) })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const inline = decorations.find((decoration: any) => decoration.type === 'inline')

    widget.factory()

    expect(widget.from).toBe(1)
    expect(renderRoot).toHaveBeenCalled()
    expect(renderRoot.mock.calls.at(-1)?.[0].props.aisleIds).toEqual(['aisle-b'])
    expect(inline).toMatchObject({
      from: 1,
      to: 1 + token.length,
      attrs: { class: 'tabs-note-preview-source-hidden' },
    })
  })

  it('anchors repeated preview tokens as separate block widgets', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })
    const doc = createParagraphDoc([token, token, token])
    const context = createPluginContext()
    const plugin = createNotePreviewPlugin({
      getAppState: () => state,
      getCurrentNoteBodyId: () => 'body-a',
      onOpenNote: vi.fn(),
    })(context).wysiwygPlugins[0]()
    const ranges = collectNotePreviewRanges(doc, state)
    const decorations = plugin.props.decorations({ doc })
    const widgets = decorations.filter((decoration: any) => decoration.type === 'widget')
    const hiddenBlocks = decorations.filter((decoration: any) => decoration.type === 'node')
    const paragraphSize = token.length + 2

    expect(ranges).toHaveLength(3)
    expect(ranges.map((range) => range.from)).toEqual([1, paragraphSize + 1, paragraphSize * 2 + 1])
    expect(ranges.map((range) => range.to)).toEqual([
      1 + token.length,
      paragraphSize + 1 + token.length,
      paragraphSize * 2 + 1 + token.length,
    ])
    expect(ranges.map((range) => range.widgetFrom)).toEqual([0, paragraphSize, paragraphSize * 2])
    expect(widgets.map((widget: any) => widget.from)).toEqual([0, paragraphSize, paragraphSize * 2])
    expect(hiddenBlocks).toEqual([
      {
        type: 'node',
        from: 0,
        to: paragraphSize,
        attrs: { class: 'tabs-note-preview-source-block-hidden' },
      },
      {
        type: 'node',
        from: paragraphSize,
        to: paragraphSize * 2,
        attrs: { class: 'tabs-note-preview-source-block-hidden' },
      },
      {
        type: 'node',
        from: paragraphSize * 2,
        to: paragraphSize * 3,
        attrs: { class: 'tabs-note-preview-source-block-hidden' },
      },
    ])
  })

  it('wires preview deletion to the hidden source token range', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })
    const context = createPluginContext()
    const plugin = createNotePreviewPlugin({
      getAppState: () => state,
      getCurrentNoteBodyId: () => 'body-a',
      onOpenNote: vi.fn(),
    })(context).wysiwygPlugins[0]()
    const decorations = plugin.props.decorations({ doc: createDoc(token) })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const transaction: any = {
      delete: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const view = {
      state: {
        doc: { content: { size: 1 + token.length } },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    }

    widget.factory(view)
    const renderedPreview = renderRoot.mock.calls.at(-1)?.[0]
    renderedPreview.props.onDelete()

    expect(transaction.delete).toHaveBeenCalledWith(1, 1 + token.length)
    expect(transaction.scrollIntoView).toHaveBeenCalled()
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
    expect(view.focus).toHaveBeenCalled()
  })

  it('wires preview label rename to the hidden source token range', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })
    const context = createPluginContext()
    const plugin = createNotePreviewPlugin({
      getAppState: () => state,
      getCurrentNoteBodyId: () => 'body-a',
      onOpenNote: vi.fn(),
    })(context).wysiwygPlugins[0]()
    const decorations = plugin.props.decorations({ doc: createDoc(token) })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const transaction: any = {
      insertText: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const view = {
      state: {
        doc: { content: { size: 1 + token.length } },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    }

    widget.factory(view)
    const renderedPreview = renderRoot.mock.calls.at(-1)?.[0]
    renderedPreview.props.onRenameLabel('Pinned Beta')

    expect(renderedPreview.props.label).toBe('Beta')
    expect(transaction.insertText).toHaveBeenCalledWith(expect.stringMatching(/^!\[Pinned Beta\]\(Beta--[0-9a-f]{6}\)$/), 1, 1 + token.length)
    expect(transaction.scrollIntoView).toHaveBeenCalled()
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
    expect(view.focus).toHaveBeenCalled()
  })

  it('renames preview labels with a direct transaction helper', () => {
    const state = createState()
    const token = buildPreviewToken(state, {
      id: 'preview:beta:aisle-b',
      target: { noteId: 'note-b' },
      aisleIds: ['aisle-b'],
    })
    const transaction: any = {
      insertText: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const view = {
      state: {
        doc: { content: { size: token.length } },
        tr: transaction,
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    }

    expect(renameNotePreviewRangeLabelFromView(view, { from: 0, to: token.length, token }, 'Pinned Beta')).toBe(true)
    expect(transaction.insertText).toHaveBeenCalledWith(
      expect.stringMatching(/^!\[Pinned Beta\]\(<Beta--[0-9a-f]{6}#aisle 1--[0-9a-f]{6}>\)$/),
      0,
      token.length,
    )
  })
})
