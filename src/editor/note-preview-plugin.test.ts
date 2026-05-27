import { beforeEach, describe, expect, it, vi } from 'vitest'

const createInternalNoteLinkWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'link-widget' })))
const createNotePreviewWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'preview-widget' })))
const createReadonlyNotePreviewWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'readonly-preview-widget' })))

vi.mock('./note-preview-widget', () => ({
  createNotePreviewWidgetElement,
  createInternalNoteLinkWidgetElement,
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
      resolveInternalNoteReferenceToken: vi.fn(() => null),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before ![[Linked--123abc]] after') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createNotePreviewWidgetElement).toHaveBeenCalledWith(payload, expect.objectContaining({ sourceNoteBodyId: 'source-body' }))
    expect(createReadonlyNotePreviewWidgetElement).not.toHaveBeenCalled()
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
      resolveInternalNoteReferenceToken: vi.fn(() => null),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
      renderMode: 'readonly-preview',
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before ![[Linked--123abc]] after') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createReadonlyNotePreviewWidgetElement).toHaveBeenCalledWith(payload, expect.objectContaining({ sourceNoteBodyId: 'source-body' }))
    expect(createNotePreviewWidgetElement).not.toHaveBeenCalled()
  })

  it('passes stable source metadata to internal note link widgets', () => {
    const context = createPluginContext()
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => null),
      resolveInternalNoteReferenceToken: vi.fn(() => ({
        token: '[[Linked--123abc]]',
        parsed: {
          token: '[[Linked--123abc]]',
          embed: false,
          target: 'Linked--123abc',
          noteHandle: 'Linked--123abc',
          suffixHandle: '',
          alias: '',
        },
        payload: {
          id: 'wiki-link:Linked--123abc',
          target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
        },
        target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
        label: 'Linked',
        canonicalTarget: 'Linked--123abc',
        canonicalToken: '[[Linked--123abc]]',
      })),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('Before [[Linked--123abc]] after') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createInternalNoteLinkWidgetElement).toHaveBeenCalledWith(
      'Linked',
      { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
      '[[Linked--123abc]]',
      expect.any(Function),
      { from: 8, to: 26, occurrence: 0 },
    )
  })

  it('counts unresolved internal note links when assigning source occurrence metadata', () => {
    const context = createPluginContext()
    const pluginFactory = createNotePreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(),
      resolvePreviewToken: vi.fn(() => null),
      resolveInternalNoteReferenceToken: vi.fn((token: string) =>
        token === '[[Linked--123abc]]'
          ? {
              token: '[[Linked--123abc]]',
              parsed: {
                token: '[[Linked--123abc]]',
                embed: false,
                target: 'Linked--123abc',
                noteHandle: 'Linked--123abc',
                suffixHandle: '',
                alias: '',
              },
              payload: {
                id: 'wiki-link:Linked--123abc',
                target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
              },
              target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
              label: 'Linked',
              canonicalTarget: 'Linked--123abc',
              canonicalToken: '[[Linked--123abc]]',
            }
          : null,
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }).wysiwygPlugins[0]()

    const decorations = pluginFactory.props.decorations({ doc: createTextDoc('[[Missing--999999]] then [[Linked--123abc]]') })
    const widget = decorations.find((decoration: any) => decoration.type === 'widget')
    widget.factory()

    expect(createInternalNoteLinkWidgetElement).toHaveBeenCalledWith(
      'Linked',
      { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
      '[[Linked--123abc]]',
      expect.any(Function),
      { from: 26, to: 44, occurrence: 1 },
    )
  })
})
