import { beforeEach, describe, expect, it, vi } from 'vitest'

const createNotePreviewWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'preview-widget' })))
const createReadonlyNotePreviewWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'readonly-preview-widget' })))

vi.mock('./note-preview-widget', () => ({
  createNotePreviewWidgetElement,
  createReadonlyNotePreviewWidgetElement,
}))

import { createNotePreviewPlugin } from './note-preview-plugin'

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
        node: vi.fn((from: number, to: number, attrs: Record<string, unknown>) => ({
          type: 'node',
          from,
          to,
          attrs,
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

function createTextDoc(text: string) {
  return {
    descendants(callback: (node: unknown, pos: number) => void) {
      callback({ isText: true, text }, 1)
    },
  }
}

function createImageDoc(source: string, alt = 'Linked') {
  return {
    descendants(callback: (node: unknown, pos: number) => boolean | void) {
      callback(
        {
          isText: false,
          type: { name: 'image' },
          attrs: { imageUrl: source, altText: alt },
          nodeSize: 1,
        },
        4,
      )
    },
  }
}

describe('note preview plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders full preview widgets in editor mode', () => {
    const context = createPluginContext()
    const payload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    }
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => payload),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before ![Linked](Linked--123abc) after') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createNotePreviewWidgetElement).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ sourceNoteBodyId: 'source-body' }),
      { from: 8, to: 33 },
      'Linked',
    )
    expect(createReadonlyNotePreviewWidgetElement).not.toHaveBeenCalled()
  })

  it('renders internal note image nodes as preview widgets and hides the image node', () => {
    const context = createPluginContext()
    const payload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    }
    const resolvePreviewToken = vi.fn(() => payload)
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken,
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createImageDoc('Linked--123abc') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const hiddenNode = decorations.find((decoration: any) => decoration.type === 'node')
    widget.factory()

    expect(resolvePreviewToken).toHaveBeenCalledWith('![Linked](Linked--123abc)')
    expect(createNotePreviewWidgetElement).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ sourceNoteBodyId: 'source-body' }),
      { from: 4, to: 5 },
      'Linked',
    )
    expect(hiddenNode).toMatchObject({ from: 4, to: 5, attrs: { class: 'note-context-node-hidden' } })
  })

  it('renders navigation-only preview widgets in readonly-preview mode', () => {
    const context = createPluginContext()
    const payload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    }
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => payload),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
      renderMode: 'readonly-preview',
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before ![Linked](Linked--123abc) after') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createReadonlyNotePreviewWidgetElement).toHaveBeenCalledWith(payload, expect.objectContaining({ sourceNoteBodyId: 'source-body' }))
    expect(createNotePreviewWidgetElement).not.toHaveBeenCalled()
  })

  it('renders internal note image nodes as readonly preview widgets', () => {
    const context = createPluginContext()
    const payload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    }
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => payload),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
      renderMode: 'readonly-preview',
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createImageDoc('Linked--123abc') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    const hiddenNode = decorations.find((decoration: any) => decoration.type === 'node')
    widget.factory()

    expect(createReadonlyNotePreviewWidgetElement).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ sourceNoteBodyId: 'source-body' }),
    )
    expect(createNotePreviewWidgetElement).not.toHaveBeenCalled()
    expect(hiddenNode).toMatchObject({ from: 4, to: 5, attrs: { class: 'note-context-node-hidden' } })
  })

  it('leaves external image nodes undecorated', () => {
    const context = createPluginContext()
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => null),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createImageDoc('https://example.com/pixel.png', 'pixel') })

    expect(decorations).toEqual([])
  })

  it('does not replace normal markdown note hyperlinks with widgets', () => {
    const context = createPluginContext()
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => null),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before [Linked](Linked--123abc) after') })

    expect(decorations).toEqual([])
  })

  it('leaves unresolved markdown preview references undecorated', () => {
    const context = createPluginContext()
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => null),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before ![Missing](Missing--999999) after') })

    expect(decorations).toEqual([])
  })
})
