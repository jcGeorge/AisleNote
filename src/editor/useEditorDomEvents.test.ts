import { describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  applyPreviewForwardDeleteBeforeInput,
  getPastedHttpUrl,
  getPastedUrlLink,
  getEditorPageMovementForEvent,
  getMultiLineDeleteInputForBeforeInputType,
  getInternalNoteLinkWidgetHitFromTarget,
  getPlainTextPointerChromeClosePlan,
  getTableBoundaryCaretDirectionForEvent,
  isActiveWysiwygEditorContentTarget,
  isEditorToolbarInteractionTarget,
  isEditorPointerChromeTarget,
  runEditorHistoryEvent,
  shouldSkipTableExitRepairTarget,
} from './useEditorDomEvents'
import { runEditorHistoryCommand } from './editor-command'

const previewDeleteSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
  },
})

function fakeTarget(matchedSelector: string | null): Element {
  return {
    closest: (selector: string) => (matchedSelector && selector.includes(matchedSelector) ? {} : null),
  } as Element
}

function fakeInternalLinkTarget(): Element {
  const attrs = new Map([
    ['data-internal-note-link-syntax', '[[Linked--123abc]]'],
    ['data-internal-note-link-from', '8'],
    ['data-internal-note-link-to', '26'],
    ['data-internal-note-link-occurrence', '0'],
  ])
  const anchor = {
    getAttribute: (name: string) => attrs.get(name) ?? null,
  }
  return {
    closest: (selector: string) => selector === 'a[data-internal-note-link="true"]' ? anchor : null,
  } as unknown as Element
}

describe('editor DOM events', () => {
  it.each([
    '.note-shared-toolbar',
    '.note-toolbar-heading-popover',
    '.toastui-editor-defaultUI-toolbar',
    '.toastui-editor-toolbar',
    '.toastui-editor-toolbar-icons',
    '.toastui-editor-tooltip',
    '.aisle-toc-panel',
    '.aisle-toc-panel-layer',
  ])('treats %s as toolbar interaction target', (selector) => {
    expect(isEditorToolbarInteractionTarget(fakeTarget(selector))).toBe(true)
  })

  it('does not treat normal editor content as a toolbar interaction target', () => {
    expect(isEditorToolbarInteractionTarget(fakeTarget(null))).toBe(false)
    expect(isEditorToolbarInteractionTarget(null)).toBe(false)
  })

  it('resolves internal note link hits only from the rendered link widget', () => {
    const resolve = vi.fn(() => ({
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
    }))

    expect(getInternalNoteLinkWidgetHitFromTarget(fakeTarget(null), resolve)).toBeNull()
    expect(getInternalNoteLinkWidgetHitFromTarget(fakeInternalLinkTarget(), resolve)).toMatchObject({
      label: 'Linked',
      href: '[[Linked--123abc]]',
      from: 8,
      to: 26,
      occurrence: 0,
      target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    })
  })

  it('treats editor chrome as special pointer targets outside normal text selection', () => {
    expect(isEditorPointerChromeTarget(fakeTarget('.image-tools'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.table-tools'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.table-reorder-marker'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.link-prompt'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.aisle-toc-panel'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget(null))).toBe(false)
  })

  it('skips table exit repair for interactive and table targets only', () => {
    expect(shouldSkipTableExitRepairTarget(fakeTarget('a'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('img'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('table'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.table-tools'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.image-tools'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.aisle-toc-panel'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget(null))).toBe(false)
    expect(shouldSkipTableExitRepairTarget(null)).toBe(false)
  })

  it('does not close idle editor chrome on plain text pointerdown', () => {
    expect(
      getPlainTextPointerChromeClosePlan({
        hasActiveImage: false,
        imageCropActive: false,
        linkPromptOpen: false,
      }),
    ).toEqual({ closeImageTools: false, closeLinkPrompt: false })
  })

  it('only closes active editor chrome on plain text pointerdown', () => {
    expect(
      getPlainTextPointerChromeClosePlan({
        hasActiveImage: true,
        imageCropActive: false,
        linkPromptOpen: true,
      }),
    ).toEqual({ closeImageTools: true, closeLinkPrompt: true })

    expect(
      getPlainTextPointerChromeClosePlan({
        hasActiveImage: true,
        imageCropActive: true,
        linkPromptOpen: true,
      }),
    ).toEqual({ closeImageTools: false, closeLinkPrompt: true })
  })

  it('maps beforeinput delete events to multi-cursor delete inputs', () => {
    expect(getMultiLineDeleteInputForBeforeInputType('deleteContentForward')).toEqual({ type: 'delete' })
    expect(getMultiLineDeleteInputForBeforeInputType('deleteContentBackward')).toEqual({ type: 'backspace' })
    expect(getMultiLineDeleteInputForBeforeInputType('insertText')).toBeNull()
  })

  it('routes beforeinput forward delete through preview-adjacent deletion when not multiline editing', () => {
    const preview = previewDeleteSchema.nodes.paragraph.create(null, previewDeleteSchema.text('![[Linked--123abc]]'))
    const empty = previewDeleteSchema.nodes.paragraph.create()
    const heading = previewDeleteSchema.nodes.heading.create({ level: 2 }, previewDeleteSchema.text('After'))
    const doc = previewDeleteSchema.nodes.doc.create(null, [preview, empty, heading])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, preview.nodeSize + 1),
    })
    const view = {
      state,
      dispatch: vi.fn(),
    }

    expect(applyPreviewForwardDeleteBeforeInput({
      inputType: 'deleteContentForward',
      hasMultiLineEdit: false,
      view,
    })).toBe(true)

    expect(view.dispatch).toHaveBeenCalledTimes(1)
    const nextState = state.apply(view.dispatch.mock.calls[0][0])
    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).textContent).toBe('')
    expect(nextState.doc.child(1).textContent).toBe('After')
  })

  it('does not route beforeinput preview deletion while multiline editing is active', () => {
    expect(applyPreviewForwardDeleteBeforeInput({
      inputType: 'deleteContentForward',
      hasMultiLineEdit: true,
      view: { dispatch: vi.fn() },
    })).toBe(false)
  })

  it('prioritizes editor history before aisle structural history inside the editor', () => {
    const onRunStructuralHistory = vi.fn(() => true)
    const onRunEditorHistory = vi.fn(() => 'applied' as const)

    expect(runEditorHistoryEvent({
      direction: 'undo',
      onRunStructuralHistory,
      onRunEditorHistory,
    })).toEqual({ handled: true, result: 'applied' })
    expect(onRunStructuralHistory).not.toHaveBeenCalled()
  })

  it('can prioritize a pending structural add-aisle undo before editor history', () => {
    const onRunStructuralHistory = vi.fn(() => true)
    const onRunEditorHistory = vi.fn(() => 'applied' as const)

    expect(runEditorHistoryEvent({
      direction: 'undo',
      onRunStructuralHistory,
      onRunEditorHistory,
      shouldRunStructuralHistoryBeforeEditorHistory: () => true,
    })).toEqual({ handled: true, result: 'structural' })
    expect(onRunStructuralHistory).toHaveBeenCalledWith('undo')
    expect(onRunEditorHistory).not.toHaveBeenCalled()
  })

  it('falls back to editor history when preferred structural history cannot apply', () => {
    const onRunStructuralHistory = vi.fn(() => false)
    const onRunEditorHistory = vi.fn(() => 'applied' as const)

    expect(runEditorHistoryEvent({
      direction: 'undo',
      onRunStructuralHistory,
      onRunEditorHistory,
      shouldRunStructuralHistoryBeforeEditorHistory: () => true,
    })).toEqual({ handled: true, result: 'applied' })
    expect(onRunStructuralHistory).toHaveBeenCalledWith('undo')
    expect(onRunEditorHistory).toHaveBeenCalledWith('undo')
  })

  it('normalizes history command results for shared command dispatch', () => {
    expect(runEditorHistoryCommand({
      direction: 'undo',
      onRunStructuralHistory: vi.fn(() => true),
      onRunEditorHistory: vi.fn(() => 'applied' as const),
    })).toMatchObject({
      handled: true,
      commit: true,
      focusIntent: 'toolbar-command',
      historyResult: 'applied',
    })
    expect(runEditorHistoryCommand({
      direction: 'undo',
      onRunStructuralHistory: vi.fn(() => true),
      onRunEditorHistory: vi.fn(() => 'unavailable' as const),
    })).toMatchObject({
      handled: true,
      commit: false,
      preserveSelection: false,
      focusIntent: 'structural-history',
      historyResult: 'structural',
    })
  })


  it('handles blocked editor history so native undo cannot continue', () => {
    const onRunStructuralHistory = vi.fn(() => true)

    expect(runEditorHistoryEvent({
      direction: 'undo',
      onRunStructuralHistory,
      onRunEditorHistory: vi.fn(() => 'blocked' as const),
    })).toEqual({ handled: true, result: 'blocked' })
    expect(onRunStructuralHistory).not.toHaveBeenCalled()
  })

  it('leaves unavailable editor history unhandled', () => {
    expect(runEditorHistoryEvent({
      direction: 'redo',
      onRunStructuralHistory: vi.fn(() => false),
      onRunEditorHistory: vi.fn(() => 'unavailable' as const),
    })).toEqual({ handled: false, result: 'unavailable' })
  })

  it('falls back to aisle structural history when editor history is unavailable', () => {
    expect(runEditorHistoryEvent({
      direction: 'redo',
      onRunStructuralHistory: vi.fn(() => true),
      onRunEditorHistory: vi.fn(() => 'unavailable' as const),
    })).toEqual({ handled: true, result: 'structural' })
  })

  it('detects single http URLs from pasted text', () => {
    expect(getPastedHttpUrl('https://www.apheresis.org/page/ASFA_Membership')).toBe(
      'https://www.apheresis.org/page/ASFA_Membership',
    )
    expect(getPastedHttpUrl('  http://example.com/path  ')).toBe('http://example.com/path')
    expect(getPastedHttpUrl('www.apheresis.org/page/ASFA_Membership')).toBe(
      'https://www.apheresis.org/page/ASFA_Membership',
    )
    expect(getPastedHttpUrl('apheresis.org/page/ASFA_Membership')).toBe(
      'https://apheresis.org/page/ASFA_Membership',
    )
    expect(getPastedHttpUrl('example.com')).toBe('https://example.com')
    expect(getPastedHttpUrl('sub.example.org?member=true')).toBe('https://sub.example.org?member=true')
  })

  it('keeps pasted bare web addresses as the link label while adding an href protocol', () => {
    expect(getPastedUrlLink('  www.example.com/path  ')).toEqual({
      label: 'www.example.com/path',
      url: 'https://www.example.com/path',
    })
    expect(getPastedUrlLink('example.org/path')).toEqual({
      label: 'example.org/path',
      url: 'https://example.org/path',
    })
  })

  it('ignores non-url and non-http pasted text', () => {
    expect(getPastedHttpUrl('normal text')).toBeNull()
    expect(getPastedHttpUrl('ftp://example.com')).toBeNull()
    expect(getPastedHttpUrl('https://example.com one-more-token')).toBeNull()
    expect(getPastedHttpUrl('www')).toBeNull()
    expect(getPastedHttpUrl('www.example')).toBeNull()
    expect(getPastedHttpUrl('example .com')).toBeNull()
    expect(getPastedHttpUrl('example. com')).toBeNull()
    expect(getPastedHttpUrl('exam ple.com')).toBeNull()
    expect(getPastedHttpUrl('example.net')).toBeNull()
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

  it('maps only plain horizontal arrows to table boundary caret movement', () => {
    expect(getTableBoundaryCaretDirectionForEvent({ key: 'ArrowLeft', code: '' } as KeyboardEvent)).toBe('before')
    expect(getTableBoundaryCaretDirectionForEvent({ key: '', code: 'ArrowRight' } as KeyboardEvent)).toBe('after')
    expect(getTableBoundaryCaretDirectionForEvent({ key: 'ArrowUp', code: 'ArrowUp' } as KeyboardEvent)).toBeNull()
    expect(
      getTableBoundaryCaretDirectionForEvent({
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
      } as KeyboardEvent),
    ).toBeNull()
    expect(
      getTableBoundaryCaretDirectionForEvent({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        metaKey: true,
      } as KeyboardEvent),
    ).toBeNull()
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
