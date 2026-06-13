import { describe, expect, it } from 'vitest'
import {
  EDITOR_CORE_LOCAL_STORAGE_KEY,
  USER_FACING_EDITOR_RENDERERS,
  USER_SELECTABLE_EDITOR_CORE_MODES,
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
    expect(parseEditorCoreMode('lexical')).toBe('lexical')
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
    expect(resolveActiveEditorCore('auto', markdown)).toBe('lexical')
  })

  it('uses Lexical as the auto-mode and legacy CodeMirror fallback product default', () => {
    expect(resolveActiveEditorCore('auto', '# Note\n\nA normal paragraph.')).toBe('lexical')
    expect(resolveActiveEditorCore('codemirror-live', '# Note')).toBe('lexical')
    expect(resolveActiveEditorCore('toast', '| [x](https://example.com) |\n| --- |')).toBe('toast')
    expect(resolveActiveEditorCore('codemirror', '# Note')).toBe('lexical')
    expect(resolveActiveEditorCore('lexical', '| copy |\n| --- |')).toBe('lexical')
  })

  it('maps user-facing renderer choices to persisted editor core modes', () => {
    expect(USER_FACING_EDITOR_RENDERERS).toEqual(['toast', 'lexical'])
    expect(USER_SELECTABLE_EDITOR_CORE_MODES).toEqual(['toast', 'lexical'])
    expect(getRendererForEditorCoreMode('auto')).toBe('lexical')
    expect(getRendererForEditorCoreMode('codemirror-live')).toBe('lexical')
    expect(getRendererForEditorCoreMode('codemirror')).toBe('lexical')
    expect(getRendererForEditorCoreMode('lexical')).toBe('lexical')
    expect(getRendererForEditorCoreMode('toast')).toBe('toast')
    expect(getEditorCoreModeForRenderer('lexical')).toBe('lexical')
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

    expect(readEditorCoreMode(storage)).toBe('lexical')
    expect(writeEditorCoreMode('codemirror-live', storage)).toBe(true)
    expect(writeEditorCoreMode('lexical', storage)).toBe(true)
    expect(writeEditorCoreMode('toast', storage)).toBe(true)
    expect(writeEditorCoreMode('auto', storage)).toBe(true)
    expect(writes).toEqual([
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical'],
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical'],
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical'],
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'toast'],
      [EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical'],
    ])
    expect(removals).toEqual([])
  })

  it('clears stale MDXEditor settings while falling back to Lexical', () => {
    const writes: Array<[string, string]> = []
    const removals: string[] = []
    const storage = {
      getItem: (key: string) => key === EDITOR_CORE_LOCAL_STORAGE_KEY ? 'mdxeditor' : null,
      setItem: (key: string, value: string) => writes.push([key, value]),
      removeItem: (key: string) => removals.push(key),
    }

    expect(readEditorCoreMode(storage)).toBe('lexical')
    expect(removals).toEqual([EDITOR_CORE_LOCAL_STORAGE_KEY])
    expect(writes).toEqual([[EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical']])
  })
})
