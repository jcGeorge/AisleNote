import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  dispatchEditorTransaction,
  insertEditorTextOperation,
  replaceEditorMarkdownOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from './editor-operation-runner'

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

  it('inserts text and replaces markdown through the operation contract', () => {
    const { runtime, editor } = createRuntime()

    expect(insertEditorTextOperation(runtime, 'hello').handled).toBe(true)
    expect(editor.insertText).toHaveBeenCalledWith('hello')
    expect(runtime.commitActiveEditorMarkdownNow).toHaveBeenCalledTimes(1)

    expect(replaceEditorMarkdownOperation(runtime, 'next markdown').handled).toBe(true)
    expect(runtime.replaceActiveEditorMarkdown).toHaveBeenCalledWith('next markdown')
  })
})
