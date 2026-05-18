import { describe, expect, it } from 'vitest'
import {
  getEditorPageMovementForEvent,
  getMultiLineDeleteInputForBeforeInputType,
  isActiveWysiwygEditorContentTarget,
  isEditorToolbarInteractionTarget,
} from './useEditorDomEvents'

function fakeTarget(matchedSelector: string | null): Element {
  return {
    closest: (selector: string) => (matchedSelector && selector.includes(matchedSelector) ? {} : null),
  } as Element
}

describe('editor DOM events', () => {
  it.each([
    '.note-shared-toolbar',
    '.note-toolbar-heading-popover',
    '.note-toolbar-aisle-popover',
    '.toastui-editor-defaultUI-toolbar',
    '.toastui-editor-toolbar',
    '.toastui-editor-toolbar-icons',
    '.toastui-editor-tooltip',
  ])('treats %s as toolbar interaction target', (selector) => {
    expect(isEditorToolbarInteractionTarget(fakeTarget(selector))).toBe(true)
  })

  it('does not treat normal editor content as a toolbar interaction target', () => {
    expect(isEditorToolbarInteractionTarget(fakeTarget(null))).toBe(false)
    expect(isEditorToolbarInteractionTarget(null)).toBe(false)
  })

  it('maps beforeinput delete events to multi-cursor delete inputs', () => {
    expect(getMultiLineDeleteInputForBeforeInputType('deleteContentForward')).toEqual({ type: 'delete' })
    expect(getMultiLineDeleteInputForBeforeInputType('deleteContentBackward')).toEqual({ type: 'backspace' })
    expect(getMultiLineDeleteInputForBeforeInputType('insertText')).toBeNull()
  })

  it('normalizes page up and page down keyboard events', () => {
    expect(getEditorPageMovementForEvent({ key: 'PageUp', code: '' } as KeyboardEvent)).toBe('page-up')
    expect(getEditorPageMovementForEvent({ key: '', code: 'PageDown' } as KeyboardEvent)).toBe('page-down')
  })

  it('normalizes detectable Fn arrow page movement without hijacking plain arrows', () => {
    const fnUp = {
      key: 'ArrowUp',
      code: 'ArrowUp',
      getModifierState: (modifier: string) => modifier === 'Fn',
    } as unknown as KeyboardEvent
    const fnDown = {
      key: 'ArrowDown',
      code: 'ArrowDown',
      getModifierState: (modifier: string) => modifier === 'Fn',
    } as unknown as KeyboardEvent
    const plainUp = {
      key: 'ArrowUp',
      code: 'ArrowUp',
      getModifierState: () => false,
    } as unknown as KeyboardEvent

    expect(getEditorPageMovementForEvent(fnUp)).toBe('page-up')
    expect(getEditorPageMovementForEvent(fnDown)).toBe('page-down')
    expect(getEditorPageMovementForEvent(plainUp)).toBeNull()
  })

  it('routes normal page movement only from active wysiwyg editor content', () => {
    const contentTarget = { closest: () => null } as unknown as Element
    const toolbarTarget = {
      closest: (selector: string) => (selector.includes('.note-shared-toolbar') ? {} : null),
    } as unknown as Element
    const outsideTarget = { closest: () => null } as unknown as Element
    const view = {
      dom: {
        contains: (target: Element) => target === contentTarget,
      },
    }

    expect(isActiveWysiwygEditorContentTarget(contentTarget, view)).toBe(true)
    expect(isActiveWysiwygEditorContentTarget(toolbarTarget, view)).toBe(false)
    expect(isActiveWysiwygEditorContentTarget(outsideTarget, view)).toBe(false)
    expect(isActiveWysiwygEditorContentTarget(null, view)).toBe(false)
  })
})
