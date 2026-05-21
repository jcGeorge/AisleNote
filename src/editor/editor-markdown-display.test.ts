import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'
import {
  getEditorMarkdownForPersistence,
  restoreEditorBlankParagraphs,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'

function textBlock(typeName: string, textContent = '') {
  return {
    type: { name: typeName },
    textContent,
    childCount: textContent ? 1 : 0,
    child: () => ({ isText: true, text: textContent, textContent }),
  }
}

function fakeEditorWithBlocks(blocks: any[]) {
  const replaceWith = vi.fn(function replaceWith(_from: number, _to: number, nodes: any[]) {
    tr.replacedWith = nodes
    return tr
  })
  const setMeta = vi.fn(function setMeta(key: string, value: unknown) {
    tr.meta[key] = value
    return tr
  })
  const tr: any = {
    meta: {},
    replacedWith: null,
    replaceWith,
    setMeta,
  }
  const dispatch = vi.fn()
  const editor = {
    setMarkdown: vi.fn(),
    wwEditor: {
      view: {
        dispatch,
        state: {
          schema: {
            nodes: {
              paragraph: {
                create: () => textBlock('paragraph'),
              },
            },
          },
          tr,
          doc: {
            content: { size: blocks.length },
            forEach: (visitor: (node: any) => void) => blocks.forEach(visitor),
          },
        },
      },
    },
  } as unknown as Editor

  return { editor, tr, dispatch }
}

describe('editor markdown display helpers', () => {
  it('normalizes persisted markdown through the canonical editor gateway', () => {
    const editor = {
      getMarkdown: vi.fn(() => '<mark>text</mark>\n\nplain\u2003\u2003indent'),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('==text==\n\nplain\u2060\u2003\u2003indent')
  })

  it('passes markdown without blank sentinels to Toast UI and restores blank paragraphs in ProseMirror', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph', 'two'),
    ])

    setEditorMarkdownForDisplay(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)

    expect(editor.setMarkdown).toHaveBeenCalledWith('one\n\ntwo', false)
    expect(tr.replacedWith.map((node: any) => node.textContent)).toEqual(['one', '', 'two'])
    expect(tr.meta.addToHistory).toBe(false)
    expect(dispatch).toHaveBeenCalled()
  })

  it('does not restore blank paragraphs when content block counts do not match', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([textBlock('paragraph', 'one')])

    expect(restoreEditorBlankParagraphs(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
