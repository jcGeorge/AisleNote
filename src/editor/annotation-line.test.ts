import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_LINE_CLASS_NAME,
  ANNOTATION_LINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
  ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
  ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
  ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
  ANNOTATION_INLINE_ARROW_CLASS_NAME,
  applyAnnotationLineClassToHtmlToken,
  applyAnnotationMarkerToTextHtmlToken,
  getAnnotationInlineArrowClassNames,
  getAnnotationLineClassNames,
  parseAnnotationLine,
  parseAnnotationLineMarkers,
} from './annotation-line'
import { isHorizontalRuleMarkerLine } from '../markdown/markdown-utils'

describe('annotation line detection', () => {
  it('matches double dash annotation paragraphs', () => {
    expect(parseAnnotationLine('-- text')).toMatchObject({
      indent: '',
      marker: { kind: 'line', raw: '--' },
      markerStart: 0,
      markerEnd: 2,
      prefixEnd: 3,
      content: 'text',
    })
    expect(parseAnnotationLine('  -- text')).toMatchObject({
      indent: '  ',
      marker: { kind: 'line', raw: '--' },
      markerStart: 2,
      markerEnd: 4,
      prefixEnd: 5,
      content: 'text',
    })
    expect(parseAnnotationLine('-- ')).toMatchObject({
      marker: { kind: 'line', raw: '--' },
      markerStart: 0,
      markerEnd: 2,
      prefixEnd: 3,
      content: '',
    })
    expect(parseAnnotationLine('--  text')).toMatchObject({
      marker: { kind: 'line', raw: '--' },
      markerStart: 0,
      markerEnd: 2,
      prefixEnd: 4,
      content: 'text',
    })
  })

  it('does not match dash lists, inline dashes, tight double dashes, or horizontal rules', () => {
    expect(parseAnnotationLine('- text')).toBeNull()
    expect(parseAnnotationLine('--')).toBeNull()
    expect(parseAnnotationLine('--text')).toBeNull()
    expect(parseAnnotationLine('---')).toBeNull()
    expect(parseAnnotationLine('hello -- text')).toBeNull()
    expect(isHorizontalRuleMarkerLine('-- text')).toBe(false)
  })

  it('matches arrow annotation markers', () => {
    expect(parseAnnotationLine('^-- text')).toMatchObject({
      marker: { kind: 'arrow', raw: '^--', arrowDirection: 'up', tailDirection: 'right' },
      markerStart: 0,
      markerEnd: 3,
      markerRemovalStart: 0,
      markerRemovalEnd: 4,
      prefixEnd: 4,
      content: 'text',
    })
    expect(parseAnnotationLine('--^ text')).toMatchObject({
      marker: { kind: 'arrow', raw: '--^', arrowDirection: 'up', tailDirection: 'left' },
      content: 'text',
    })
    expect(parseAnnotationLine('v-- text')).toMatchObject({
      marker: { kind: 'arrow', raw: 'v--', arrowDirection: 'down', tailDirection: 'right' },
      content: 'text',
    })
    expect(parseAnnotationLine('--v text')).toMatchObject({
      marker: { kind: 'arrow', raw: '--v', arrowDirection: 'down', tailDirection: 'left' },
      content: 'text',
    })
  })

  it('matches arrow annotation markers anywhere in a paragraph', () => {
    const cases = [
      ['asdf ^--', '^--', 'up', 'right'],
      ['asdf --^', '--^', 'up', 'left'],
      ['asdf v--', 'v--', 'down', 'right'],
      ['asdf --v', '--v', 'down', 'left'],
      ['j ^--', '^--', 'up', 'right'],
      ['j --^', '--^', 'up', 'left'],
      ['j v--', 'v--', 'down', 'right'],
      ['j --v', '--v', 'down', 'left'],
    ] as const

    cases.forEach(([source, raw, arrowDirection, tailDirection]) => {
      expect(parseAnnotationLine(source)).toMatchObject({
        marker: { kind: 'arrow', raw, arrowDirection, tailDirection },
        markerStart: source.length - raw.length,
        markerEnd: source.length,
        markerRemovalStart: source.length - raw.length - 1,
        markerRemovalEnd: source.length,
        content: source.slice(0, source.length - raw.length - 1),
      })
    })

    const middleCases = [
      ['^--', 'up', 'right'],
      ['--^', 'up', 'left'],
      ['v--', 'down', 'right'],
      ['--v', 'down', 'left'],
    ] as const

    middleCases.forEach(([raw, arrowDirection, tailDirection]) => {
      expect(parseAnnotationLine(`one ${raw} two`)).toMatchObject({
        marker: { kind: 'arrow', raw, arrowDirection, tailDirection },
        markerStart: 4,
        markerEnd: 7,
        markerRemovalStart: 4,
        markerRemovalEnd: 8,
        content: 'one two',
      })
    })

    expect(parseAnnotationLine('one ^-- two --v three')).toMatchObject({
      marker: { kind: 'arrow', raw: '^--', arrowDirection: 'up', tailDirection: 'right' },
      markerStart: 4,
      content: 'one two --v three',
    })
  })

  it('allows standalone arrow annotation markers', () => {
    const cases = [
      ['^--', 'up', 'right'],
      ['--^', 'up', 'left'],
      ['v--', 'down', 'right'],
      ['--v', 'down', 'left'],
    ] as const

    cases.forEach(([raw, arrowDirection, tailDirection]) => {
      expect(parseAnnotationLine(raw)).toMatchObject({
        marker: { kind: 'arrow', raw, arrowDirection, tailDirection },
        prefixEnd: 3,
        content: '',
      })
    })
  })

  it('finds every arrow marker without treating regular dash annotations as inline markers', () => {
    expect(parseAnnotationLineMarkers('one --^ two v-- three').map((match) => match.marker.raw)).toEqual([
      '--^',
      'v--',
    ])

    expect(parseAnnotationLineMarkers('-- text')).toHaveLength(1)
    expect(parseAnnotationLineMarkers('hello -- text')).toHaveLength(0)
  })
})

describe('annotation line html helpers', () => {
  const inlineArrowTokens = (directionClassName: string, tailClassName: string) => [
    {
      type: 'openTag',
      tagName: 'span',
      classNames: [
        ANNOTATION_INLINE_ARROW_CLASS_NAME,
        ANNOTATION_LINE_ARROW_CLASS_NAME,
        directionClassName,
        tailClassName,
      ],
      attributes: { 'aria-hidden': 'true' },
    },
    { type: 'closeTag', tagName: 'span' },
  ]

  it('adds the annotation class to paragraph open tokens', () => {
    const token = applyAnnotationLineClassToHtmlToken({
      type: 'openTag',
      tagName: 'p',
      classNames: ['existing'],
    }) as { classNames: string[] }

    expect(token.classNames).toEqual(['existing', ANNOTATION_LINE_CLASS_NAME])
  })

  it('adds arrow annotation classes to paragraph open tokens', () => {
    const match = parseAnnotationLine('^-- note')
    expect(match).not.toBeNull()

    const token = applyAnnotationLineClassToHtmlToken({
      type: 'openTag',
      tagName: 'p',
      classNames: ['existing'],
    }, match) as { classNames: string[] }

    expect(token.classNames).toEqual([
      'existing',
      ANNOTATION_LINE_CLASS_NAME,
      ANNOTATION_LINE_ARROW_CLASS_NAME,
      ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
      ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
    ])
  })

  it('builds directional class names for arrow annotation lines', () => {
    const cases = [
      ['^-- note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['--^ note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['v-- note', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['--v note', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
    ] as const

    cases.forEach(([source, directionClassName, tailClassName]) => {
      const match = parseAnnotationLine(source)
      expect(match ? getAnnotationLineClassNames(match) : []).toEqual([
        ANNOTATION_LINE_CLASS_NAME,
        ANNOTATION_LINE_ARROW_CLASS_NAME,
        directionClassName,
        tailClassName,
      ])
    })
  })

  it('builds directional class names for inline arrow markers', () => {
    const match = parseAnnotationLine('--^ note')
    expect(match).not.toBeNull()
    expect(match ? getAnnotationInlineArrowClassNames(match) : []).toEqual([
      ANNOTATION_INLINE_ARROW_CLASS_NAME,
      ANNOTATION_LINE_ARROW_CLASS_NAME,
      ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
      ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
    ])
  })

  it('removes the canonical marker from the rendered text token', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: '-- note', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: '-- note',
    }) as Array<{ type: string; tagName?: string; classNames?: string[]; content?: string }>

    expect(tokens).toEqual([{ type: 'text', content: 'note' }])
  })

  it('replaces arrow markers with rendered inline arrow tokens', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: '--^ note', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: '--^ note',
    }) as Array<{ type: string; content?: string }>

    expect(tokens).toEqual([
      ...inlineArrowTokens(ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME),
      { type: 'text', content: ' note' },
    ])
  })

  it('replaces suffix arrow markers without moving them', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: 'asdf --^', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: 'asdf --^',
    }) as Array<{ type: string; content?: string }>

    expect(tokens).toEqual([
      { type: 'text', content: 'asdf ' },
      ...inlineArrowTokens(ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME),
    ])
  })

  it('replaces middle arrow markers without collapsing paragraph text', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: 'one --v two', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: 'one --v two',
    }) as Array<{ type: string; content?: string }>

    expect(tokens).toEqual([
      { type: 'text', content: 'one ' },
      ...inlineArrowTokens(ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME),
      { type: 'text', content: ' two' },
    ])
  })

  it('replaces multiple arrow markers from rendered text tokens without moving them', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: 'one --^ two v-- three', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: 'one --^ two v-- three',
    }) as Array<{ type: string; content?: string }>

    expect(tokens).toEqual([
      { type: 'text', content: 'one ' },
      ...inlineArrowTokens(ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME),
      { type: 'text', content: ' two ' },
      ...inlineArrowTokens(ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME),
      { type: 'text', content: ' three' },
    ])
  })

  it('replaces tail-first arrow markers split across text nodes', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const first = { literal: '--', parent, next: null as unknown }
    const second = { literal: '^ note', parent }
    first.next = second
    parent.firstChild = first

    const firstTokens = applyAnnotationMarkerToTextHtmlToken(first, {
      type: 'text',
      content: '--',
    }) as Array<{ type: string; content?: string }>
    const secondTokens = applyAnnotationMarkerToTextHtmlToken(second, {
      type: 'text',
      content: '^ note',
    }) as Array<{ type: string; content?: string }>

    expect(firstTokens).toEqual(inlineArrowTokens(
      ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
      ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
    ))
    expect(secondTokens).toEqual([{ type: 'text', content: ' note' }])
  })

  it('replaces down tail-first arrow markers split across text nodes', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const first = { literal: '--', parent, next: null as unknown }
    const second = { literal: 'v note', parent }
    first.next = second
    parent.firstChild = first

    const firstTokens = applyAnnotationMarkerToTextHtmlToken(first, {
      type: 'text',
      content: '--',
    }) as Array<{ type: string; content?: string }>
    const secondTokens = applyAnnotationMarkerToTextHtmlToken(second, {
      type: 'text',
      content: 'v note',
    }) as Array<{ type: string; content?: string }>

    expect(firstTokens).toEqual(inlineArrowTokens(
      ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
      ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
    ))
    expect(secondTokens).toEqual([{ type: 'text', content: ' note' }])
  })

  it('replaces suffix tail-first arrow markers split across text nodes', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const first = { literal: 'asdf ', parent, next: null as unknown }
    const second = { literal: '--^', parent }
    first.next = second
    parent.firstChild = first

    const firstTokens = applyAnnotationMarkerToTextHtmlToken(first, {
      type: 'text',
      content: 'asdf ',
    }) as { type: string; content?: string }
    const secondTokens = applyAnnotationMarkerToTextHtmlToken(second, {
      type: 'text',
      content: '--^',
    }) as Array<{ type: string; content?: string }>

    expect(firstTokens).toEqual({ type: 'text', content: 'asdf ' })
    expect(secondTokens).toEqual(inlineArrowTokens(
      ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
      ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
    ))
  })

  it('replaces standalone arrow markers from rendered text tokens', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: '^--', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: '^--',
    }) as Array<{ type: string; content?: string }>

    expect(tokens).toEqual(inlineArrowTokens(
      ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
      ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
    ))
  })
})
