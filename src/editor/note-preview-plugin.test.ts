import { describe, expect, it, vi } from 'vitest'

const createInternalNoteLinkWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'link-widget' })))
const createContextPreviewWidgetElement = vi.hoisted(() => vi.fn(() => ({ nodeType: 'preview-widget' })))

vi.mock('./note-preview-widget', () => ({
  createContextPreviewWidgetElement,
  createInternalNoteLinkWidgetElement,
}))

import { createContextPreviewPlugin } from './note-preview-plugin'

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
  it('passes stable source metadata to internal note link widgets', () => {
    const context = createPluginContext()
    const pluginFactory = createContextPreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getContextPreviewData: vi.fn(),
      resolveContextPreviewToken: vi.fn(() => null),
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
      deleteContextPreview: vi.fn(),
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
    const pluginFactory = createContextPreviewPlugin(context, {
      sourceNoteBodyId: 'source-body',
      getContextPreviewData: vi.fn(),
      resolveContextPreviewToken: vi.fn(() => null),
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
      deleteContextPreview: vi.fn(),
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
