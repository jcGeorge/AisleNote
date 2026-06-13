import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  dispatchEditorTransaction,
  insertEditorTextOperation,
  replaceEditorMarkdownOperation,
  replaceSelectedTextWithTableOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from './editor-operation-runner'

const tableOperationSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    hardBreak: { inline: true, group: 'inline', selectable: false },
    table: { group: 'block', content: 'tableHead tableBody' },
    tableHead: { content: 'tableRow' },
    tableBody: { content: 'tableRow+' },
    tableRow: { content: '(tableHeadCell | tableBodyCell)+' },
    tableHeadCell: { content: 'paragraph+' },
    tableBodyCell: { content: 'paragraph+' },
  },
})

function createTransaction(docChanged = true) {
  return {
    docChanged,
    meta: {} as Record<string, unknown>,
    setMeta(key: string, value: unknown) {
      this.meta[key] = value
      return this
    },
    scrollIntoView: vi.fn(function scrollIntoView(this: unknown) {
      return this
    }),
  }
}

function createRuntime() {
  const transaction = createTransaction()
  const view = {
    state: {
      tr: transaction,
    },
    dispatch: vi.fn(),
  }
  const editor = {
    wwEditor: { view },
    focus: vi.fn(),
    exec: vi.fn(),
    insertText: vi.fn(),
  } as unknown as Editor & { exec: ReturnType<typeof vi.fn>; insertText: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }
  const runtime: EditorOperationRuntime = {
    editorRef: { current: editor },
    commitActiveEditorMarkdownNow: vi.fn(() => 'markdown'),
    replaceActiveEditorMarkdown: vi.fn(),
    syncToolbarFormatState: vi.fn(),
    pushToast: vi.fn(),
  }
  return { runtime, editor, view, transaction }
}

function createTableSelectionRuntime(text: string, options: { collapsed?: boolean } = {}) {
  const doc = tableOperationSchema.nodes.doc.create(null, [
    tableOperationSchema.nodes.paragraph.create(null, tableOperationSchema.text(text)),
  ])
  const from = 1
  const to = options.collapsed ? from : from + text.length
  const view = {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, from, to),
    }),
    dispatch: vi.fn((transaction) => {
      view.state = view.state.apply(transaction)
    }),
  }
  const editor = {
    wwEditor: { view },
    focus: vi.fn(),
    exec: vi.fn(),
    insertText: vi.fn(),
  } as unknown as Editor & { exec: ReturnType<typeof vi.fn>; insertText: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }
  const runtime: EditorOperationRuntime = {
    editorRef: { current: editor },
    commitActiveEditorMarkdownNow: vi.fn(() => 'markdown'),
    replaceActiveEditorMarkdown: vi.fn(),
    syncToolbarFormatState: vi.fn(),
    pushToast: vi.fn(),
  }
  return { runtime, editor, view }
}

function getFirstTable(doc: any) {
  let table: any | null = null
  doc.descendants((node: any) => {
    if (node?.type?.name !== 'table') return true
    table = node
    return false
  })
  return table
}

describe('editor operation runner', () => {
  it('dispatches content transactions with history and commits once by default', () => {
    const { runtime, editor, view, transaction } = createRuntime()

    const result = dispatchEditorTransaction(runtime, ({ view: currentView }) => currentView.state.tr)

    expect(result).toMatchObject({ handled: true, changed: true, historyPolicy: 'default' })
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
    expect(transaction.meta.addToHistory).toBeUndefined()
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledTimes(1)
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledWith(editor)
    expect(editor.focus).toHaveBeenCalled()
  })

  it('marks widget-only transactions as skipped history without committing when requested', () => {
    const { runtime, view } = createRuntime()
    const transaction = createTransaction(false)
    view.state.tr = transaction

    const result = dispatchEditorTransaction(runtime, ({ view: currentView }) => currentView.state.tr, {
      historyPolicy: 'skip',
      commitMode: 'none',
      focus: 'none',
    })

    expect(result).toMatchObject({ handled: true, changed: false, historyPolicy: 'skip', focus: 'none' })
    expect(transaction.meta.addToHistory).toBe(false)
    expect(runtime.commitActiveEditorMarkdownNow).not.toHaveBeenCalled()
  })

  it('runs Toast UI commands through the same commit and toolbar path', () => {
    const { runtime, editor } = createRuntime()

    const result = runEditorCommandOperation(runtime, 'bold', undefined, { syncToolbar: true })

    expect(result.handled).toBe(true)
    expect(editor.exec).toHaveBeenCalledWith('bold', undefined)
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledTimes(1)
    expect(runtime.syncToolbarFormatState).toHaveBeenCalledTimes(1)
  })

  it('converts selected text to a table before falling back to the Toast UI addTable command', () => {
    const selected = createTableSelectionRuntime('one\ttwo')

    const converted = replaceSelectedTextWithTableOperation(selected.runtime, { syncToolbar: true })
    const table = getFirstTable(selected.view.state.doc)

    expect(converted).toMatchObject({ handled: true, changed: true })
    expect(selected.editor.exec).not.toHaveBeenCalled()
    expect(selected.runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledTimes(1)
    expect(selected.runtime.syncToolbarFormatState).toHaveBeenCalledTimes(1)
    expect(table.child(0).child(0).child(0).textContent).toBe('one')
    expect(table.child(0).child(0).child(1).textContent).toBe('two')

    const collapsed = createTableSelectionRuntime('one\ttwo', { collapsed: true })
    expect(replaceSelectedTextWithTableOperation(collapsed.runtime, { commitMode: 'none' }).handled).toBe(false)

    runEditorCommandOperation(collapsed.runtime, 'addTable', { rowCount: 2, columnCount: 2 }, { commitMode: 'none' })
    expect(collapsed.editor.exec).toHaveBeenCalledWith('addTable', { rowCount: 2, columnCount: 2 })
  })

  it('falls back to the editor command when a table selection conversion is unavailable', () => {
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      insertText: vi.fn(),
    } as unknown as Editor & { exec: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }
    const runtime: EditorOperationRuntime = {
      editorRef: { current: editor },
      commitActiveEditorMarkdownNow: vi.fn(() => 'markdown'),
    }

    expect(replaceSelectedTextWithTableOperation(runtime, { commitMode: 'none' }).handled).toBe(false)
    expect(runEditorCommandOperation(runtime, 'addTable', { rowCount: 2, columnCount: 2 }).handled).toBe(true)
    expect(editor.exec).toHaveBeenCalledWith('addTable', { rowCount: 2, columnCount: 2 })
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledWith(editor)
  })

  it('inserts text and replaces markdown through the operation contract', () => {
    const { runtime, editor } = createRuntime()

    expect(insertEditorTextOperation(runtime, 'hello').handled).toBe(true)
    expect(editor.insertText).toHaveBeenCalledWith('hello')
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledTimes(1)

    expect(replaceEditorMarkdownOperation(runtime, 'next markdown').handled).toBe(true)
    expect(runtime.replaceActiveEditorMarkdown).toHaveBeenCalledWith('next markdown')
  })
})
