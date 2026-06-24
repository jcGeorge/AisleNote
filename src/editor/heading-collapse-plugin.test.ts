import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HEADING_COLLAPSE_PRESERVED_GAP_CLASS,
  HEADING_COLLAPSE_KEY_ATTRIBUTE,
  getCollapsedHeadingKeyForEnter,
  headingCollapsePlugin,
} from './heading-collapse-plugin'
import { getHeadingCollapseBlocksFromDoc } from './heading-outline'

function docForBlocks(blocks: Array<{ type: string; text?: string; level?: number; size?: number }>) {
  return {
    forEach(callback: (node: unknown, offset: number) => void) {
      let offset = 0
      blocks.forEach((block) => {
        const nodeSize = block.size ?? Math.max(2, (block.text ?? '').length + 2)
        callback(
          {
            type: { name: block.type },
            attrs: block.level ? { level: block.level } : {},
            textContent: block.text ?? '',
            nodeSize,
          },
          offset,
        )
        offset += nodeSize
      })
    },
  }
}

function firstHeadingKey(doc: unknown) {
  return getHeadingCollapseBlocksFromDoc('aisle-a', doc).find((block) => block.heading)?.heading?.key ?? ''
}

function stateWithSelection(options: {
  doc: unknown
  empty?: boolean
  parentType?: string
  from?: number
  to?: number
  pos?: number
}) {
  const from = options.from ?? 0
  const to = options.to ?? 8
  return {
    doc: options.doc,
    selection: {
      empty: options.empty ?? true,
      $from: {
        pos: options.pos ?? from + 1,
        depth: 1,
        parent: { type: { name: options.parentType ?? 'heading' } },
        before: () => from,
        after: () => to,
      },
    },
  }
}

function plainEnterEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: 'Enter',
    code: 'Enter',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  } as KeyboardEvent
}

function installPointerDomGlobals(headingKey: string) {
  vi.useFakeTimers()

  class FakeTextNode {}
  class FakeHeadingElement {
    closest() {
      return this
    }

    getAttribute(attribute: string) {
      return attribute === HEADING_COLLAPSE_KEY_ATTRIBUTE ? headingKey : null
    }
  }

  const heading = new FakeHeadingElement()
  const root = {
    contains: (candidate: unknown) => candidate === heading,
  }

  vi.stubGlobal('Element', FakeHeadingElement)
  vi.stubGlobal('HTMLElement', FakeHeadingElement)
  vi.stubGlobal('Text', FakeTextNode)
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  })

  return {
    heading: heading as unknown as HTMLElement,
    root: root as HTMLElement,
  }
}

function pointerEvent(target: EventTarget, overrides: Partial<PointerEvent> = {}) {
  return {
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    pointerId: 1,
    clientX: 12,
    clientY: 18,
    target,
    ...overrides,
  } as PointerEvent
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

class FakePlugin {
  spec: Record<string, unknown>

  constructor(spec: Record<string, unknown>) {
    this.spec = spec
  }
}

function buildPlugin(options: {
  collapsedKeys: ReadonlySet<string>
  markdown?: string
  onExpandHeading: (aisleId: string, headingKey: string) => void
  onToggleHeading?: (aisleId: string, headingKey: string) => void
}) {
  const plugin = headingCollapsePlugin(
    {
      pmState: {
        Plugin: FakePlugin,
      },
      pmView: {
        Decoration: {
          node: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => ({
            from,
            to,
            attrs,
            spec,
          }),
        },
        DecorationSet: {
          create: (_doc: unknown, decorations: unknown[]) => decorations,
        },
      },
    },
    {
      aisleId: 'aisle-a',
      getCollapsedHeadingKeys: () => options.collapsedKeys,
      getMarkdown: () => options.markdown ?? '',
      onToggleHeading: options.onToggleHeading ?? (() => undefined),
      onExpandHeading: options.onExpandHeading,
    },
  ).wysiwygPlugins[0]() as FakePlugin

  return plugin.spec.props as {
    decorations: (state: { doc: unknown }) => Array<{
      attrs?: Record<string, string>
    }>
    handleDOMEvents: {
      keydown: (view: { state: ReturnType<typeof stateWithSelection> }, event: KeyboardEvent) => boolean
      pointerdown: (view: { dom: HTMLElement }, event: PointerEvent) => boolean
      pointermove: (view: unknown, event: PointerEvent) => boolean
      pointerup: (view: unknown, event: PointerEvent) => boolean
    }
  }
}

describe('heading collapse plugin', () => {
  it('finds the collapsed heading key for plain Enter when the caret is in a collapsed heading', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'body', size: 6 },
    ])
    const headingKey = firstHeadingKey(doc)

    expect(
      getCollapsedHeadingKeyForEnter(
        stateWithSelection({ doc, from: 0, to: 9, pos: 2 }),
        'aisle-a',
        new Set([headingKey]),
      ),
    ).toBe(headingKey)
  })

  it('finds the collapsed heading key when the caret is visually after the collapsed heading', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'body', size: 6 },
    ])
    const headingKey = firstHeadingKey(doc)

    expect(
      getCollapsedHeadingKeyForEnter(
        {
          doc,
          selection: {
            empty: true,
            $from: {
              pos: 9,
              depth: 0,
              parent: { type: { name: 'doc' } },
            },
          },
        },
        'aisle-a',
        new Set([headingKey]),
      ),
    ).toBe(headingKey)
  })

  it('ignores Enter outside a currently collapsed heading', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'body', size: 6 },
    ])

    expect(getCollapsedHeadingKeyForEnter(stateWithSelection({ doc, from: 0, to: 9 }), 'aisle-a', new Set())).toBeNull()
    expect(
      getCollapsedHeadingKeyForEnter(
        stateWithSelection({ doc, parentType: 'paragraph', from: 9, to: 15, pos: 10 }),
        'aisle-a',
        new Set([firstHeadingKey(doc)]),
      ),
    ).toBeNull()
    expect(
      getCollapsedHeadingKeyForEnter(
        stateWithSelection({ doc, empty: false, from: 0, to: 9 }),
        'aisle-a',
        new Set([firstHeadingKey(doc)]),
      ),
    ).toBeNull()
    expect(
      getCollapsedHeadingKeyForEnter(stateWithSelection({ doc, from: 0, to: 9 }), 'aisle-a', new Set(['missing'])),
    ).toBeNull()
  })

  it('expands on plain Enter without consuming the editor Enter behavior', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'body', size: 6 },
    ])
    const headingKey = firstHeadingKey(doc)
    const expandCalls: string[][] = []
    const toggleCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set([headingKey]),
      onExpandHeading: (aisleId, key) => expandCalls.push([aisleId, key]),
      onToggleHeading: (aisleId, key) => toggleCalls.push([aisleId, key]),
    })

    const handled = props.handleDOMEvents.keydown(
      { state: stateWithSelection({ doc, from: 0, to: 9 }) },
      plainEnterEvent(),
    )

    expect(handled).toBe(false)
    expect(expandCalls).toEqual([['aisle-a', headingKey]])
    expect(toggleCalls).toEqual([])
  })

  it('leaves modified Enter shortcuts untouched', () => {
    const doc = docForBlocks([{ type: 'heading', text: 'Subject', level: 2, size: 9 }])
    const expandCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set([firstHeadingKey(doc)]),
      onExpandHeading: (aisleId, key) => expandCalls.push([aisleId, key]),
    })

    const handled = props.handleDOMEvents.keydown(
      { state: stateWithSelection({ doc, from: 0, to: 9 }) },
      plainEnterEvent({ shiftKey: true }),
    )

    expect(handled).toBe(false)
    expect(expandCalls).toEqual([])
  })

  it('toggles a heading after a primary left-pointer long press', () => {
    const doc = docForBlocks([{ type: 'heading', text: 'Subject', level: 2, size: 9 }])
    const headingKey = firstHeadingKey(doc)
    const toggleCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set(),
      onExpandHeading: () => undefined,
      onToggleHeading: (aisleId, key) => toggleCalls.push([aisleId, key]),
    })
    const { root, heading } = installPointerDomGlobals(headingKey)

    const handled = props.handleDOMEvents.pointerdown({ dom: root }, pointerEvent(heading))
    vi.advanceTimersByTime(499)

    expect(handled).toBe(false)
    expect(toggleCalls).toEqual([])

    vi.advanceTimersByTime(1)

    expect(toggleCalls).toEqual([['aisle-a', headingKey]])
  })

  it('cancels heading collapse when the pointer is released before the long press', () => {
    const doc = docForBlocks([{ type: 'heading', text: 'Subject', level: 2, size: 9 }])
    const headingKey = firstHeadingKey(doc)
    const toggleCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set(),
      onExpandHeading: () => undefined,
      onToggleHeading: (aisleId, key) => toggleCalls.push([aisleId, key]),
    })
    const { root, heading } = installPointerDomGlobals(headingKey)

    props.handleDOMEvents.pointerdown({ dom: root }, pointerEvent(heading))
    vi.advanceTimersByTime(250)
    props.handleDOMEvents.pointerup(null, pointerEvent(heading))
    vi.advanceTimersByTime(500)

    expect(toggleCalls).toEqual([])
  })

  it('cancels heading collapse when pointer movement exceeds the long-press threshold', () => {
    const doc = docForBlocks([{ type: 'heading', text: 'Subject', level: 2, size: 9 }])
    const headingKey = firstHeadingKey(doc)
    const toggleCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set(),
      onExpandHeading: () => undefined,
      onToggleHeading: (aisleId, key) => toggleCalls.push([aisleId, key]),
    })
    const { root, heading } = installPointerDomGlobals(headingKey)

    props.handleDOMEvents.pointerdown({ dom: root }, pointerEvent(heading))
    props.handleDOMEvents.pointermove(null, pointerEvent(heading, { clientX: 19, clientY: 18 }))
    vi.advanceTimersByTime(500)

    expect(toggleCalls).toEqual([])
  })

  it('ignores modified and non-primary heading pointer presses', () => {
    const doc = docForBlocks([{ type: 'heading', text: 'Subject', level: 2, size: 9 }])
    const headingKey = firstHeadingKey(doc)
    const toggleCalls: string[][] = []
    const props = buildPlugin({
      collapsedKeys: new Set(),
      onExpandHeading: () => undefined,
      onToggleHeading: (aisleId, key) => toggleCalls.push([aisleId, key]),
    })
    const { root, heading } = installPointerDomGlobals(headingKey)

    props.handleDOMEvents.pointerdown({ dom: root }, pointerEvent(heading, { metaKey: true }))
    props.handleDOMEvents.pointerdown({ dom: root }, pointerEvent(heading, { button: 2 }))
    vi.advanceTimersByTime(500)

    expect(toggleCalls).toEqual([])
  })

  it('preserves markdown blank-line gaps before the boundary heading', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'some text', size: 11 },
      { type: 'heading', text: 'Different subject', level: 2, size: 19 },
    ])
    const blocks = getHeadingCollapseBlocksFromDoc('aisle-a', doc)
    const subjectKey = blocks[0].heading?.key ?? ''
    const boundaryKey = blocks[2].heading?.key ?? ''
    const props = buildPlugin({
      collapsedKeys: new Set([subjectKey]),
      markdown: '## Subject\nsome text\n\n\n## Different subject',
      onExpandHeading: () => undefined,
    })

    const decorations = props.decorations({ doc })
    const boundaryDecoration = decorations.find((decoration) => decoration.attrs?.[HEADING_COLLAPSE_KEY_ATTRIBUTE] === boundaryKey)

    expect(boundaryDecoration?.attrs?.class).toContain(HEADING_COLLAPSE_PRESERVED_GAP_CLASS)
    expect(boundaryDecoration?.attrs?.style).toBe('--aislenote-heading-preserved-gap-lines: 2')
  })

  it('does not add a markdown gap when blank paragraph nodes already remain visible', () => {
    const doc = docForBlocks([
      { type: 'heading', text: 'Subject', level: 2, size: 9 },
      { type: 'paragraph', text: 'some text', size: 11 },
      { type: 'paragraph', text: '', size: 2 },
      { type: 'heading', text: 'Different subject', level: 2, size: 19 },
    ])
    const blocks = getHeadingCollapseBlocksFromDoc('aisle-a', doc)
    const props = buildPlugin({
      collapsedKeys: new Set([blocks[0].heading?.key ?? '']),
      markdown: '## Subject\nsome text\n\n\n## Different subject',
      onExpandHeading: () => undefined,
    })

    const decorations = props.decorations({ doc })
    const boundaryDecoration = decorations.find(
      (decoration) => decoration.attrs?.[HEADING_COLLAPSE_KEY_ATTRIBUTE] === blocks[3].heading?.key,
    )

    expect(boundaryDecoration?.attrs?.class).not.toContain(HEADING_COLLAPSE_PRESERVED_GAP_CLASS)
    expect(boundaryDecoration?.attrs?.style).toBeUndefined()
  })
})
