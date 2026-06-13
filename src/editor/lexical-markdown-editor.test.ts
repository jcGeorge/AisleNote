import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createHeadlessLexicalMarkdownEditor,
  getHeadlessLexicalCursorSelection,
  getHeadlessLexicalMarkdown,
  isLexicalMarkdownEditor,
  LEXICAL_MARKDOWN_EXPORT_DEBOUNCE_MS,
  repairLexicalMarkdownForImport,
  restoreHeadlessLexicalCursorSelection,
  runHeadlessLexicalCommand,
  shouldNotifyLexicalMarkdownChange,
  type LexicalMarkdownEditorHandle,
} from './lexical-markdown-editor'
import type { Editor } from '@toast-ui/editor'

const lexicalMarkdownEditorSource = readFileSync(fileURLToPath(new URL('./lexical-markdown-editor.ts', import.meta.url)), 'utf8')
const corruptedAisleThreeFixture = [
  '---',
  'tags: []',
  'status: ""',
  'created: 2026-06-11',
  'updated: 2026-06-11T22:59:25.702Z',
  '---',
  '# Third, probably',
  '**Alright**',
  '*Italics*',
  '==highlighted==',
  '> block quote?',
  '> ~~strikeout!~~',
  '>',
  '> \\*\\*\\*',
  '* dash',
  '* bullet',
  '1. numbered',
  '* [ ] task',
  '  Tab indent here <--',
  '\\*\\*\\*',
  '  asdf',
  '  asdf',
  '  asdf',
  '^-- block quote indent',
  '![sparkSubtab](<sparkSubtab--97c129#last position>)',
  'Preview --^',
  '',
  '```',
  'My code block here',
  '```',
  '| inline code --> | `here!!` |',
  '| --------------- | ------ |',
  '|',
  '\\|',
].join('\n')

describe('Lexical markdown adapter', () => {
  it('identifies Lexical editor handles', () => {
    const handle = { __tabsEditorCore: 'lexical' } as LexicalMarkdownEditorHandle

    expect(isLexicalMarkdownEditor(handle as unknown as Editor)).toBe(true)
    expect(isLexicalMarkdownEditor({ __tabsEditorCore: 'codemirror' } as unknown as Editor)).toBe(false)
    expect(isLexicalMarkdownEditor(null)).toBe(false)
  })

  it('round-trips common Markdown blocks through the Lexical transformer set', () => {
    const markdown = [
      '# Heading',
      '',
      'A [link](https://example.com) with **bold**, *italic*, ~~strike~~, ==highlight==, and `code`.',
      '',
      '- bullet',
      '1. ordered',
      '> quote',
      '',
      '```',
      'code block',
      '```',
      '',
      '---',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)
    const persisted = getHeadlessLexicalMarkdown(editor)

    expect(persisted).toContain('# Heading')
    expect(persisted).toContain('[link](https://example.com)')
    expect(persisted).toContain('**bold**')
    expect(persisted).toContain('*italic*')
    expect(persisted).toContain('~~strike~~')
    expect(persisted).toContain('==highlight==')
    expect(persisted).toContain('`code`')
    expect(persisted).toContain('- bullet')
    expect(persisted).toContain('1. ordered')
    expect(persisted).toContain('> quote')
    expect(persisted).toContain('```')
    expect(persisted).toContain('code block')
    expect(persisted).toContain('---')
  })

  it('preserves visual blank-line spacing through Markdown import and export', () => {
    const markdown = [
      'First paragraph.',
      '',
      '',
      'Second paragraph after a larger gap.',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe(markdown)
  })

  it('repairs the attached aisle fixture corruption before Lexical persists it again', () => {
    const editor = createHeadlessLexicalMarkdownEditor(corruptedAisleThreeFixture)
    const persisted = getHeadlessLexicalMarkdown(editor)

    expect(persisted).toContain('> ---')
    expect(persisted).toContain('> \n')
    expect(persisted).toContain('\n---')
    expect(persisted).toContain('- dash')
    expect(persisted).toContain('* bullet')
    expect(persisted).toContain('* [ ] task')
    expect(persisted).toContain('![sparkSubtab](<sparkSubtab--97c129#last position>)')
    expect(persisted).toContain('Preview --^')
    expect(persisted).toContain('^-- block quote indent')
    expect(persisted).not.toContain('\\*\\*\\*')
    expect(persisted).not.toContain('![sparkSubtab](<<sparkSubtab--97c129#last position>>)')
    expect(persisted).not.toMatch(/\n\\?\|\s*$/)
  })

  it('round-trips all app annotation arrow markers through inline Lexical nodes', () => {
    const markdown = [
      'Preview ^--',
      'Preview --^',
      'Preview v--',
      'Preview --v',
      'Preview <--',
      'Preview -->',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe(markdown)
  })

  it('preserves source spellings for thematic breaks and list markers', () => {
    const markdown = [
      '---',
      '',
      '***',
      '',
      '___',
      '',
      '- dash',
      '* bullet',
      '+ plus',
      '* [ ] task',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe(markdown)
  })

  it('repairs escaped thematic break lines without unescaping ordinary prose', () => {
    const markdown = [
      'literal \\*\\*\\* should stay literal',
      '\\*\\*\\*',
      '> \\*\\*\\*',
    ].join('\n')

    expect(repairLexicalMarkdownForImport(markdown)).toBe([
      'literal \\*\\*\\* should stay literal',
      '---',
      '> ---',
    ].join('\n'))
  })

  it('round-trips one-column GFM tables as native Lexical table nodes', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |',
      '| --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe(markdown)
  })

  it('round-trips one-row and one-column normal-cell tables without malformed tail rows', () => {
    const markdown = '| inline code --> | `here!!` |\n| --- | --- |\n|\n\\|'
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe('| inline code --> | `here!!` |\n| --- | --- |')
  })

  it('preserves link-heavy table cells for the tbCopy case', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |',
      '| --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
      '| [findReplace](https://lucide.dev/icons/search) |',
      '| [undo](https://lucide.dev/icons/undo) |',
      '| [redo](https://lucide.dev/icons/redo) |',
      '| [heading](https://lucide.dev/icons/heading) |',
      '| [bold](https://lucide.dev/icons/bold) |',
      '| [italic](https://lucide.dev/icons/italic) |',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)
    const persisted = getHeadlessLexicalMarkdown(editor)

    expect(persisted).toContain('| [copy](https://lucide.dev/icons/files) |')
    expect(persisted).toContain('| [tableOfContents](https://lucide.dev/icons/table-of-contents) |')
    expect(persisted).toContain('| [italic](https://lucide.dev/icons/italic) |')
    expect(persisted.split('\n')).toHaveLength(10)
  })

  it('preserves note reference tokens through Lexical Markdown import/export', () => {
    const markdown = [
      '[[Target--abc123|Alias]]',
      '![[Embedded--def456]]',
      '[old](#tabs-note/body-1?domainId=domain&spaceId=space&tabId=parent)',
      '![preview](<#tabs-note/body-1?domainId=domain&spaceId=space&tabId=parent>)',
    ].join('\n')
    const editor = createHeadlessLexicalMarkdownEditor(markdown)

    expect(getHeadlessLexicalMarkdown(editor)).toBe(markdown)
  })

  it('repairs raw spark preview image tokens to canonical preview tokens', () => {
    const editor = createHeadlessLexicalMarkdownEditor('![sparkSubtab](<sparkSubtab--97c129#last position>)')

    expect(getHeadlessLexicalMarkdown(editor)).toBe('![sparkSubtab](<sparkSubtab--97c129#last position>)')
  })

  it('repairs double-angle preview tokens back to canonical single-angle syntax', () => {
    const editor = createHeadlessLexicalMarkdownEditor('![sparkSubtab](<<sparkSubtab--97c129#last position>>)')

    expect(getHeadlessLexicalMarkdown(editor)).toBe('![sparkSubtab](<sparkSubtab--97c129#last position>)')
  })

  it('does not notify storage for selection-only Lexical updates', () => {
    expect(
      shouldNotifyLexicalMarkdownChange({
        dirtyElementCount: 0,
        dirtyLeafCount: 0,
        nextMarkdown: '',
        lastNotifiedMarkdown: '# Note',
      }),
    ).toBe(false)
  })

  it('loads initial Markdown before DOM attachment can publish the blank root state', () => {
    const initialImportIndex = lexicalMarkdownEditorSource.indexOf('setMarkdownInEditor(lexicalEditor, latestMarkdown)')
    const updateListenerIndex = lexicalMarkdownEditorSource.indexOf('lexicalEditor.registerUpdateListener')
    const rootAttachmentIndex = lexicalMarkdownEditorSource.indexOf('lexicalEditor.setRootElement(editableRoot)')

    expect(initialImportIndex).toBeGreaterThan(-1)
    expect(updateListenerIndex).toBeGreaterThan(-1)
    expect(rootAttachmentIndex).toBeGreaterThan(-1)
    expect(initialImportIndex).toBeLessThan(updateListenerIndex)
    expect(initialImportIndex).toBeLessThan(rootAttachmentIndex)
  })

  it('supports read-only Lexical surfaces without letting them publish storage changes', () => {
    expect(lexicalMarkdownEditorSource).toContain('editable?: boolean')
    expect(lexicalMarkdownEditorSource).toContain('if (!currentEditable) return')
    expect(lexicalMarkdownEditorSource).toContain('setEditable: applyEditableState')
    expect(lexicalMarkdownEditorSource).toContain("root.classList.toggle('is-lexical-readonly', !nextEditable)")
  })

  it('debounces expensive Markdown export for dirty Lexical updates', () => {
    expect(LEXICAL_MARKDOWN_EXPORT_DEBOUNCE_MS).toBe(450)
    expect(lexicalMarkdownEditorSource).toContain('pendingMarkdownDirty = true')
    expect(lexicalMarkdownEditorSource).toContain('schedulePendingMarkdownExport()')
    expect(lexicalMarkdownEditorSource).not.toContain('editorState.read(() => {\n        nextMarkdown = exportMarkdownFromEditor()')
  })

  it('exposes cached and flush APIs for cheap read-only snapshots', () => {
    expect(lexicalMarkdownEditorSource).toContain('getCachedMarkdown: () => latestMarkdown')
    expect(lexicalMarkdownEditorSource).toContain('hasPendingMarkdownChanges: () => pendingMarkdownDirty')
    expect(lexicalMarkdownEditorSource).toContain('flushPendingMarkdown:')
    expect(lexicalMarkdownEditorSource).toContain("getMarkdown: () => materializePendingMarkdown({ notify: false, reason: 'get-markdown' })")
  })

  it('wires Lexical-only app surface behavior through the adapter handle', () => {
    expect(lexicalMarkdownEditorSource).toContain('LexicalAnnotationArrowNode')
    expect(lexicalMarkdownEditorSource).toContain('createNotePreviewWidgetElement')
    expect(lexicalMarkdownEditorSource).toContain('isIsolated(): true')
    expect(lexicalMarkdownEditorSource).toContain('isKeyboardSelectable(): boolean')
    expect(lexicalMarkdownEditorSource).toContain('data-tabs-lexical-list-item-key')
    expect(lexicalMarkdownEditorSource).toContain('data-tabs-list-item-marker')
    expect(lexicalMarkdownEditorSource).toContain('registerMarkdownShortcuts(lexicalEditor, LEXICAL_MARKDOWN_TRANSFORMERS)')
    expect(lexicalMarkdownEditorSource).toContain('transformTaskShortcutTextNode')
    expect(lexicalMarkdownEditorSource).toContain('transformLexicalTextNode')
    expect(lexicalMarkdownEditorSource).toContain('createLexicalCodeBlockControls')
    expect(lexicalMarkdownEditorSource).toContain('moveLexicalSelectionOutOfTable')
    expect(lexicalMarkdownEditorSource).toContain('moveLexicalSelectionOutOfTableByTab')
    expect(lexicalMarkdownEditorSource).toContain('moveLexicalSelectionOutOfTerminalTable')
    expect(lexicalMarkdownEditorSource).toContain('replaceSelectedEmptyQuoteWithParagraph')
    expect(lexicalMarkdownEditorSource).toContain('$createRangeSelectionFromDom(selection, editor)')
    expect(lexicalMarkdownEditorSource).toContain("event.key === 'Escape'")
    expect(lexicalMarkdownEditorSource).toContain('getNoteMentionQuery:')
    expect(lexicalMarkdownEditorSource).toContain('replaceTextRangeWithLink:')
  })

  it('notifies storage only when a document update changes Markdown', () => {
    expect(
      shouldNotifyLexicalMarkdownChange({
        dirtyElementCount: 1,
        dirtyLeafCount: 0,
        nextMarkdown: '# Note',
        lastNotifiedMarkdown: '# Note',
      }),
    ).toBe(false)

    expect(
      shouldNotifyLexicalMarkdownChange({
        dirtyElementCount: 0,
        dirtyLeafCount: 1,
        nextMarkdown: '# Note edited',
        lastNotifiedMarkdown: '# Note',
      }),
    ).toBe(true)
  })

  it('supports cursor read and clamped restore in headless Lexical state', () => {
    const editor = createHeadlessLexicalMarkdownEditor('hello world')

    expect(restoreHeadlessLexicalCursorSelection(editor, { anchor: 99, head: 2 }, { focus: false })).toBe(true)
    expect(getHeadlessLexicalCursorSelection(editor)).toEqual({ anchor: 11, head: 2 })
  })

  it('inserts native tables from the addTable command and exports them as GFM', () => {
    const editor = createHeadlessLexicalMarkdownEditor('before')

    runHeadlessLexicalCommand(editor, 'addTable', { rowCount: 2, columnCount: 1 })

    expect(getHeadlessLexicalMarkdown(editor)).toContain('|  |\n| --- |\n|  |')
  })

  it('keeps inserted Lexical tables as normal cells instead of header cells', () => {
    expect(lexicalMarkdownEditorSource).toContain('includeHeaders: { rows: false, columns: false }')
    expect(lexicalMarkdownEditorSource).toContain('TableCellHeaderStates.NO_STATUS')
    expect(lexicalMarkdownEditorSource).not.toContain('rowIndex === 0 ? TableCellHeaderStates.ROW')
  })
})
