import { describe, expect, it } from 'vitest'
import {
  applyBulletListMarkerToHtmlToken,
  createBulletListAttrs,
  DASH_LIST_CLASS_NAME,
  DASH_LIST_MARKER_ATTR,
  DASH_LIST_MARKER_VALUE,
  getBulletListMarkdownDelimiter,
  getBulletListMarkerFromAttrs,
  getBulletListMarkerFromMarkdownChar,
  setBulletListMarkerAttrs,
} from './list-markers'

describe('bullet list markers', () => {
  it('maps markdown marker characters to app list styles', () => {
    expect(getBulletListMarkerFromMarkdownChar('-')).toBe('dash')
    expect(getBulletListMarkerFromMarkdownChar('*')).toBe('bullet')
    expect(getBulletListMarkerFromMarkdownChar('+')).toBe('bullet')
  })

  it('serializes dash lists with hyphens and bullet lists with asterisks', () => {
    expect(getBulletListMarkdownDelimiter(createBulletListAttrs('dash'))).toBe('-')
    expect(getBulletListMarkdownDelimiter(createBulletListAttrs('bullet'))).toBe('*')
  })

  it('adds and removes dash marker attrs without dropping unrelated attrs', () => {
    const dashAttrs = setBulletListMarkerAttrs(
      {
        rawHTML: null,
        htmlAttrs: { role: 'list' },
        classNames: ['existing-list'],
      },
      'dash',
    )

    expect(getBulletListMarkerFromAttrs(dashAttrs)).toBe('dash')
    expect(dashAttrs?.htmlAttrs).toEqual({
      role: 'list',
      [DASH_LIST_MARKER_ATTR]: DASH_LIST_MARKER_VALUE,
    })
    expect(dashAttrs?.classNames).toEqual(['existing-list', DASH_LIST_CLASS_NAME])

    const bulletAttrs = setBulletListMarkerAttrs(dashAttrs, 'bullet')
    expect(getBulletListMarkerFromAttrs(bulletAttrs)).toBe('bullet')
    expect(bulletAttrs?.htmlAttrs).toEqual({ role: 'list' })
    expect(bulletAttrs?.classNames).toEqual(['existing-list'])
  })

  it('adds dash marker attrs to Toast UI list open tags', () => {
    const token = applyBulletListMarkerToHtmlToken(
      {
        type: 'openTag',
        tagName: 'ul',
        attributes: { role: 'list' },
        classNames: ['existing-list'],
      },
      'dash',
    )

    expect(token).toEqual({
      type: 'openTag',
      tagName: 'ul',
      attributes: {
        role: 'list',
        [DASH_LIST_MARKER_ATTR]: DASH_LIST_MARKER_VALUE,
      },
      classNames: ['existing-list', DASH_LIST_CLASS_NAME],
    })
  })
})
