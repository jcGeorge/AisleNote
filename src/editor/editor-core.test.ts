import { describe, expect, it } from 'vitest'
import {
  EDITOR_CORE_LOCAL_STORAGE_KEY,
  getEditorCoreModeForRenderer,
  getRendererForEditorCoreMode,
  isMarkdownLikelyToastHeavy,
  parseEditorCoreMode,
  readEditorCoreMode,
  resolveActiveEditorCore,
  writeEditorCoreMode,
} from './editor-core'

describe('editor core selection', () => {
  it('defaults invalid modes to auto', () => {
    expect(parseEditorCoreMode(null)).toBe('auto')
    expect(parseEditorCoreMode('unknown')).toBe('auto')
    expect(parseEditorCoreMode('mdxeditor')).toBe('auto')
    expect(parseEditorCoreMode('codemirror-live')).toBe('codemirror-live')
    expect(parseEditorCoreMode('codemirror')).toBe('codemirror')
  })

  it('detects the table-plus-external-link fixture as Toast-heavy', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) | |',
      '| --- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) | |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) | |',
      '| [findReplace](https://lucide.dev/icons/search) | |',
      '| [undo](https://lucide.dev/icons/undo) | |',
      '| [redo](https://lucide.dev/icons/redo) | |',
      '| [heading](https://lucide.dev/icons/heading) | |',
      '| [bold](https://lucide.dev/icons/bold) | |',
    ].join('\n')

    expect(isMarkdownLikelyToastHeavy(markdown)).toBe(true)
    expect(resolveActiveEditorCore('auto', markdown)).toBe('codemirror')
  })

  it('uses CodeMirror Live as the auto-mode product default', () => {
    expect(resolveActiveEditorCore('auto', '# Note\n\nA normal paragraph.')).toBe('codemirror')
    expect(resolveActiveEditorCore('codemirror-live', '# Note')).toBe('codemirror')
    expect(resolveActiveEditorCore('toast', '| [x](https://example.com) |\n| --- |')).toBe('toast')
    expect(resolveActiveEditorCore('codemirror', '# Note')).toBe('codemirror')
  })

  it('maps user-facing renderer choices to persisted editor core modes', () => {
    expect(getRendererForEditorCoreMode('auto')).toBe('codemirror')
    expect(getRendererForEditorCoreMode('codemirror-live')).toBe('codemirror')
    expect(getRendererForEditorCoreMode('codemirror')).toBe('codemirror')
    expect(getRendererForEditorCoreMode('toast')).toBe('toast')
    expect(getEditorCoreModeForRenderer('codemirror')).toBe('codemirror-live')
    expect(getEditorCoreModeForRenderer('toast')).toBe('toast')
  })

  it('reads and writes the editor core setting', () => {
    const writes: Array<[string, string]> = []
    const removals: string[] = []
    const storage = {
      getItem: (key: string) => key === EDITOR_CORE_LOCAL_STORAGE_KEY ? 'codemirror-live' : null,
      setItem: (key: string, value: string) => writes.push([key, value]),
      removeItem: (key: string) => removals.push(key),
    }

    expect(readEditorCoreMode(storage)).toBe('codemirror-live')
    expect(writeEditorCoreMode('codemirror-live', storage)).toBe(true)
    expect(writeEditorCoreMode('toast', storage)).toBe(true)
    expect(writeEditorCoreMode('auto', storage)).toBe(true)
    expect(writes).toEqual([
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'codemirror-live'],
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'toast'],
    ])
    expect(removals).toEqual([EDITOR_CORE_LOCAL_STORAGE_KEY])
  })

  it('clears stale MDXEditor settings while falling back to auto', () => {
    const removals: string[] = []
    const storage = {
      getItem: (key: string) => key === EDITOR_CORE_LOCAL_STORAGE_KEY ? 'mdxeditor' : null,
      removeItem: (key: string) => removals.push(key),
    }

    expect(readEditorCoreMode(storage)).toBe('auto')
    expect(removals).toEqual([EDITOR_CORE_LOCAL_STORAGE_KEY])
  })
})
