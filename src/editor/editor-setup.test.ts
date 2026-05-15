import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { shouldDeleteEmptyParagraphAtListBoundary } from './empty-paragraph-list-delete'
import { getActiveHeadingLevel, getParagraphSpaceShortcut } from './editor-setup'

function node(typeName: string, textContent = '', contentSize = 0) {
  return {
    type: { name: typeName },
    textContent,
    content: { size: contentSize },
  }
}

describe('empty paragraph list boundary delete guard', () => {
  it('handles Backspace from an empty paragraph after a list', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph'),
        previousNode: node('bulletList'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(true)
  })

  it('handles forward Delete from an empty paragraph before a list', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph', '', 0),
        nextNode: node('orderedList'),
        parentOffset: 0,
        direction: 'forward',
      }),
    ).toBe(true)
  })

  it('leaves text paragraphs and non-list neighbors alone', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph', 'text', 4),
        previousNode: node('bulletList'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(false)
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph'),
        previousNode: node('heading'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(false)
  })
})

function editorWithSelectionParent(typeName: string, attrs: Record<string, unknown> = {}) {
  const parent = {
    type: { name: typeName },
    attrs,
  }

  return {
    wwEditor: {
      view: {
        state: {
          selection: {
            $from: { parent },
            $to: { parent },
          },
        },
      },
    },
  } as unknown as Editor
}

describe('active heading level detection', () => {
  it('returns the active heading level at a collapsed heading cursor', () => {
    expect(getActiveHeadingLevel(editorWithSelectionParent('heading', { level: 3 }))).toBe(3)
  })

  it('returns 0 when the cursor is in a paragraph', () => {
    expect(getActiveHeadingLevel(editorWithSelectionParent('paragraph'))).toBe(0)
  })
})

describe('paragraph space shortcuts', () => {
  it('requires a bare greater-than marker before Space for block quotes', () => {
    expect(getParagraphSpaceShortcut('>')).toEqual({ kind: 'blockQuote' })
    expect(getParagraphSpaceShortcut('  >')).toEqual({ kind: 'blockQuote' })
    expect(getParagraphSpaceShortcut('>>')).toBeNull()
    expect(getParagraphSpaceShortcut('> quote')).toBeNull()
    expect(getParagraphSpaceShortcut('hello >')).toBeNull()
  })

  it('keeps existing heading and list markers', () => {
    expect(getParagraphSpaceShortcut('###')).toEqual({ kind: 'heading', level: 3 })
    expect(getParagraphSpaceShortcut('-')).toEqual({ kind: 'dashList' })
    expect(getParagraphSpaceShortcut('*')).toEqual({ kind: 'bulletList' })
    expect(getParagraphSpaceShortcut('2.')).toEqual({ kind: 'numberedList', order: 2 })
  })
})
