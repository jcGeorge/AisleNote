import { describe, expect, it } from 'vitest'
import { isEditorToolbarInteractionTarget } from './useEditorDomEvents'

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
})
