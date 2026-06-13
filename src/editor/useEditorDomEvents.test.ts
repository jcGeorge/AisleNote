import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  applyTerminalBlockDeleteBeforeInput,
  consumeHandledEmbedCaretClick,
  getEditorDictionaryContextForMenu,
  getDocumentBoundarySelectionDirectionForEvent,
  getPastedHttpUrl,
  getPastedUrlLink,
  getEditorPageMovementForEvent,
  getMultiLineDeleteInputForBeforeInputType,
  getMediaLinkDeleteDirectionForBeforeInput,
  getMediaLinkDeleteDirectionForKeyEvent,
  getMediaPlayerPointerAction,
  getPlainTextPointerChromeClosePlan,
  getTerminalBlockDeleteDirectionForBeforeInput,
  getTableBoundaryCaretDirectionForEvent,
  getTerminalBlockArrowDirectionForEvent,
  isActiveLexicalEditorContentTarget,
  isActiveWysiwygEditorContentTarget,
  isEditorToolbarInteractionTarget,
  isEditorPointerChromeTarget,
  isNotePreviewTitleContextMenuTarget,
  isUrlLinkShortcut,
  mergeEditorDictionaryContextMenu,
  moveSelectionHeadToDocumentBoundary,
  placeCaretAfterMediaPlayer,
  runMediaPlayerKeyboardAction,
  runEditorHistoryEvent,
  shouldPreventDefaultEditorContextMenu,
  shouldSkipTableExitRepairTarget,
} from './useEditorDomEvents'
import { runEditorHistoryCommand } from './editor-command'

const editorDir = dirname(fileURLToPath(import.meta.url))

function readUseEditorDomEventsSource() {
  return readFileSync(join(editorDir, 'useEditorDomEvents.ts'), 'utf8')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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
    codeBlock: {
      group: 'block',
      content: 'text*',
      code: true,
      toDOM: () => ['pre', ['code', 0]],
    },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

function fakeTarget(matchedSelector: string | null): Element {
  return {
    closest: (selector: string) => (matchedSelector && selector.includes(matchedSelector) ? {} : null),
  } as Element
}

function fakeMediaTarget(
  kind: 'audio' | 'video',
  options: { control?: boolean; title?: boolean; viewport?: boolean; controls?: boolean } = {},
): Element {
  const mediaPlayer = fakeMediaPlayer(kind, '5')
  const control = {}
  const title = {}
  const viewport = {}
  const controls = {}
  return {
    closest: (selector: string) => {
      if (selector.includes('.tabs-media-player')) return mediaPlayer
      if (options.control && selector.includes('button')) return control
      if (options.title && selector.includes('.tabs-media-title')) return title
      if (options.viewport && selector.includes('.tabs-media-viewport')) return viewport
      if (options.controls && selector.includes('.tabs-media-controls')) return controls
      return null
    },
  } as unknown as Element
}

function fakeMediaPlayer(kind: 'audio' | 'video', sourceTo: string | null): Element {
  return {
    getAttribute: (name: string) =>
      name === 'data-media-kind' ? kind : name === 'data-media-source-to' ? sourceTo : null,
  } as unknown as Element
}

function fakeKeyboardMediaPlayer(onClick: (selector: string) => void, volumeSlider?: HTMLInputElement): Element {
  return {
    querySelector: (selector: string) => {
      if (selector === '.tabs-media-volume-slider') return volumeSlider ?? null
      return {
        click: () => onClick(selector),
      }
    },
  } as unknown as Element
}

function previewParagraph(text: string) {
  return previewDeleteSchema.nodes.paragraph.create(null, text ? previewDeleteSchema.text(text) : undefined)
}

function getTextRange(doc: any, text: string): { from: number; to: number } {
  let from = 1
  let to = 1
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text === text) {
      from = pos
      to = pos + text.length
      return false
    }
    return true
  })
  return { from, to }
}

function createSelectionView(doc: any, anchor: number, head = anchor) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
  })
  const view = {
    get state() {
      return state
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
  }
  return view
}

describe('editor DOM events', () => {
  it.each([
    '.note-shared-toolbar',
    '.note-toolbar-heading-popover',
    '.toastui-editor-defaultUI-toolbar',
    '.toastui-editor-toolbar',
    '.toolbar-tool-icon',
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

  it('matches the platform URL link shortcut only with the primary modifier', () => {
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', metaKey: true } as KeyboardEvent, true)).toBe(true)
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', ctrlKey: true } as KeyboardEvent, false)).toBe(true)
    expect(isUrlLinkShortcut({ key: 'K', code: '', metaKey: true } as KeyboardEvent, true)).toBe(true)
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', ctrlKey: true } as KeyboardEvent, true)).toBe(false)
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', metaKey: true } as KeyboardEvent, false)).toBe(false)
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', metaKey: true, ctrlKey: true } as KeyboardEvent, true)).toBe(
      false,
    )
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', metaKey: true, shiftKey: true } as KeyboardEvent, true)).toBe(
      false,
    )
    expect(isUrlLinkShortcut({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true } as KeyboardEvent, false)).toBe(
      false,
    )
  })

  it('routes command-k through the active editor URL link shortcut path', () => {
    const source = readUseEditorDomEventsSource()

    expect(source).toContain('isUrlLinkShortcut(keyboardEvent, isMacPlatform)')
    expect(source).toContain('isActiveWysiwygEditorContentTarget(targetElement, view)')
    expect(source).toContain('onOpenUrlLinkShortcut()')
  })

  it('routes Lexical editor content context menus through the active editor menu path', () => {
    const source = readUseEditorDomEventsSource()

    expect(isActiveLexicalEditorContentTarget(fakeTarget('.tabs-lexical-host.is-lexical-editable .tabs-lexical-editor'), {
      __tabsEditorCore: 'lexical',
    } as any)).toBe(true)
    expect(isActiveLexicalEditorContentTarget(fakeTarget('.tabs-lexical-host.is-lexical-readonly .tabs-lexical-editor'), {
      __tabsEditorCore: 'lexical',
    } as any)).toBe(false)
    expect(source).toContain('isActiveLexicalEditorContentTarget(target, currentEditor)')
    expect(source).toContain("target.closest('.tabs-lexical-host.is-lexical-editable .tabs-lexical-editor')")
  })

  it('handles rendered Lexical and CodeMirror links without ProseMirror range scans', () => {
    const source = readUseEditorDomEventsSource()

    expect(source).toContain("target.closest<HTMLElement>('[data-tabs-link-url]')")
    expect(source).toContain('const linkHit = getRenderedEditorLinkHit(target)')
    expect(source).toContain('if (isLexicalMarkdownEditor(currentEditor) || isCodeMirrorMarkdownEditor(currentEditor)) return null')
    expect(source).toContain("recordDiagnosticEvent('editor', eventName")
  })

  it('treats editor chrome as special pointer targets outside normal text selection', () => {
    expect(isEditorPointerChromeTarget(fakeTarget('.image-tools'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.media-tools'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.table-tools'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.table-reorder-marker'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.link-prompt'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget('.aisle-toc-panel'))).toBe(true)
    expect(isEditorPointerChromeTarget(fakeTarget(null))).toBe(false)
  })

  it('lets note preview title context menus reach the preview-specific link menu handler', () => {
    expect(isNotePreviewTitleContextMenuTarget(fakeTarget('.note-context-widget .context-bar-title'))).toBe(true)
    expect(isNotePreviewTitleContextMenuTarget(fakeTarget('.context-bar-actions'))).toBe(false)

    const source = readUseEditorDomEventsSource()
    expect(source).toContain('if (isNotePreviewTitleContextMenuTarget(target)) return')
    expect(source.indexOf('if (isNotePreviewTitleContextMenuTarget(target)) return')).toBeLessThan(
      source.indexOf('openEditorContextMenu('),
    )
  })

  it('routes primary video player chrome clicks by target region', () => {
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video'), true)).toMatchObject({ type: 'select-video' })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video', { viewport: true }), true)).toMatchObject({
      type: 'toggle-video',
    })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video', { title: true }), true)).toMatchObject({
      type: 'ignore-controls',
    })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('audio', { title: true }), true)).toMatchObject({
      type: 'ignore-controls',
    })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video', { controls: true }), true)).toMatchObject({
      type: 'hide-video-tools',
    })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('audio'), true)).toMatchObject({ type: 'close-non-video' })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video', { control: true }), true)).toEqual({
      type: 'ignore-controls',
    })
    expect(getMediaPlayerPointerAction(fakeMediaTarget('video'), false)).toEqual({ type: 'ignore-controls' })
    expect(getMediaPlayerPointerAction(fakeTarget(null), true)).toEqual({ type: 'none' })
  })

  it('places the cursor after a media widget source range', () => {
    const doc = previewDeleteSchema.nodes.doc.create(null, [
      previewDeleteSchema.nodes.paragraph.create(null, previewDeleteSchema.text('song after')),
    ])
    const initialState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    })
    const view = {
      state: initialState,
      dispatch: vi.fn((transaction) => {
        view.state = view.state.apply(transaction)
      }),
      focus: vi.fn(),
    }

    expect(placeCaretAfterMediaPlayer(view, fakeMediaPlayer('audio', '5'))).toBe(true)
    expect(view.state.selection.from).toBe(5)
    expect(view.state.selection.to).toBe(5)
    expect(view.focus).toHaveBeenCalled()
  })

  it('places the cursor after the current media range when player offsets are stale', () => {
    const mediaMark = previewDeleteSchema.marks.link.create({ linkUrl: 'tabs-asset:///assets/song.mp3' })
    const doc = previewDeleteSchema.nodes.doc.create(null, [
      previewDeleteSchema.nodes.paragraph.create(null, [
        previewDeleteSchema.text('before '),
        previewDeleteSchema.text('Song', [mediaMark]),
        previewDeleteSchema.text(' after'),
      ]),
    ])
    const view = {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
      }),
      dispatch: vi.fn((transaction) => {
        view.state = view.state.apply(transaction)
      }),
      focus: vi.fn(),
      posAtDOM: vi.fn(() => 8),
    }

    expect(placeCaretAfterMediaPlayer(view, fakeMediaPlayer('audio', '5'))).toBe(true)
    expect(view.state.selection.from).toBe(12)
    expect(view.state.selection.to).toBe(12)
  })

  it('routes active media player keyboard shortcuts through player controls', () => {
    const clickedSelectors: string[] = []
    const mediaPlayer = fakeKeyboardMediaPlayer((selector) => clickedSelectors.push(selector))
    const event = {
      key: ' ',
      code: 'Space',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent

    expect(runMediaPlayerKeyboardAction(mediaPlayer, event)).toBe(true)
    expect(clickedSelectors).toEqual(['.tabs-media-play-btn'])
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('routes active media player arrow shortcuts through seek controls', () => {
    const clickedSelectors: string[] = []
    const mediaPlayer = fakeKeyboardMediaPlayer((selector) => clickedSelectors.push(selector))

    expect(
      runMediaPlayerKeyboardAction(mediaPlayer, {
        key: 'ArrowLeft',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect(
      runMediaPlayerKeyboardAction(mediaPlayer, {
        key: 'ArrowRight',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect(clickedSelectors).toEqual(['.tabs-media-back-btn', '.tabs-media-forward-btn'])
  })

  it('routes active media player vertical arrows through volume control', () => {
    const volumeSlider = {
      value: '100',
      dispatchEvent: vi.fn(),
    } as unknown as HTMLInputElement
    const mediaPlayer = fakeKeyboardMediaPlayer(vi.fn(), volumeSlider)

    expect(
      runMediaPlayerKeyboardAction(mediaPlayer, {
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect(volumeSlider.value).toBe('105')
    expect(volumeSlider.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'input' }))

    expect(
      runMediaPlayerKeyboardAction(mediaPlayer, {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect(volumeSlider.value).toBe('100')
  })

  it('consumes the follow-up click after an embed caret pointerdown', () => {
    const handledEvent = {
      cancelable: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event
    const idleEvent = {
      cancelable: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event

    expect(consumeHandledEmbedCaretClick(handledEvent, true)).toBe(true)
    expect(handledEvent.preventDefault).toHaveBeenCalled()
    expect(handledEvent.stopPropagation).toHaveBeenCalled()
    expect(consumeHandledEmbedCaretClick(idleEvent, false)).toBe(false)
    expect(idleEvent.preventDefault).not.toHaveBeenCalled()
    expect(idleEvent.stopPropagation).not.toHaveBeenCalled()
  })

  it('ignores media widgets without a valid source end position', () => {
    const doc = previewDeleteSchema.nodes.doc.create(null, [
      previewDeleteSchema.nodes.paragraph.create(null, previewDeleteSchema.text('song after')),
    ])
    const view = {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
      }),
      dispatch: vi.fn(),
    }
    const mediaPlayer = {
      getAttribute: () => null,
    } as unknown as Element

    expect(placeCaretAfterMediaPlayer(view, mediaPlayer)).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('skips table exit repair for interactive and table targets only', () => {
    expect(shouldSkipTableExitRepairTarget(fakeTarget('a'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('img'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('table'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.table-tools'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.image-tools'))).toBe(true)
    expect(shouldSkipTableExitRepairTarget(fakeTarget('.media-tools'))).toBe(true)
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
    expect(getTerminalBlockDeleteDirectionForBeforeInput('deleteContentForward')).toBe('forward')
    expect(getTerminalBlockDeleteDirectionForBeforeInput('deleteContentBackward')).toBe('backward')
    expect(getTerminalBlockDeleteDirectionForBeforeInput('insertText')).toBeNull()
  })

  it('routes beforeinput forward delete through terminal utility deletion when not multiline editing', () => {
    const preview = previewDeleteSchema.nodes.paragraph.create(null, previewDeleteSchema.text('![Linked](Linked--123abc)'))
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

    expect(applyTerminalBlockDeleteBeforeInput({
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

  it('routes beforeinput backward delete through terminal utility deletion before native block joining', () => {
    const codeBlock = previewDeleteSchema.nodes.codeBlock.create(null, previewDeleteSchema.text('code'))
    const after = previewDeleteSchema.nodes.paragraph.create(null, previewDeleteSchema.text('After'))
    const doc = previewDeleteSchema.nodes.doc.create(null, [codeBlock, after])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, codeBlock.nodeSize + 1),
    })
    const view = {
      state,
      dispatch: vi.fn(),
    }

    expect(applyTerminalBlockDeleteBeforeInput({
      inputType: 'deleteContentBackward',
      hasMultiLineEdit: false,
      view,
    })).toBe(true)

    const nextState = state.apply(view.dispatch.mock.calls[0][0])
    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('After')
    expect(nextState.selection.from).toBe(1)
  })

  it('does not route beforeinput terminal utility deletion while multiline editing is active', () => {
    expect(applyTerminalBlockDeleteBeforeInput({
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

  it('loads actionable editor dictionary context from Electron', async () => {
    const getEditorSpellcheckContext = vi.fn(async () => ({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: true,
    }))
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      setTimeout: globalThis.setTimeout,
      electronAPI: { getEditorSpellcheckContext },
    })

    await expect(getEditorDictionaryContextForMenu(10, 20)).resolves.toEqual({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: true,
    })
    expect(getEditorSpellcheckContext).toHaveBeenCalledWith({ x: 10, y: 20 })
  })

  it('retries briefly until Electron returns actionable editor dictionary context', async () => {
    vi.useFakeTimers()
    let calls = 0
    const getEditorSpellcheckContext = vi.fn(async () => {
      calls += 1
      if (calls < 3) {
        return {
          suggestions: [],
          misspelledWord: '',
          selectionText: '',
          canLookUpSelection: false,
        }
      }
      return {
        suggestions: ['receive'],
        misspelledWord: 'recieve',
        selectionText: 'recieve',
        canLookUpSelection: false,
      }
    })
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      electronAPI: { getEditorSpellcheckContext },
    })

    const result = getEditorDictionaryContextForMenu(10, 20)
    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toEqual({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: false,
    })
    expect(getEditorSpellcheckContext).toHaveBeenCalledTimes(3)
  })

  it('waits for spelling suggestions and does not use lookup-only context as a misspelling fallback', async () => {
    vi.useFakeTimers()
    let calls = 0
    const getEditorSpellcheckContext = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return {
          suggestions: [],
          misspelledWord: '',
          selectionText: 'recieve',
          canLookUpSelection: true,
        }
      }
      return {
        suggestions: ['receive'],
        misspelledWord: 'recieve',
        selectionText: 'recieve',
        canLookUpSelection: true,
      }
    })
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      electronAPI: { getEditorSpellcheckContext },
    })

    const result = getEditorDictionaryContextForMenu(10, 20)
    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toEqual({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: true,
    })
    expect(getEditorSpellcheckContext).toHaveBeenCalledTimes(2)
  })

  it('ignores lookup-only editor dictionary context without spelling suggestions', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      electronAPI: {
        getEditorSpellcheckContext: vi.fn(async () => ({
          suggestions: [],
          misspelledWord: '',
          selectionText: 'recieve',
          canLookUpSelection: true,
        })),
      },
    })

    const result = getEditorDictionaryContextForMenu(10, 20)
    await vi.advanceTimersByTimeAsync(400)

    await expect(result).resolves.toBeUndefined()
  })

  it('ignores empty editor dictionary context from Electron', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      electronAPI: {
        getEditorSpellcheckContext: vi.fn(async () => ({
          suggestions: [],
          misspelledWord: '',
          selectionText: '',
          canLookUpSelection: false,
        })),
      },
    })

    const result = getEditorDictionaryContextForMenu(10, 20)
    await vi.advanceTimersByTimeAsync(400)

    await expect(result).resolves.toBeUndefined()
  })

  it('only merges delayed dictionary context into the same open editor menu', () => {
    const sourceMenu = { type: 'editor' as const, x: 10, y: 20 }
    const dictionary = {
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: false,
    }

    expect(mergeEditorDictionaryContextMenu({ ...sourceMenu, link: undefined }, sourceMenu, dictionary)).toEqual({
      ...sourceMenu,
      link: undefined,
      dictionary,
    })
    expect(mergeEditorDictionaryContextMenu(null, sourceMenu, dictionary)).toBeNull()
    expect(mergeEditorDictionaryContextMenu({ type: 'editor', x: 11, y: 20 }, sourceMenu, dictionary)).toEqual({
      type: 'editor',
      x: 11,
      y: 20,
    })
  })

  it('opens the editor context menu before waiting for native spellcheck context', () => {
    const source = readUseEditorDomEventsSource()
    expect(source).toContain('setContextMenu(menu)')
    expect(source).toContain('mergeEditorDictionaryContextMenu(current, menu, dictionary)')
    expect(source).toContain('if (!dictionary || requestId !== editorContextMenuRequestId) return')
    expect(source).toContain('prepareEditorContextMenuEvent(mouseEvent)')
  })

  it('opens anchors from click instead of pointerdown so native caret setup can run first', () => {
    const source = readUseEditorDomEventsSource()
    expect(source).toContain("if (event.type !== 'click') return false")
    expect(source).toContain("root.addEventListener('pointerdown', handlePointerDown, true)")
    expect(source).toContain("root.addEventListener('click', handleClick, true)")
  })

  it('allows Electron editor context menus to reach native spellcheck metadata', () => {
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      electronAPI: { getEditorSpellcheckContext: vi.fn() },
    })

    expect(shouldPreventDefaultEditorContextMenu()).toBe(false)

    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      electronAPI: {},
    })

    expect(shouldPreventDefaultEditorContextMenu()).toBe(true)
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

  it('recognizes only mac command-shift vertical arrows as document-boundary selection', () => {
    expect(
      getDocumentBoundarySelectionDirectionForEvent({
        key: 'ArrowUp',
        code: 'ArrowUp',
        metaKey: true,
        shiftKey: true,
      } as KeyboardEvent, true),
    ).toBe('start')
    expect(
      getDocumentBoundarySelectionDirectionForEvent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        metaKey: true,
        shiftKey: true,
      } as KeyboardEvent, true),
    ).toBe('end')
    expect(
      getDocumentBoundarySelectionDirectionForEvent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        metaKey: true,
        shiftKey: true,
      } as KeyboardEvent, false),
    ).toBeNull()
    expect(
      getDocumentBoundarySelectionDirectionForEvent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        metaKey: true,
        shiftKey: true,
        altKey: true,
      } as KeyboardEvent, true),
    ).toBeNull()
  })

  it('moves a collapsed selection head to document boundaries while preserving its anchor', () => {
    const doc = previewDeleteSchema.nodes.doc.create(null, [
      previewParagraph('one'),
      previewParagraph('two'),
      previewParagraph('three'),
    ])
    const oneRange = getTextRange(doc, 'one')
    const twoRange = getTextRange(doc, 'two')
    const threeRange = getTextRange(doc, 'three')
    const upView = createSelectionView(doc, twoRange.to)
    const downView = createSelectionView(doc, twoRange.from)

    expect(moveSelectionHeadToDocumentBoundary(upView, 'start')).toBe(true)
    expect(upView.state.selection.anchor).toBe(twoRange.to)
    expect(upView.state.selection.head).toBe(oneRange.from)

    expect(moveSelectionHeadToDocumentBoundary(downView, 'end')).toBe(true)
    expect(downView.state.selection.anchor).toBe(twoRange.from)
    expect(downView.state.selection.head).toBe(threeRange.to)
  })

  it('moves only the selection head for forward and reverse text selections', () => {
    const doc = previewDeleteSchema.nodes.doc.create(null, [
      previewParagraph('one'),
      previewParagraph('two'),
      previewParagraph('three'),
    ])
    const oneRange = getTextRange(doc, 'one')
    const twoRange = getTextRange(doc, 'two')
    const threeRange = getTextRange(doc, 'three')
    const forwardView = createSelectionView(doc, oneRange.from, twoRange.to)
    const reverseView = createSelectionView(doc, twoRange.to, oneRange.from)

    expect(moveSelectionHeadToDocumentBoundary(forwardView, 'end')).toBe(true)
    expect(forwardView.state.selection.anchor).toBe(oneRange.from)
    expect(forwardView.state.selection.head).toBe(threeRange.to)

    expect(moveSelectionHeadToDocumentBoundary(reverseView, 'end')).toBe(true)
    expect(reverseView.state.selection.anchor).toBe(twoRange.to)
    expect(reverseView.state.selection.head).toBe(threeRange.to)
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

  it('maps only plain vertical arrows to terminal block boundary caret movement', () => {
    expect(getTerminalBlockArrowDirectionForEvent({ key: 'ArrowUp', code: '' } as KeyboardEvent)).toBe('up')
    expect(getTerminalBlockArrowDirectionForEvent({ key: '', code: 'ArrowDown' } as KeyboardEvent)).toBe('down')
    expect(getTerminalBlockArrowDirectionForEvent({ key: 'ArrowLeft', code: 'ArrowLeft' } as KeyboardEvent)).toBeNull()
    expect(
      getTerminalBlockArrowDirectionForEvent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        shiftKey: true,
      } as KeyboardEvent),
    ).toBeNull()
    expect(
      getTerminalBlockArrowDirectionForEvent({
        key: 'ArrowUp',
        code: 'ArrowUp',
        altKey: true,
      } as KeyboardEvent),
    ).toBeNull()
  })

  it('maps only plain delete keys and delete beforeinput events to media link deletion', () => {
    expect(getMediaLinkDeleteDirectionForKeyEvent({ key: 'Backspace', code: '' } as KeyboardEvent)).toBe('backward')
    expect(getMediaLinkDeleteDirectionForKeyEvent({ key: '', code: 'Delete' } as KeyboardEvent)).toBe('forward')
    expect(
      getMediaLinkDeleteDirectionForKeyEvent({
        key: 'Backspace',
        code: 'Backspace',
        altKey: true,
      } as KeyboardEvent),
    ).toBeNull()
    expect(getMediaLinkDeleteDirectionForBeforeInput({ inputType: 'deleteContentBackward' } as InputEvent)).toBe(
      'backward',
    )
    expect(getMediaLinkDeleteDirectionForBeforeInput({ inputType: 'deleteContentForward' } as InputEvent)).toBe(
      'forward',
    )
    expect(getMediaLinkDeleteDirectionForBeforeInput({ inputType: 'insertText' } as InputEvent)).toBeNull()
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
