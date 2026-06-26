import { describe, expect, it } from 'vitest'
import { Schema } from 'prosemirror-model'
import {
  FIND_REPLACE_ACTIVE_MATCH_CLASS_NAME,
  FIND_REPLACE_ACTIVE_MATCH_META,
  FIND_REPLACE_ACTIVE_MATCH_PULSE_CLASS_NAME,
  findReplaceActiveMatchPlugin,
  resolveFindReplaceEditorRange,
} from './find-replace-active-match'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
})

type DecorationCall = {
  from: number
  to: number
  attrs?: Record<string, string>
  spec?: Record<string, unknown>
}

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function getFindReplaceDecorationCalls(doc: unknown, meta: unknown) {
  const calls: DecorationCall[] = []
  class FakePlugin {
    spec: any

    constructor(spec: any) {
      this.spec = spec
    }
  }

  const pluginBundle = findReplaceActiveMatchPlugin({
    pmState: {
      Plugin: FakePlugin,
    },
    pmView: {
      Decoration: {
        inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => {
          calls.push({ from, to, attrs, spec })
          return calls.at(-1)
        },
      },
      DecorationSet: {
        create: (_doc: unknown, decorations: unknown[]) => decorations,
      },
    },
  })
  const plugin = pluginBundle.wysiwygPlugins[0]() as FakePlugin

  plugin.spec.state.apply(
    {
      doc,
      getMeta: (key: string) => (key === FIND_REPLACE_ACTIVE_MATCH_META ? meta : undefined),
    },
    null,
  )
  plugin.spec.props.decorations({ doc })
  return calls
}

describe('find replace active match decorations', () => {
  it('maps visible search offsets to ProseMirror text positions', () => {
    const doc = schema.nodes.doc.create(null, [
      paragraph('Sure'),
      paragraph('Next aisle context'),
    ])

    expect(resolveFindReplaceEditorRange(doc, { visibleFrom: 0, visibleTo: 4 })).toEqual({ from: 1, to: 5 })
    expect(resolveFindReplaceEditorRange(doc, { visibleFrom: 5, visibleTo: 9 })).toEqual({ from: 7, to: 11 })
  })

  it('creates and clears the active match decoration from transaction metadata', () => {
    const doc = schema.nodes.doc.create(null, [paragraph('Sure')])
    const decorated = getFindReplaceDecorationCalls(doc, { from: 1, to: 5, requestId: 2 })

    expect(decorated).toEqual([
      {
        from: 1,
        to: 5,
        attrs: {
          class: `${FIND_REPLACE_ACTIVE_MATCH_CLASS_NAME} ${FIND_REPLACE_ACTIVE_MATCH_PULSE_CLASS_NAME}`,
        },
        spec: { key: 'find-replace-active-match-2-1-5' },
      },
    ])
    expect(getFindReplaceDecorationCalls(doc, null)).toEqual([])
  })
})
