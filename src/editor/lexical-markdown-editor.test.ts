import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createHeadlessLexicalMarkdownEditor,
  getHeadlessLexicalCursorSelection,
  getHeadlessLexicalMarkdown,
  isLexicalMarkdownEditor,
  restoreHeadlessLexicalCursorSelection,
  runHeadlessLexicalCommand,
  shouldNotifyLexicalMarkdownChange,
  type LexicalMarkdownEditorHandle,
} from './lexical-markdown-editor'
import type { Editor } from '@toast-ui/editor'

const lexicalMarkdownEditorSource = readFileSync(fileURLToPath(new URL('./lexical-markdown-editor.ts', import.meta.url)), 'utf8')

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
})
