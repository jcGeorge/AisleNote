import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_LINE_CLASS_NAME,
  ANNOTATION_LINE_MARKER_CLASS_NAME,
  applyAnnotationLineClassToHtmlToken,
  applyAnnotationMarkerToTextHtmlToken,
  parseAnnotationLine,
} from './annotation-line'
import { isHorizontalRuleMarkerLine } from '../markdown/markdown-utils'

describe('annotation line detection', () => {
  it('matches double dash annotation paragraphs', () => {
    expect(parseAnnotationLine('-- text')).toMatchObject({
      indent: '',
      markerStart: 0,
      markerEnd: 2,
      prefixEnd: 3,
      content: 'text',
    })
    expect(parseAnnotationLine('  -- text')).toMatchObject({
      indent: '  ',
      markerStart: 2,
      markerEnd: 4,
      prefixEnd: 5,
      content: 'text',
    })
    expect(parseAnnotationLine('-- ')).toMatchObject({
      markerStart: 0,
      markerEnd: 2,
      prefixEnd: 3,
      content: '',
    })
  })

  it('does not match dash lists, inline dashes, tight double dashes, or horizontal rules', () => {
    expect(parseAnnotationLine('- text')).toBeNull()
    expect(parseAnnotationLine('--text')).toBeNull()
    expect(parseAnnotationLine('---')).toBeNull()
    expect(parseAnnotationLine('hello -- text')).toBeNull()
    expect(isHorizontalRuleMarkerLine('-- text')).toBe(false)
  })
})

describe('annotation line html helpers', () => {
  it('adds the annotation class to paragraph open tokens', () => {
    const token = applyAnnotationLineClassToHtmlToken({
      type: 'openTag',
      tagName: 'p',
      classNames: ['existing'],
    }) as { classNames: string[] }

    expect(token.classNames).toEqual(['existing', ANNOTATION_LINE_CLASS_NAME])
  })

  it('wraps the canonical marker in the rendered text token', () => {
    const parent: { type: string; firstChild?: unknown } = { type: 'paragraph' }
    const node = { literal: '-- note', parent }
    parent.firstChild = node

    const tokens = applyAnnotationMarkerToTextHtmlToken(node, {
      type: 'text',
      content: '-- note',
    }) as Array<{ type: string; tagName?: string; classNames?: string[]; content?: string }>

    expect(tokens[0]).toMatchObject({
      type: 'openTag',
      tagName: 'span',
      classNames: [ANNOTATION_LINE_MARKER_CLASS_NAME],
    })
    expect(tokens[1]).toMatchObject({ type: 'text', content: '-- ' })
    expect(tokens[3]).toMatchObject({ type: 'text', content: 'note' })
  })
})
